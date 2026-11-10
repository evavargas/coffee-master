"""Shared test fixtures.

Environment variables are set before the app is imported, so Settings and the
database engine are created with test values. No test touches the network.
"""

import json
import os
import re
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from types import SimpleNamespace

os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-production")
from tests.db_guard import TEST_DATABASE_URL, assert_safe_test_database  # noqa: E402

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("FRONTEND_URL", "http://frontend.test")

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.exc import OperationalError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.api.deps import (  # noqa: E402
    get_anthropic_client,
    get_chat_embedding_provider,
    get_email_sender,
    get_embedding_provider,
    get_session_factory,
)  # noqa: E402
from app.core.rate_limit import rate_limiter  # noqa: E402
from app.db.session import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from tests.fake_embeddings import FakeEmbeddingProvider  # noqa: E402


@dataclass
class FakeEmailSender:
    sent: list[dict] = field(default_factory=list)

    def send(self, to: str, subject: str, html: str) -> None:
        self.sent.append({"to": to, "subject": subject, "html": html})

    def code_from_last_email(self) -> str:
        """Extract the 6-digit code from the most recent email.

        The template marks the code with a distinct `id="verification-code"` tag,
        so this regex cannot accidentally match some other digit run in the HTML.
        """
        match = re.search(r'id="verification-code">(\d{6})<', self.sent[-1]["html"])
        assert match, "No verification code found in the email"
        return match.group(1)


class FakeModel:
    """Stands in for AsyncAnthropic: `messages.stream(...)` replays scripted text chunks.

    After the chunks it raises `error` if one is set. `on_call` runs when the model is
    called, which lets a test inspect the database state at that exact moment.
    """

    def __init__(self, chunks: tuple[str, ...] = ("test reply",)) -> None:
        self.chunks = chunks
        self.error: Exception | None = None
        # Tool calls the scripted reply ends with, as (name, input) pairs.
        self.tool_calls: list[tuple[str, dict]] = []
        self.stop_reason: str | None = None  # overrides the default end_turn/tool_use
        self.on_call: Callable[[], None] | None = None
        self.calls: list[dict] = []
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs) -> "FakeStreamManager":
        self.calls.append(kwargs)
        if self.on_call is not None:
            self.on_call()
        return FakeStreamManager(self)


class FakeStreamManager:
    def __init__(self, model: FakeModel) -> None:
        self._model = model

    async def __aenter__(self) -> "FakeStreamManager":
        return self

    async def __aexit__(self, *exc_info) -> None:
        return None

    @property
    async def text_stream(self):
        for chunk in self._model.chunks:
            yield chunk
        if self._model.error is not None:
            raise self._model.error

    async def get_final_message(self) -> SimpleNamespace:
        usage = SimpleNamespace(
            input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0
        )
        content = [
            SimpleNamespace(type="tool_use", id=f"toolu_{i}", name=name, input=data)
            for i, (name, data) in enumerate(self._model.tool_calls)
        ]
        return SimpleNamespace(stop_reason=self._model.stop_reason or ("tool_use" if content else "end_turn"), usage=usage, content=content)


@pytest.fixture(autouse=True)
def reset_rate_limits():
    # Every test starts with empty counters, so one test's requests never throttle another.
    rate_limiter.reset()
    yield
    rate_limiter.reset()


@pytest.fixture(scope="session")
def _test_engine():
    assert_safe_test_database(TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL)
    # Start from an empty schema so a stale one cannot hide a broken migration.
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
    except OperationalError as exc:
        pytest.exit(
            f"Test database unreachable or missing ({exc.orig}). Start it with `docker compose up -d db`; "
            "if the volume is old, run `docker compose down -v` first so `coffeemaster_test` is created.",
            returncode=3,
        )
    alembic_config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    # configparser treats `%` as interpolation, so a percent-encoded password needs `%%`.
    alembic_config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL.replace("%", "%%"))
    command.upgrade(alembic_config, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def db_engine(_test_engine):
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with _test_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    yield _test_engine


@pytest.fixture
def email_sender() -> FakeEmailSender:
    return FakeEmailSender()


@pytest.fixture
def anthropic_client() -> FakeModel:
    return FakeModel()


@pytest.fixture
def embedding_provider() -> FakeEmbeddingProvider:
    return FakeEmbeddingProvider()


@pytest.fixture
def client(db_engine, email_sender, anthropic_client, embedding_provider) -> Iterator[TestClient]:
    session_factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_session_factory] = lambda: session_factory
    app.dependency_overrides[get_email_sender] = lambda: email_sender
    app.dependency_overrides[get_anthropic_client] = lambda: anthropic_client
    app.dependency_overrides[get_embedding_provider] = lambda: embedding_provider
    app.dependency_overrides[get_chat_embedding_provider] = lambda: embedding_provider
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def register_and_confirm(client: TestClient, email_sender: FakeEmailSender, name="Ana", email="ana@example.com", password="correct-horse") -> str:
    """Register, confirm through the emailed code, and return an access token."""
    client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    client.post("/api/auth/confirm-email", json={"email": email, "code": email_sender.code_from_last_email()})
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def parse_sse(body: str) -> list[tuple[str, dict]]:
    """Parse a text/event-stream body into (event, data) pairs."""
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        events.append((lines["event"], json.loads(lines["data"])))
    return events
