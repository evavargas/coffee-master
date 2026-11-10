"""Importing every model here registers it on Base.metadata, so Alembic autogenerate and the test schema see all tables."""

from app.models import chat, knowledge, recipe, user, verification_code  # noqa: F401
