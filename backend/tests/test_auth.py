from datetime import timedelta

from sqlalchemy.orm import sessionmaker

from app.core.security import PURPOSE_RESET_PASSWORD, create_token, password_fingerprint
from app.models.user import User
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


def test_register_rejects_duplicate_email(client):
    body = {"name": "Ana", "email": "ana@example.com", "password": PASSWORD}
    client.post("/api/auth/register", json=body)
    assert client.post("/api/auth/register", json=body).status_code == 409


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
    confirm = client.post("/api/auth/confirm-email", json={"token": email_sender.token_from_last_email()})
    assert confirm.status_code == 200

    login = client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert login.status_code == 200
    body = login.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 7 * 24 * 60 * 60


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


def test_confirmation_token_cannot_be_used_as_session(client, email_sender):
    client.post("/api/auth/register", json={"name": "Ana", "email": "ana@example.com", "password": PASSWORD})
    confirm_token = email_sender.token_from_last_email()
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {confirm_token}"})
    assert response.status_code == 401


def test_forgot_password_gives_same_answer_for_unknown_email(client, email_sender):
    response = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert response.status_code == 202
    assert email_sender.sent == []


def test_password_reset_works_once(client, email_sender):
    register_and_confirm(client, email_sender)
    client.post("/api/auth/forgot-password", json={"email": "ana@example.com"})
    reset_token = email_sender.token_from_last_email()

    first = client.post("/api/auth/reset-password", json={"token": reset_token, "new_password": "new-password-123"})
    assert first.status_code == 200

    reused = client.post("/api/auth/reset-password", json={"token": reset_token, "new_password": "another-pass-456"})
    assert reused.status_code == 400

    login = client.post("/api/auth/login", json={"email": "ana@example.com", "password": "new-password-123"})
    assert login.status_code == 200


def test_password_reset_rejects_expired_token(client, email_sender, db_engine):
    register_and_confirm(client, email_sender)
    session = sessionmaker(bind=db_engine)()
    user = session.query(User).filter_by(email="ana@example.com").one()
    expired_token = create_token(
        subject=str(user.id),
        purpose=PURPOSE_RESET_PASSWORD,
        expires_in=timedelta(seconds=-1),
        extra={"pwd": password_fingerprint(user.password_hash)},
    )
    session.close()

    response = client.post(
        "/api/auth/reset-password",
        json={"token": expired_token, "new_password": "new-password-123"},
    )
    assert response.status_code == 400

    # The expired token never changed anything: the original password still works.
    login = client.post("/api/auth/login", json={"email": "ana@example.com", "password": PASSWORD})
    assert login.status_code == 200
