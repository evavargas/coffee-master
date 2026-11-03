"""Authentication endpoints: register, confirm email, login, password recovery."""

import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_email_sender
from app.core.config import get_settings
from app.core.rate_limit import auth_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    ConfirmEmailRequest,
    EmailRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserPublic,
)
from app.services import auth as auth_service
from app.services.email import EmailSender

logger = logging.getLogger(__name__)

# Every auth endpoint is rate limited per IP. /me is included, which is harmless at this volume.
router = APIRouter(prefix="/api/auth", tags=["auth"], dependencies=[auth_rate_limit])

# Same message for "unknown email" and "known email" so the API does not reveal which accounts exist.
FORGOT_PASSWORD_MESSAGE = "Si el email está registrado, te enviamos un link para cambiar la contraseña."
CONFIRMATION_SENT_MESSAGE = "Te enviamos un mail para confirmar tu cuenta."


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
    description="Creates an unconfirmed account and sends a confirmation email. The user cannot log in until confirmed.",
    responses={
        409: {"description": "Email already registered"},
        422: {"description": "Invalid input"},
        503: {"description": "Confirmation email could not be sent; the account was created, use resend-confirmation"},
    },
)
def register(
    body: RegisterRequest,
    db: Session = Depends(get_db),
    sender: EmailSender = Depends(get_email_sender),
) -> MessageResponse:
    try:
        user = auth_service.register_user(db, body.name, body.email, body.password)
    except auth_service.EmailAlreadyRegisteredError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ese email ya tiene una cuenta.") from exc
    try:
        auth_service.send_confirmation_email(sender, user)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "La cuenta se creó pero no pudimos enviar el mail. Pedí un nuevo mail de confirmación.",
        ) from exc
    return MessageResponse(message=CONFIRMATION_SENT_MESSAGE)


@router.post(
    "/resend-confirmation",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Resend the confirmation email",
    description="Always returns the same message, whether or not the email exists or is already confirmed.",
)
def resend_confirmation(
    body: EmailRequest,
    db: Session = Depends(get_db),
    sender: EmailSender = Depends(get_email_sender),
) -> MessageResponse:
    user = auth_service.get_user_by_email(db, body.email)
    if user is not None and not user.email_confirmed:
        try:
            auth_service.send_confirmation_email(sender, user)
        except Exception:
            logger.exception("Could not resend confirmation email")
    return MessageResponse(message=CONFIRMATION_SENT_MESSAGE)


@router.post(
    "/confirm-email",
    response_model=MessageResponse,
    summary="Confirm an email address",
    description="Consumes the token received by email and marks the account as confirmed.",
    responses={400: {"description": "Invalid or expired token"}},
)
def confirm_email(body: ConfirmEmailRequest, db: Session = Depends(get_db)) -> MessageResponse:
    try:
        auth_service.confirm_email(db, body.token)
    except auth_service.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El link de confirmación no es válido o venció.") from exc
    return MessageResponse(message="Tu cuenta está confirmada. Ya podés iniciar sesión.")


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Log in with email and password",
    description="Returns a JWT valid for 7 days. Send it as `Authorization: Bearer <token>`.",
    responses={
        401: {"description": "Invalid credentials"},
        403: {"description": "Email not confirmed yet"},
        429: {"description": "Too many attempts from this IP"},
    },
)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        user = auth_service.authenticate(db, body.email, body.password)
    except auth_service.InvalidCredentialsError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email o contraseña incorrectos.") from exc
    except auth_service.EmailNotConfirmedError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Tenés que confirmar tu email antes de iniciar sesión.",
        ) from exc
    expires_in = int(timedelta(days=get_settings().access_token_days).total_seconds())
    return TokenResponse(access_token=auth_service.build_access_token(user), expires_in=expires_in)


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request a password reset email",
    description="Always returns the same message, so it cannot be used to discover registered emails.",
)
def forgot_password(
    body: EmailRequest,
    db: Session = Depends(get_db),
    sender: EmailSender = Depends(get_email_sender),
) -> MessageResponse:
    user = auth_service.get_user_by_email(db, body.email)
    if user is not None and user.email_confirmed:
        try:
            auth_service.send_reset_email(sender, user)
        except Exception:
            logger.exception("Could not send password reset email")
    return MessageResponse(message=FORGOT_PASSWORD_MESSAGE)


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Set a new password with a reset token",
    description="The token expires after 30 minutes and can be used only once: changing the password invalidates it.",
    responses={400: {"description": "Invalid, expired or already used token"}},
)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageResponse:
    try:
        auth_service.reset_password(db, body.token, body.new_password)
    except auth_service.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El link para cambiar la contraseña no es válido o venció.") from exc
    return MessageResponse(message="Contraseña actualizada. Ya podés iniciar sesión.")


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Get the logged-in user",
    description="Requires a valid bearer token.",
    responses={401: {"description": "Missing, invalid or expired session"}},
)
def me(current_user: User = Depends(get_current_user)) -> UserPublic:
    return UserPublic(id=current_user.id, name=current_user.name, email=current_user.email)
