"""Auth business logic: registration, email confirmation, login and password reset."""

from datetime import timedelta

import jwt
from sqlalchemy import select
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


class EmailAlreadyRegisteredError(Exception):
    pass


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


def register_user(db: Session, name: str, email: str, password: str) -> User:
    if get_user_by_email(db, email) is not None:
        raise EmailAlreadyRegisteredError
    user = User(
        name=name.strip(),
        email=normalize_email(email),
        password_hash=hash_password(password),
        email_confirmed=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


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


def verify_code(db: Session, email: str, code: str, purpose: str) -> User:
    user = get_user_by_email(db, email)
    if user is None:
        # Same principle as forgot-password: don't distinguish "no such user" from "wrong code".
        raise InvalidCodeError

    settings = get_settings()
    row = db.scalar(
        select(VerificationCode)
        .where(VerificationCode.user_id == user.id)
        .where(VerificationCode.purpose == purpose)
        .where(VerificationCode.consumed.is_(False))
        .order_by(VerificationCode.created_at.desc())
    )
    if row is None:
        raise InvalidCodeError
    if as_aware_utc(row.expires_at) < utc_now():
        raise InvalidCodeError
    if row.attempts >= settings.verification_code_max_attempts:
        raise InvalidCodeError

    if not verify_password(code, row.code_hash):
        row.attempts += 1
        db.commit()
        raise InvalidCodeError

    row.consumed = True
    db.commit()
    return user


def confirm_email(db: Session, email: str, code: str) -> User:
    user = verify_code(db, email, code, PURPOSE_CONFIRM_EMAIL)
    if not user.email_confirmed:
        user.email_confirmed = True
        db.commit()
    return user


def authenticate(db: Session, email: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if user is None or not verify_password(password, user.password_hash):
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
    )


def get_user_from_access_token(db: Session, token: str) -> User:
    try:
        claims = decode_token(token, PURPOSE_ACCESS)
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError from exc
    user = db.get(User, int(claims["sub"]))
    if user is None or not user.email_confirmed:
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
            f"<p>Hola {user.name}, gracias por registrarte.</p>"
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
            f"<p>Hola {user.name}, recibimos un pedido para cambiar tu contraseña.</p>"
            f'<p>Tu código para cambiar la contraseña es: <strong id="verification-code">{code}</strong></p>'
            f"<p>Vence en {settings.verification_code_minutes} minutos. "
            "Si no lo pediste, ignorá este mail.</p>"
        ),
    )
