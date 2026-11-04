"""FastAPI dependencies shared by the routes."""

from collections.abc import Callable
from functools import lru_cache

from anthropic import AsyncAnthropic
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal, get_db
from app.models.user import User
from app.services.auth import InvalidTokenError, get_user_from_access_token
from app.services.email import EmailSender, GmailSmtpEmailSender

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_anthropic_client() -> AsyncAnthropic:
    """One shared client (and connection pool) per process, with an explicit request timeout."""
    settings = get_settings()
    return AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=settings.anthropic_timeout_seconds)


def get_session_factory() -> Callable[[], Session]:
    """Factory for short-lived sessions used outside the request session (overridable in tests)."""
    return SessionLocal


def get_email_sender() -> EmailSender:
    return GmailSmtpEmailSender()


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión requerida.")
    try:
        return get_user_from_access_token(db, credentials.credentials)
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="La sesión no es válida o venció. Volvé a iniciar sesión.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
