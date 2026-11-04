"""Auth business logic: registration, email confirmation, login and password reset."""

import logging
from collections.abc import Callable
from datetime import timedelta
from html import escape

import jwt
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    PURPOSE_ACCESS,
    PURPOSE_CONFIRM_EMAIL,
    PURPOSE_RESET_PASSWORD,
    PURPOSE_RESET_PASSWORD_VERIFIED,
    create_token,
    decode_token,
    generate_verification_code,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.models.user import User
from app.models.verification_code import VerificationCode, as_aware_utc, utc_now
from app.services.email import EmailSender

logger = logging.getLogger(__name__)

# Verified against when the email is unknown, so login takes the same time either way.
_DUMMY_PASSWORD_HASH = hash_password("dummy-password-for-timing")


class InvalidCredentialsError(Exception):
    pass


class EmailNotConfirmedError(Exception):
    pass


class InvalidTokenError(Exception):
    pass


class InvalidCodeError(Exception):
    pass


def normalize_email(email: str) -> str:
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def register_or_reissue(db: Session, name: str, email: str, password: str) -> int | None:
    """Register without revealing whether the email already has an account.

    New email: create the user. Existing unconfirmed account: replace the name and password
    with the latest ones, so whoever confirms the mailbox can log in with what they just typed.
    The password is always hashed so timing does not differ. Returns the id of the user who
    should get a confirmation code, or None for an already confirmed account.
    """
    password_hash = hash_password(password)
    user = get_user_by_email(db, email)
    if user is None:
        user = User(
            name=name.strip(),
            email=normalize_email(email),
            password_hash=password_hash,
            email_confirmed=False,
        )
        db.add(user)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request registered the same email first: treat it as existing.
            db.rollback()
            user = get_user_by_email(db, email)
    elif not user.email_confirmed:
        user.name = name.strip()
        user.password_hash = password_hash
        db.commit()
    if user is None or user.email_confirmed:
        return None
    return user.id


def deliver_code_email(session_factory: Callable[[], Session], sender: EmailSender, user_id: int, purpose: str) -> None:
    """Issue and send a code with its own session, so it can run after the response has been sent."""
    with session_factory() as db:
        user = db.get(User, user_id)
        if user is not None:
            send_code_email(db, sender, user, purpose)


def code_issue_allowed(db: Session, user: User, purpose: str) -> bool:
    """Apply the per-(user, purpose) cooldown and rolling hourly cap, using the stored code rows."""
    settings = get_settings()
    now = utc_now()
    recent = db.scalars(
        select(VerificationCode.created_at)
        .where(VerificationCode.user_id == user.id)
        .where(VerificationCode.purpose == purpose)
        .where(VerificationCode.created_at >= now - timedelta(hours=1))
    ).all()
    if len(recent) >= settings.verification_code_max_per_hour:
        return False
    cooldown = timedelta(seconds=settings.verification_code_cooldown_seconds)
    return not any(as_aware_utc(created) > now - cooldown for created in recent)


def send_code_email(db: Session, sender: EmailSender, user: User, purpose: str) -> None:
    """Issue and email a code unless rate limited. Never raises: failures are only logged.

    When limited, nothing is sent and the current code stays valid. Logs carry the user id, never the address.
    """
    try:
        if not code_issue_allowed(db, user, purpose):
            logger.info("Verification code request limited: user_id=%s purpose=%s", user.id, purpose)
            return
        code = create_verification_code(db, user, purpose)
        try:
            if purpose == PURPOSE_CONFIRM_EMAIL:
                send_confirmation_email(sender, user, code)
            else:
                send_reset_email(sender, user, code)
        except Exception:
            # A code nobody received must not count against the cooldown or the hourly cap.
            _discard_unconsumed_codes(db, user, purpose)
            raise
    except Exception:
        logger.exception("Could not issue or send a verification code: user_id=%s purpose=%s", user.id, purpose)


def _discard_unconsumed_codes(db: Session, user: User, purpose: str) -> None:
    db.execute(
        delete(VerificationCode)
        .where(VerificationCode.user_id == user.id)
        .where(VerificationCode.purpose == purpose)
        .where(VerificationCode.consumed.is_(False))
    )
    db.commit()


def create_verification_code(db: Session, user: User, purpose: str) -> str:
    """Invalidate any prior unconsumed code for this (user, purpose) and issue a fresh one.

    Returns the plaintext code so the caller can email it. It is never persisted in
    plaintext: only its hash is stored.
    """
    settings = get_settings()
    previous = db.scalars(
        select(VerificationCode)
        .where(VerificationCode.user_id == user.id)
        .where(VerificationCode.purpose == purpose)
        .where(VerificationCode.consumed.is_(False))
    ).all()
    for row in previous:
        row.consumed = True

    code = generate_verification_code()
    verification = VerificationCode(
        user_id=user.id,
        purpose=purpose,
        code_hash=hash_password(code),  # Reusing the password hasher: it just happens to hash a 6-digit string here.
        expires_at=utc_now() + timedelta(minutes=settings.verification_code_minutes),
    )
    db.add(verification)
    db.commit()
    return code


def _reject_code(code: str) -> InvalidCodeError:
    """Spend the same hashing time as a real check, so a rejection reveals nothing about the account."""
    verify_password(code, _DUMMY_PASSWORD_HASH)
    return InvalidCodeError()


def verify_code(db: Session, email: str, code: str, purpose: str) -> User:
    user = get_user_by_email(db, email)
    if user is None:
        # Same principle as forgot-password: don't distinguish "no such user" from "wrong code".
        raise _reject_code(code)

    settings = get_settings()
    row = db.scalar(
        select(VerificationCode)
        .where(VerificationCode.user_id == user.id)
        .where(VerificationCode.purpose == purpose)
        .where(VerificationCode.consumed.is_(False))
        .order_by(VerificationCode.created_at.desc())
    )
    if row is None or as_aware_utc(row.expires_at) < utc_now():
        raise _reject_code(code)

    # Claim the attempt atomically before the slow hash check, so parallel guesses cannot exceed the limit.
    claimed = db.execute(
        update(VerificationCode)
        .where(VerificationCode.id == row.id)
        .where(VerificationCode.consumed.is_(False))
        .where(VerificationCode.attempts < settings.verification_code_max_attempts)
        .values(attempts=VerificationCode.attempts + 1)
    )
    db.commit()
    if claimed.rowcount == 0:
        raise _reject_code(code)

    if not verify_password(code, row.code_hash):
        raise InvalidCodeError

    # Conditional, so one code cannot be used by two parallel requests.
    consumed = db.execute(
        update(VerificationCode)
        .where(VerificationCode.id == row.id)
        .where(VerificationCode.consumed.is_(False))
        .values(consumed=True)
    )
    db.commit()
    if consumed.rowcount == 0:
        raise InvalidCodeError
    return user


def confirm_email(db: Session, email: str, code: str) -> User:
    user = verify_code(db, email, code, PURPOSE_CONFIRM_EMAIL)
    if not user.email_confirmed:
        user.email_confirmed = True
        db.commit()
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    password_hash = user.password_hash if user is not None else _DUMMY_PASSWORD_HASH
    password_ok = verify_password(password, password_hash)
    if user is None or not password_ok:
        raise InvalidCredentialsError
    if not user.email_confirmed:
        raise EmailNotConfirmedError
    return user


def build_access_token(user: User) -> str:
    settings = get_settings()
    return create_token(
        subject=str(user.id),
        purpose=PURPOSE_ACCESS,
        expires_in=timedelta(days=settings.access_token_days),
        # Ties the session to the current password: changing it closes every open session.
        extra={"pwd": password_fingerprint(user.password_hash)},
    )


def get_user_from_access_token(db: Session, token: str) -> User:
    try:
        claims = decode_token(token, PURPOSE_ACCESS)
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError from exc
    user = db.get(User, int(claims["sub"]))
    if user is None or not user.email_confirmed:
        raise InvalidTokenError
    if claims.get("pwd") != password_fingerprint(user.password_hash):
        raise InvalidTokenError
    return user


def verify_reset_code(db: Session, email: str, code: str) -> str:
    """Verify a reset-password code and issue a short-lived session JWT for the next step."""
    settings = get_settings()
    user = verify_code(db, email, code, PURPOSE_RESET_PASSWORD)
    return create_token(
        subject=str(user.id),
        purpose=PURPOSE_RESET_PASSWORD_VERIFIED,
        expires_in=timedelta(minutes=settings.reset_session_token_minutes),
        extra={"pwd": password_fingerprint(user.password_hash)},
    )


def reset_password(db: Session, reset_token: str, new_password: str) -> User:
    try:
        claims = decode_token(reset_token, PURPOSE_RESET_PASSWORD_VERIFIED)
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError from exc
    user = db.get(User, int(claims["sub"]))
    # The fingerprint changes when the password changes, so a used reset token stops working.
    if user is None or claims.get("pwd") != password_fingerprint(user.password_hash):
        raise InvalidTokenError
    user.password_hash = hash_password(new_password)
    db.commit()
    return user


def send_confirmation_email(sender: EmailSender, user: User, code: str) -> None:
    settings = get_settings()
    sender.send(
        to=user.email,
        subject="Confirmá tu cuenta de MasterCoffe",
        html=(
            f"<p>Hola {escape(user.name)}, gracias por registrarte.</p>"
            f'<p>Tu código de confirmación es: <strong id="verification-code">{code}</strong></p>'
            f"<p>Vence en {settings.verification_code_minutes} minutos.</p>"
        ),
    )


def send_reset_email(sender: EmailSender, user: User, code: str) -> None:
    settings = get_settings()
    sender.send(
        to=user.email,
        subject="Recuperá tu contraseña de MasterCoffe",
        html=(
            f"<p>Hola {escape(user.name)}, recibimos un pedido para cambiar tu contraseña.</p>"
            f'<p>Tu código para cambiar la contraseña es: <strong id="verification-code">{code}</strong></p>'
            f"<p>Vence en {settings.verification_code_minutes} minutos. "
            "Si no lo pediste, ignorá este mail.</p>"
        ),
    )
