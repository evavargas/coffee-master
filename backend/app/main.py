"""FastAPI application factory."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import ProgrammingError

from app.api.routes import auth, chat, conversations, health
from app.core.config import get_settings
from app.db.session import Base, engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    # Creates tables for the MVP. Move to Alembic migrations before a production deploy.
    # Serverless cold starts can run this concurrently across instances/regions; the
    # loser of that race sees "already exists", which just means the schema is already
    # in the state we wanted, not a real failure.
    try:
        Base.metadata.create_all(bind=engine)
    except ProgrammingError as exc:
        if "already exists" not in str(exc.orig):
            raise
        logger.warning("Tables already created by a concurrent cold start, continuing.")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Coffee Master API",
        version="0.3.0",
        description="Coffee agent API with email-confirmed accounts. Full endpoint reference: backend/README.md.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(chat.router)
    app.include_router(conversations.router)
    return app


app = create_app()
