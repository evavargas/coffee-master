"""FastAPI dependencies shared by the routes."""

from anthropic import AsyncAnthropic
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.services.auth import InvalidTokenError, get_user_from_access_token
from app.services.email import EmailSender, ResendEmailSender

_bearer = HTTPBearer(auto_error=False)


def get_anthropic_client() -> AsyncAnthropic:
    return AsyncAnthropic()


def get_email_sender() -> EmailSender:
    return ResendEmailSender()


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
