"""Vercel entrypoint. Vercel's Python runtime looks for an ASGI `app` in index.py."""

from app.main import app  # noqa: F401
