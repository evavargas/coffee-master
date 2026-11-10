"""Database engine, session factory and declarative base."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def pg_connect_args(database_url: str) -> dict:
    """Driver arguments shared by the app, Alembic and the maintenance scripts."""
    if database_url.startswith("sqlite"):
        return {"check_same_thread": False}
    # Supabase's pooler runs in transaction mode, which does not support
    # server-side prepared statements. Disable them for PostgreSQL.
    return {"prepare_threshold": None}


def _create_engine(database_url: str):
    return create_engine(database_url, connect_args=pg_connect_args(database_url), pool_pre_ping=True)


engine = _create_engine(get_settings().database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency that yields one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
