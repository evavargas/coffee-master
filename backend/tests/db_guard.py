import os

from sqlalchemy.engine import make_url

# Tests never read DATABASE_URL from .env: the URL is explicit here (override with TEST_DATABASE_URL).
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://postgres:postgres@localhost:5432/coffeemaster_test"
)


def assert_safe_test_database(url: str) -> None:
    """Refuse to create or truncate anything outside a local `*_test` database."""
    parsed = make_url(url)
    # Query params (?host=, ?dbname=) can override the authority part, so reject them all.
    assert not parsed.query, "Test database URL must not have a query string"
    assert parsed.host in ("localhost", "127.0.0.1"), "Test database must be on localhost"
    assert (parsed.database or "").endswith("_test"), "Test database name must end with _test"
