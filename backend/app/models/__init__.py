"""Importing every model here registers it on Base.metadata, so create_all sees all tables."""

from app.models import chat, user, verification_code  # noqa: F401
