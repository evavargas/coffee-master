import pytest

from tests.db_guard import assert_safe_test_database

BASE = "postgresql+psycopg://postgres:postgres@"


@pytest.mark.parametrize("url", [BASE + "localhost:5432/coffeemaster_test", BASE + "127.0.0.1:5432/coffeemaster_test"])
def test_accepts_local_test_database(url: str) -> None:
    assert_safe_test_database(url)


@pytest.mark.parametrize(
    "url",
    [
        BASE + "prod.example.com:5432/coffeemaster_test",
        BASE + "localhost:5432/coffeemaster",
        BASE + "localhost/x_test?host=prod.example.com&dbname=prod",
        "postgresql+psycopg:///coffeemaster_test",
        "postgresql+psycopg:///coffeemaster_test?host=/var/run/postgresql",
    ],
)
def test_rejects_unsafe_database(url: str) -> None:
    with pytest.raises(AssertionError):
        assert_safe_test_database(url)
