"""FastAPI dependencies shared by the routes."""

import logging
from collections.abc import Callable
from functools import lru_cache

from anthropic import AsyncAnthropic
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal, get_db
from app.models.user import User
from app.rag.embeddings import BedrockEmbeddingProvider, EmbeddingConfigurationError, EmbeddingProvider
from app.services.auth import InvalidTokenError, get_user_from_access_token
from app.services.email import EmailSender, GmailSmtpEmailSender

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


@lru_cache
def get_anthropic_client() -> AsyncAnthropic:
    """One shared client (and connection pool) per process, with an explicit request timeout."""
    settings = get_settings()
    return AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=settings.anthropic_timeout_seconds)


@lru_cache
def get_embedding_provider() -> EmbeddingProvider:
    """One shared provider per process; the boto3 client is built lazily on first use."""
    settings = get_settings()
    return BedrockEmbeddingProvider(
        settings.embedding_model_id, settings.bedrock_region, settings.embedding_dimensions
    )


def get_chat_embedding_provider() -> EmbeddingProvider | None:
    """Provider for the chat, or None when RAG is off or the embedding setup is invalid.

    Resolved lazily (not through Depends) so a bad EMBEDDING_MODEL_ID cannot break the chat while RAG is off.
    """
    if not get_settings().rag_enabled:
        return None
    try:
        return get_embedding_provider()
    except EmbeddingConfigurationError as exc:
        logger.warning("Embedding provider unavailable (%s); the chat uses the full knowledge", type(exc).__name__)
        return None


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
