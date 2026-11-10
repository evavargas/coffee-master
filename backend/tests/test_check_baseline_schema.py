"""The one-time pre-stamp check, run against throwaway databases that mimic the old create_all one."""

import pytest
from alembic import command
from sqlalchemy import create_engine, text
from sqlalchemy.exc import InternalError, OperationalError, ProgrammingError

from scripts import check_baseline_schema
from scripts.check_baseline_schema import check_baseline
from tests.test_migrations import alembic_config, scratch_url  # noqa: F401  (fixture reuse)


def prepare(url: str, revision: str, *sql: str) -> None:
    """Migrate to `revision`, drop alembic_version (as if never stamped), then run extra SQL."""
    command.upgrade(alembic_config(url), revision)
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE alembic_version"))
        for statement in sql:
            conn.execute(text(statement))
    engine.dispose()


def test_unstamped_baseline_is_safe(scratch_url: str) -> None:  # noqa: F811
    prepare(scratch_url, "0001_baseline")
    assert check_baseline(scratch_url) == (True, [])


def test_extra_column_is_not_safe(scratch_url: str) -> None:  # noqa: F811
    prepare(scratch_url, "0001_baseline", "ALTER TABLE users ADD COLUMN extra_col integer")
    safe, reasons = check_baseline(scratch_url)
    assert not safe
    assert any("users.extra_col" in reason for reason in reasons)


def test_nullable_change_is_not_safe(scratch_url: str) -> None:  # noqa: F811
    prepare(scratch_url, "0001_baseline", "ALTER TABLE users ALTER COLUMN name DROP NOT NULL")
    safe, reasons = check_baseline(scratch_url)
    assert not safe
    assert any("users.name" in reason for reason in reasons)


def test_already_stamped_is_not_safe(scratch_url: str) -> None:  # noqa: F811
    command.upgrade(alembic_config(scratch_url), "0001_baseline")
    safe, reasons = check_baseline(scratch_url)
    assert not safe
    assert any("alembic_version" in reason for reason in reasons)


def test_database_with_0002_objects_is_safe(scratch_url: str) -> None:  # noqa: F811
    prepare(scratch_url, "head")
    assert check_baseline(scratch_url) == (True, [])


def test_main_without_database_url_exits_2_and_never_connects(monkeypatch, capsys) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)

    def fail(*args, **kwargs):
        raise AssertionError("must not connect")

    monkeypatch.setattr(check_baseline_schema, "create_engine", fail)
    with pytest.raises(SystemExit) as exit_info:
        check_baseline_schema.main()
    assert exit_info.value.code == 2
    assert "DATABASE_URL" in capsys.readouterr().err


def test_main_prints_target_without_password(monkeypatch, capsys, scratch_url: str) -> None:  # noqa: F811
    prepare(scratch_url, "0001_baseline")
    monkeypatch.setenv("DATABASE_URL", scratch_url)
    check_baseline_schema.main()
    out = capsys.readouterr().out
    assert "localhost:5432/coffeemaster_alembic_test" in out
    assert "postgres:postgres" not in out
    assert "postgres@" not in out
    assert "SAFE TO STAMP" in out


def test_script_connection_is_read_only(scratch_url: str) -> None:  # noqa: F811
    engine, conn = check_baseline_schema.open_readonly(scratch_url)
    try:
        with pytest.raises((InternalError, OperationalError, ProgrammingError), match="read-only"):
            conn.execute(text("CREATE TABLE should_not_exist (id int)"))
    finally:
        conn.close()
        engine.dispose()


def test_check_baseline_goes_through_open_readonly(monkeypatch, scratch_url: str) -> None:  # noqa: F811
    prepare(scratch_url, "0001_baseline")
    real = check_baseline_schema.open_readonly
    calls: list[str] = []

    def spy(url: str):
        calls.append(url)
        return real(url)

    monkeypatch.setattr(check_baseline_schema, "open_readonly", spy)
    assert check_baseline(scratch_url)[0]
    assert calls == [scratch_url]


def test_read_only_survives_rollback_and_new_transaction(scratch_url: str) -> None:  # noqa: F811
    engine, conn = check_baseline_schema.open_readonly(scratch_url)
    try:
        assert conn.execute(text("SHOW transaction_read_only")).scalar() == "on"
        conn.rollback()
        assert conn.execute(text("SHOW transaction_read_only")).scalar() == "on"
        conn.rollback()
        with pytest.raises((InternalError, OperationalError, ProgrammingError), match="read-only"):
            conn.execute(text("CREATE TABLE should_not_exist (id int)"))
    finally:
        conn.close()
        engine.dispose()
