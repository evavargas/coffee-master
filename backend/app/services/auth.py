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
    create_token,
    decode_token,
    hash_password,
    password_fingerprint,
    verify_password,
)
from app.models.user import User
from app.services.email import EmailSender


class EmailAlreadyRegisteredError(Exception):
    pass


class InvalidCredentialsError(Exception):
    pass


class EmailNotConfirmedError(Exception):
    pass


class InvalidTokenError(Exception):
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


def build_confirmation_token(user: User) -> str:
    settings = get_settings()
    return create_token(
        subject=str(user.id),
        purpose=PURPOSE_CONFIRM_EMAIL,
        expires_in=timedelta(hours=settings.confirm_token_hours),
    )


def confirm_email(db: Session, token: str) -> User:
    try:
        claims = decode_token(token, PURPOSE_CONFIRM_EMAIL)
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError from exc
    user = db.get(User, int(claims["sub"]))
    if user is None:
        raise InvalidTokenError
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


def build_reset_token(user: User) -> str:
    settings = get_settings()
    return create_token(
        subject=str(user.id),
        purpose=PURPOSE_RESET_PASSWORD,
        expires_in=timedelta(minutes=settings.reset_token_minutes),
        extra={"pwd": password_fingerprint(user.password_hash)},
    )


def reset_password(db: Session, token: str, new_password: str) -> User:
    try:
        claims = decode_token(token, PURPOSE_RESET_PASSWORD)
    except jwt.InvalidTokenError as exc:
        raise InvalidTokenError from exc
    user = db.get(User, int(claims["sub"]))
    # The fingerprint changes when the password changes, so a used reset link stops working.
    if user is None or claims.get("pwd") != password_fingerprint(user.password_hash):
        raise InvalidTokenError
    user.password_hash = hash_password(new_password)
    db.commit()
    return user


def send_confirmation_email(sender: EmailSender, user: User) -> None:
    settings = get_settings()
    link = f"{settings.frontend_url}/confirm-email?token={build_confirmation_token(user)}"
    sender.send(
        to=user.email,
        subject="Confirmá tu cuenta de MasterCoffe",
        html=(
            f"<p>Hola {user.name}, gracias por registrarte.</p>"
            f'<p><a href="{link}">Confirmar mi email</a></p>'
            "<p>El link vence en 24 horas.</p>"
        ),
    )


def send_reset_email(sender: EmailSender, user: User) -> None:
    settings = get_settings()
    link = f"{settings.frontend_url}/reset-password?token={build_reset_token(user)}"
    sender.send(
        to=user.email,
        subject="Recuperá tu contraseña de MasterCoffe",
        html=(
            f"<p>Hola {user.name}, recibimos un pedido para cambiar tu contraseña.</p>"
            f'<p><a href="{link}">Cambiar contraseña</a></p>'
            "<p>El link vence en 30 minutos y solo se puede usar una vez. "
            "Si no lo pediste, ignorá este mail.</p>"
        ),
    )
