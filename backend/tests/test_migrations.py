"""Migration tests run on a throwaway empty database, never on the shared test schema."""

import warnings
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.db.session import Base
from tests.db_guard import TEST_DATABASE_URL, assert_safe_test_database

SCRATCH_DB = "coffeemaster_alembic_test"


@pytest.fixture
def scratch_url() -> Iterator[str]:
    base = make_url(TEST_DATABASE_URL)
    url = base.set(database=SCRATCH_DB).render_as_string(hide_password=False)
    assert_safe_test_database(url)
    admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{SCRATCH_DB}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{SCRATCH_DB}"'))
    try:
        yield url
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{SCRATCH_DB}" WITH (FORCE)'))
        admin.dispose()


def alembic_config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url.replace("%", "%%"))
    return config


def test_upgrade_matches_models(scratch_url: str) -> None:
    command.upgrade(alembic_config(scratch_url), "head")
    engine = create_engine(scratch_url)
    with engine.connect() as conn, warnings.catch_warnings():
        warnings.simplefilter("error")  # an unrecognized column type (vector) would only warn
        diff = compare_metadata(MigrationContext.configure(conn, opts={"compare_type": True}), Base.metadata)
    engine.dispose()
    assert diff == []


def test_downgrade_base_leaves_no_tables(scratch_url: str) -> None:
    config = alembic_config(scratch_url)
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    engine = create_engine(scratch_url)
    remaining = set(inspect(engine).get_table_names()) - {"alembic_version"}
    engine.dispose()
    assert remaining == set()


def test_percent_encoded_password_does_not_break_config() -> None:
    url = "postgresql+psycopg://u:p%40ss@localhost:5432/x_test"
    assert alembic_config(url).get_main_option("sqlalchemy.url") == url


NEW_TABLES = {"catalog_recipes", "user_recipes", "saved_catalog_recipes", "recipe_proposals"}
CONVERSATION_RECIPE_COLUMNS = {"catalog_recipe_id", "user_recipe_id"}


def test_recipes_migration_downgrade_removes_new_objects(scratch_url: str) -> None:
    config = alembic_config(scratch_url)
    engine = create_engine(scratch_url)
    command.upgrade(config, "0002_recipes")
    inspector = inspect(engine)
    assert NEW_TABLES <= set(inspector.get_table_names())
    assert CONVERSATION_RECIPE_COLUMNS <= {c["name"] for c in inspector.get_columns("conversations")}
    command.downgrade(config, "0001_baseline")
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    columns = {c["name"] for c in inspector.get_columns("conversations")}
    engine.dispose()
    assert not NEW_TABLES & tables
    assert not CONVERSATION_RECIPE_COLUMNS & columns
    assert {"users", "conversations", "chat_messages", "verification_codes"} <= tables


def test_knowledge_migration_downgrade_keeps_recipes_and_extension(scratch_url: str) -> None:
    config = alembic_config(scratch_url)
    engine = create_engine(scratch_url)
    command.upgrade(config, "0003_knowledge")
    assert {"knowledge_documents", "knowledge_chunks"} <= set(inspect(engine).get_table_names())
    command.downgrade(config, "0002_recipes")
    tables = set(inspect(engine).get_table_names())
    with engine.connect() as conn:
        extension = conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).scalar()
    engine.dispose()
    assert not {"knowledge_documents", "knowledge_chunks"} & tables
    assert NEW_TABLES <= tables
    assert extension == 1
