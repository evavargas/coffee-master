"""Authentication endpoints: register, confirm email, login, password recovery."""

from collections.abc import Callable
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_email_sender, get_session_factory
from app.core.config import get_settings
from app.core.rate_limit import auth_rate_limit
from app.core.security import PURPOSE_CONFIRM_EMAIL, PURPOSE_RESET_PASSWORD
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import (
    ConfirmEmailRequest,
    EmailRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    ResetTokenResponse,
    TokenResponse,
    UserPublic,
    VerifyResetCodeRequest,
)
from app.services import auth as auth_service
from app.services.email import EmailSender

# Every auth endpoint is rate limited per IP. /me is included, which is harmless at this volume.
router = APIRouter(prefix="/api/auth", tags=["auth"], dependencies=[auth_rate_limit])

# Same message for "unknown email" and "known email" so the API does not reveal which accounts exist.
FORGOT_PASSWORD_MESSAGE = "Si el email está registrado, te enviamos un código para cambiar la contraseña."
CONFIRMATION_SENT_MESSAGE = "Te enviamos un mail para confirmar tu cuenta."
REGISTER_MESSAGE = (
    "Si el email se puede registrar, te enviamos un código para confirmar tu cuenta. "
    "Si ya tenés cuenta, iniciá sesión."
)


def schedule_code_email(
    background_tasks: BackgroundTasks,
    session_factory: Callable[[], Session],
    sender: EmailSender,
    user_id: int,
    purpose: str,
) -> None:
    """Send after the response, so response time does not reveal whether an email was sent.

    EMAIL_SEND_IN_BACKGROUND=false sends before responding, for hosts that stop the function
    as soon as the response is out.
    """
    if get_settings().email_send_in_background:
        background_tasks.add_task(auth_service.deliver_code_email, session_factory, sender, user_id, purpose)
    else:
        auth_service.deliver_code_email(session_factory, sender, user_id, purpose)


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new account",
    description=(
        "Always answers 201 with the same message, so it cannot be used to discover registered emails. "
        "A new email creates an unconfirmed account and sends a 6-digit code. An existing unconfirmed "
        "account takes the new name and password and gets a new code (subject to the per-email "
        "cooldown and hourly cap). A confirmed account gets nothing. Email failures are logged only."
    ),
    responses={422: {"description": "Invalid input"}, 429: {"description": "Too many attempts from this IP"}},
)
def register(
    body: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: EmailSender = Depends(get_email_sender),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> MessageResponse:
    user_id = auth_service.register_or_reissue(db, body.name, body.email, body.password)
    if user_id is not None:
        schedule_code_email(background_tasks, session_factory, sender, user_id, PURPOSE_CONFIRM_EMAIL)
    return MessageResponse(message=REGISTER_MESSAGE)


@router.post(
    "/resend-confirmation",
    response_model=MessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Resend the confirmation email",
    description=(
        "Always returns the same message, whether or not the email exists, is already confirmed, "
        "or the per-email cooldown and hourly cap prevented a new code."
    ),
)
def resend_confirmation(
    body: EmailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: EmailSender = Depends(get_email_sender),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> MessageResponse:
    user = auth_service.get_user_by_email(db, body.email)
    if user is not None and not user.email_confirmed:
        schedule_code_email(background_tasks, session_factory, sender, user.id, PURPOSE_CONFIRM_EMAIL)
    return MessageResponse(message=CONFIRMATION_SENT_MESSAGE)


@router.post(
    "/confirm-email",
    response_model=MessageResponse,
    summary="Confirm an email address",
    description="Consumes the 6-digit code received by email and marks the account as confirmed.",
    responses={400: {"description": "Invalid, expired or attempts-exhausted code"}},
)
def confirm_email(body: ConfirmEmailRequest, db: Session = Depends(get_db)) -> MessageResponse:
    try:
        auth_service.confirm_email(db, body.email, body.code)
    except auth_service.InvalidCodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El código de confirmación no es válido o venció.") from exc
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
    description=(
        "Always returns the same message, so it cannot be used to discover registered emails "
        "(also when the per-email cooldown or hourly cap prevented a new code)."
    ),
)
def forgot_password(
    body: EmailRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    sender: EmailSender = Depends(get_email_sender),
    session_factory: Callable[[], Session] = Depends(get_session_factory),
) -> MessageResponse:
    user = auth_service.get_user_by_email(db, body.email)
    if user is not None and user.email_confirmed:
        schedule_code_email(background_tasks, session_factory, sender, user.id, PURPOSE_RESET_PASSWORD)
    return MessageResponse(message=FORGOT_PASSWORD_MESSAGE)


@router.post(
    "/verify-reset-code",
    response_model=ResetTokenResponse,
    summary="Verify a password reset code",
    description=(
        "Consumes the 6-digit code received by email and returns a short-lived session token "
        "(10 minutes) to use in the next call to reset-password. The client holds it in memory; "
        "the user never sees or types it."
    ),
    responses={400: {"description": "Invalid, expired or attempts-exhausted code"}},
)
def verify_reset_code(body: VerifyResetCodeRequest, db: Session = Depends(get_db)) -> ResetTokenResponse:
    try:
        reset_token = auth_service.verify_reset_code(db, body.email, body.code)
    except auth_service.InvalidCodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El código para cambiar la contraseña no es válido o venció.") from exc
    return ResetTokenResponse(reset_token=reset_token)


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Set a new password with a reset session token",
    description=(
        "The reset_token comes from verify-reset-code, expires after 10 minutes and can be used "
        "only once: changing the password invalidates it."
    ),
    responses={400: {"description": "Invalid, expired or already used token"}},
)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)) -> MessageResponse:
    try:
        auth_service.reset_password(db, body.reset_token, body.new_password)
    except auth_service.InvalidTokenError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El token para cambiar la contraseña no es válido o venció.") from exc
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
