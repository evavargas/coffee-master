"""Shared test fixtures.

Environment variables are set before the app is imported, so Settings and the
database engine are created with test values. No test touches the network.
"""

import os
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-production")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("FRONTEND_URL", "http://frontend.test")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.api.deps import get_anthropic_client, get_email_sender  # noqa: E402
from app.core.rate_limit import rate_limiter  # noqa: E402
from app.db.session import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402


@dataclass
class FakeEmailSender:
    sent: list[dict] = field(default_factory=list)

    def send(self, to: str, subject: str, html: str) -> None:
        self.sent.append({"to": to, "subject": subject, "html": html})

    def token_from_last_email(self) -> str:
        """Extract the token from the link in the most recent email."""
        match = re.search(r"token=([^\"&\s]+)", self.sent[-1]["html"])
        assert match, "No token link found in the email"
        return match.group(1)


def fake_anthropic_client(reply: str = "test reply") -> MagicMock:
    client = MagicMock()
    client.messages.create = AsyncMock(
        return_value=SimpleNamespace(
            stop_reason="end_turn",
            content=[SimpleNamespace(type="text", text=reply)],
        )
    )
    return client


@pytest.fixture(autouse=True)
def reset_rate_limits():
    # Every test starts with empty counters, so one test's requests never throttle another.
    rate_limiter.reset()
    yield
    rate_limiter.reset()


@pytest.fixture
def db_engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture
def email_sender() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
def anthropic_client() -> MagicMock:
    return fake_anthropic_client()


@pytest.fixture
def client(db_engine, email_sender, anthropic_client) -> Iterator[TestClient]:
    session_factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_email_sender] = lambda: email_sender
    app.dependency_overrides[get_anthropic_client] = lambda: anthropic_client
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def register_and_confirm(client: TestClient, email_sender: FakeEmailSender, name="Ana", email="ana@example.com", password="correct-horse") -> str:
    """Register, confirm through the emailed link, and return an access token."""
    client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    client.post("/api/auth/confirm-email", json={"token": email_sender.token_from_last_email()})
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    return response.json()["access_token"]
