import asyncio
from datetime import timedelta

from fastapi import BackgroundTasks
from sqlalchemy import select, update
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.core.rate_limit import rate_limiter
from app.api.routes.auth import schedule_code_email
from app.core.security import PURPOSE_ACCESS, PURPOSE_CONFIRM_EMAIL, create_token
from app.services import auth as auth_service

from app.models.user import User, utc_now
from app.models.verification_code import VerificationCode
from tests.conftest import register_and_confirm


PASSWORD = "correct-horse"


def test_register_creates_unconfirmed_account_and_sends_email(client, email_sender):
    response = client.post(
        "/api/auth/register",
        json={"name": "Ana", "email": "Ana@Example.com", "password": PASSWORD},
    )
    assert response.status_code == 201
    assert len(email_sender.sent) == 1
    assert email_sender.sent[0]["to"] == "ana@example.com"




def test_register_rejects_short_password(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Ana", "email": "ana@example.com", "password": "short"},
    )
    assert response.status_code == 422


def test_login_is_blocked_until_email_is_confirmed(client, email_sender):
    client.post("/api/auth/register", json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD})
    response = client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert response.status_code == 403


def test_confirm_email_then_login_returns_token(client, email_sender):
    client.post("/api/auth/register", json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD})
    confirm = client.post(
        "/api/auth/confirm-email",
        json={"email": "ana@example.com", "code": email_sender.code_from_last_email()},
    )
    assert confirm.status_code == 200

    login = client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert login.status_code == 200
    body = login.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 7 * 24 * 60 * 60


def wrong_code(correct_code: str) -> str:
    """A 6-digit code guaranteed to differ from the given correct one."""
    return "000000" if correct_code != "000000" else "111111"


def test_confirm_email_rejects_wrong_code(client, email_sender):
    client.post("/api/auth/register", json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD})
    correct_code = email_sender.code_from_last_email()
    response = client.post(
        "/api/auth/confirm-email",
        json={"email": "ana@example.com", "code": wrong_code(correct_code)},
    )
    assert response.status_code == 400


def test_login_rejects_wrong_password(client, email_sender):
    register_and_confirm(client, email_sender)
    response = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "wrong-password"})
    assert response.status_code == 401


def test_me_returns_logged_in_user(client, email_sender):
    token = register_and_confirm(client, email_sender, name="Ana")
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["name"] == "Ana"


def test_me_requires_a_session(client):
    assert client.get("/api/auth/me").status_code == 401


def test_confirmation_code_cannot_be_used_as_session(client, email_sender):
    client.post("/api/auth/register", json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD})
    confirm_code = email_sender.code_from_last_email()
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {confirm_code}"})
    assert response.status_code == 401


def test_forgot_password_gives_same_answer_for_unknown_email(client, email_sender):
    response = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 202
    assert email_sender.sent == []


def test_password_reset_works_once(client, email_sender):
    register_and_confirm(client, email_sender)
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    code = email_sender.code_from_last_email()

    verify = client.post("/api/auth/verify-reset-code", json={"email": "ana@example.com", "code": code})
    assert verify.status_code == 200
    reset_token = verify.json()["reset_token"]

    first = client.post("/api/auth/reset-password", json={"reset_token": reset_token, "new_password": "new-password-123"})
    assert first.status_code == 200

    reused = client.post("/api/auth/reset-password", json={"reset_token": reset_token, "new_password": "another-pass-456"})
    assert reused.status_code == 400

    login = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "new-password-123"})
    assert login.status_code == 200


def test_verify_reset_code_rejects_expired_code(client, email_sender, db_engine):
    register_and_confirm(client, email_sender)
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    code = email_sender.code_from_last_email()

    session = sessionmaker(bind=db_engine)()
    user = session.query(User).filter_by(email="ana@example.com").one()
    row = (
        session.query(VerificationCode)
        .filter_by(user_id=user.id, purpose="reset_password", consumed=False)
        .order_by(VerificationCode.created_at.desc())
        .first()
    )
    row.expires_at = utc_now() - timedelta(seconds=1)
    session.commit()
    session.close()

    response = client.post("/api/auth/verify-reset-code", json={"email": "ana@example.com", "code": code})
    assert response.status_code == 400

    # The expired code never changed anything: the original password still works.
    login = client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert login.status_code == 200


def test_confirm_email_locks_out_after_max_attempts(client, email_sender):
    client.post("/api/auth/register", json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD})
    correct_code = email_sender.code_from_last_email()
    bad_code = wrong_code(correct_code)

    for _ in range(5):
        response = client.post("/api/auth/confirm-email", json={"email": "ana@example.com", "code": bad_code})
        assert response.status_code == 400

    # Even the correct code is now rejected: attempts are exhausted.
    final = client.post("/api/auth/confirm-email", json={"email": "ana@example.com", "code": correct_code})
    assert final.status_code == 400


REGISTER_MESSAGE = (
    "Si el email se puede registrar, te enviamos un código para confirmar tu cuenta. "
    "Si ya tenés cuenta, iniciá sesión."
)


def register(client, name="Ana", email="ana@example.com", password=PASSWORD):
    return client.post("/api/auth/register", json={"name": name, "email": email, "password": password})


def age_codes(db_engine, seconds: int) -> None:
    """Pretend every stored code was created `seconds` earlier (to step past cooldowns)."""
    with sessionmaker(bind=db_engine)() as db:
        for row in db.scalars(select(VerificationCode)):
            row.created_at = row.created_at - timedelta(seconds=seconds)
        db.commit()


def user_count(db_engine) -> int:
    with sessionmaker(bind=db_engine)() as db:
        return len(db.scalars(select(User)).all())


# --- email escaping ---

HOSTILE_NAME = '<a href="http://evil.test">click</a>'


def test_confirmation_email_escapes_the_user_name(client, email_sender):
    register(client, name=HOSTILE_NAME)
    html = email_sender.sent[-1]["html"]
    assert "<a href" not in html
    assert "&lt;a href=" in html


def test_reset_email_escapes_the_user_name(client, email_sender):
    register_and_confirm(client, email_sender, name=HOSTILE_NAME)
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    html = email_sender.sent[-1]["html"]
    assert "Contraseña" in html or "contraseña" in html
    assert "<a href" not in html
    assert "&lt;a href=" in html


# --- register: non-enumerating ---

def test_register_answers_201_with_the_same_message_for_new_unconfirmed_and_confirmed(client, email_sender, db_engine):
    new = register(client)
    unconfirmed = register(client, name="Otra", password="another-password")
    client.post("/api/auth/confirm-email", json={"email": "ana@example.com", "code": email_sender.code_from_last_email()})
    confirmed = register(client, name="Otra", password="another-password")

    for response in (new, unconfirmed, confirmed):
        assert response.status_code == 201
        assert response.json() == {"message": REGISTER_MESSAGE}
    assert user_count(db_engine) == 1


def test_register_for_a_confirmed_email_sends_nothing(client, email_sender):
    register_and_confirm(client, email_sender)
    sent_before = len(email_sender.sent)
    register(client)
    assert len(email_sender.sent) == sent_before


def test_register_for_unconfirmed_email_reissues_code_and_takes_the_new_credentials(client, email_sender, db_engine):
    register(client, name="Primero", password="first-attempt-password")
    age_codes(db_engine, 120)
    register(client, name="Ana", password=PASSWORD)
    assert len(email_sender.sent) == 2

    with sessionmaker(bind=db_engine)() as db:
        user = db.scalar(select(User).where(User.email == "ana@example.com"))
        assert user.name == "Ana"
    client.post("/api/auth/confirm-email", json={"email": "ana@example.com", "code": email_sender.code_from_last_email()})
    assert client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD}).status_code == 200
    # The earlier password no longer works, so a pre-registration cannot keep access to the account.
    assert client.post("/api/auth/login", json={"email": "ana@example.com", "password": "first-attempt-password"}).status_code == 401


def test_register_survives_a_concurrent_insert(client, email_sender, db_engine, monkeypatch):
    register(client)
    real_lookup = auth_service.get_user_by_email
    calls = {"count": 0}

    def lookup_missing_the_first_time(db, email):
        calls["count"] += 1
        return None if calls["count"] == 1 else real_lookup(db, email)

    monkeypatch.setattr(auth_service, "get_user_by_email", lookup_missing_the_first_time)
    response = register(client, name="Race")
    assert response.status_code == 201
    assert response.json() == {"message": REGISTER_MESSAGE}
    assert user_count(db_engine) == 1


def test_register_returns_201_even_if_the_email_cannot_be_sent(client, email_sender, monkeypatch):
    def failing_send(*args, **kwargs):
        raise RuntimeError("resend is down")

    monkeypatch.setattr(email_sender, "send", failing_send)
    response = register(client)
    assert response.status_code == 201
    assert response.json() == {"message": REGISTER_MESSAGE}


def test_a_failed_send_does_not_count_against_the_cooldown(client, email_sender, monkeypatch):
    original_send = email_sender.send

    def failing_send(*args, **kwargs):
        raise RuntimeError("smtp is down")

    monkeypatch.setattr(email_sender, "send", failing_send)
    register(client)
    monkeypatch.setattr(email_sender, "send", original_send)

    client.post("/api/auth/resend-confirmation", json={"email": "ana@example.com"})
    assert len(email_sender.sent) == 1


# --- email delivery: background or inline ---

def schedule(email_sender, db_engine, user_id):
    tasks = BackgroundTasks()
    session_factory = sessionmaker(bind=db_engine, expire_on_commit=False)
    schedule_code_email(tasks, session_factory, email_sender, user_id, PURPOSE_CONFIRM_EMAIL)
    return tasks


def existing_user_id(db_engine):
    with sessionmaker(bind=db_engine)() as db:
        return db.scalar(select(User.id).where(User.email == "ana@example.com"))


def test_code_email_is_deferred_until_after_the_response(client, email_sender, db_engine):
    register(client)
    age_codes(db_engine, 120)
    email_sender.sent.clear()

    tasks = schedule(email_sender, db_engine, existing_user_id(db_engine))
    assert email_sender.sent == []
    assert len(tasks.tasks) == 1

    asyncio.run(tasks())
    assert len(email_sender.sent) == 1


def test_code_email_can_be_sent_inline(client, email_sender, db_engine, monkeypatch):
    monkeypatch.setattr(get_settings(), "email_send_in_background", False)
    register(client)
    age_codes(db_engine, 120)
    email_sender.sent.clear()

    tasks = schedule(email_sender, db_engine, existing_user_id(db_engine))
    assert len(email_sender.sent) == 1
    assert len(tasks.tasks) == 0


# --- code verification: races and timing ---

def test_a_code_cannot_be_used_by_two_parallel_requests(client, email_sender, db_engine, monkeypatch):
    register(client)
    code = email_sender.code_from_last_email()
    real_verify = auth_service.verify_password

    def verify_while_another_request_wins(candidate, hash_):
        with sessionmaker(bind=db_engine)() as db:
            db.execute(update(VerificationCode).values(consumed=True))
            db.commit()
        return real_verify(candidate, hash_)

    monkeypatch.setattr(auth_service, "verify_password", verify_while_another_request_wins)
    response = client.post("/api/auth/confirm-email", json={"email": "ana@example.com", "code": code})
    assert response.status_code == 400


def test_attempts_are_claimed_against_the_database_not_a_stale_read(client, email_sender, db_engine, monkeypatch):
    register(client)
    code = email_sender.code_from_last_email()
    real_as_aware_utc = auth_service.as_aware_utc

    def exhaust_attempts_after_the_row_was_read(value):
        with sessionmaker(bind=db_engine)() as db:
            db.execute(update(VerificationCode).values(attempts=get_settings().verification_code_max_attempts))
            db.commit()
        return real_as_aware_utc(value)

    monkeypatch.setattr(auth_service, "as_aware_utc", exhaust_attempts_after_the_row_was_read)
    response = client.post("/api/auth/confirm-email", json={"email": "ana@example.com", "code": code})
    assert response.status_code == 400


def test_unknown_email_spends_hashing_time_on_code_checks(client, monkeypatch):
    calls = []
    real_verify = auth_service.verify_password
    monkeypatch.setattr(auth_service, "verify_password", lambda c, h: calls.append(h) or real_verify(c, h))
    response = client.post("/api/auth/confirm-email", json={"email": "nadie@example.com", "code": "123456"})
    assert response.status_code == 400
    assert calls == [auth_service._DUMMY_PASSWORD_HASH]


# --- per-email limits ---

def test_cooldown_blocks_a_second_code_and_keeps_the_first_valid(client, email_sender):
    register(client)
    first_code = email_sender.code_from_last_email()
    first = client.post("/api/auth/resend-confirmation", json={"email": "ana@example.com"})
    unknown = client.post("/api/auth/resend-confirmation", json={"email": "nobody@example.com"})

    assert len(email_sender.sent) == 1
    assert first.status_code == unknown.status_code == 202
    assert first.json() == unknown.json()
    confirm = client.post("/api/auth/confirm-email", json={"email": "ana@example.com", "code": first_code})
    assert confirm.status_code == 200


def test_forgot_password_cooldown_gives_the_same_response(client, email_sender):
    register_and_confirm(client, email_sender)
    first = client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    sent_after_first = len(email_sender.sent)
    second = client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    assert len(email_sender.sent) == sent_after_first
    assert (first.status_code, first.json()) == (second.status_code, second.json())


def test_hourly_cap_blocks_the_sixth_code_until_the_hour_rolls(client, email_sender, db_engine):
    register_and_confirm(client, email_sender)
    sent_before = len(email_sender.sent)
    cap = get_settings().verification_code_max_per_hour

    for _ in range(cap + 2):
        rate_limiter.reset()  # The IP limit is a separate mechanism; only the per-email cap is under test.
        client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
        age_codes(db_engine, 120)
    assert len(email_sender.sent) - sent_before == cap

    age_codes(db_engine, 3600)
    rate_limiter.reset()
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    assert len(email_sender.sent) - sent_before == cap + 1


# --- login timing ---

def test_login_verifies_against_a_dummy_hash_when_the_user_does_not_exist(client, monkeypatch):
    seen: list[str] = []
    real_verify = auth_service.verify_password

    def spy(password, password_hash):
        seen.append(password_hash)
        return real_verify(password, password_hash)

    monkeypatch.setattr(auth_service, "verify_password", spy)
    response = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": PASSWORD})
    assert response.status_code == 401
    assert seen == [auth_service._DUMMY_PASSWORD_HASH]


# --- sessions tied to the password ---

def test_old_session_is_rejected_after_a_password_reset(client, email_sender):
    old_token = register_and_confirm(client, email_sender)
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    verify = client.post(
        "/api/auth/verify-reset-code",
        json={"email": "ana@example.com", "code": email_sender.code_from_last_email()},
    )
    client.post(
        "/api/auth/reset-password",
        json={"reset_token": verify.json()["reset_token"], "new_password": "new-password-123"},
    )

    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {old_token}"}).status_code == 401
    new_token = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "new-password-123"}).json()["access_token"]
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_token}"}).status_code == 200


def test_access_token_without_the_pwd_claim_is_rejected(client, email_sender):
    register_and_confirm(client, email_sender)
    legacy = create_token(subject="1", purpose=PURPOSE_ACCESS, expires_in=timedelta(days=1))
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {legacy}"}).status_code == 401
