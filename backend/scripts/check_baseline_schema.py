"""One-time check before stamping an old `create_all` database at `0001_baseline`.

Compares the live schema with the models, ignoring only what migrations after the baseline
added, and never writes (read-only transactions). Only needed before the first stamp of the
production database; delete it afterwards.
Run from backend/:  DATABASE_URL='postgresql+psycopg://<the URL the app uses in backend/.env>' .venv/bin/python -m scripts.check_baseline_schema
"""

import os
import sys
from typing import Any

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Connection, Engine, create_engine, inspect
from sqlalchemy.engine import make_url

# Objects added after 0001_baseline (migrations 0002_recipes, 0003_knowledge and 0004_fk_indexes); extend only if a later migration must be ignored too.
# Excluding a table also excludes its indexes and constraints (see include_object).
POST_BASELINE_TABLES = {
    "catalog_recipes",
    "user_recipes",
    "saved_catalog_recipes",
    "recipe_proposals",
    "knowledge_documents",
    "knowledge_chunks",
}
POST_BASELINE_COLUMNS = {("conversations", "catalog_recipe_id"), ("conversations", "user_recipe_id")}
POST_BASELINE_INDEXES = {"ix_conversations_catalog_recipe_id", "ix_conversations_user_recipe_id"}
POST_BASELINE_FOREIGN_KEYS = {"fk_conversations_catalog_recipe_id", "fk_conversations_user_recipe_id"}


def include_object(obj: Any, name: str | None, type_: str, reflected: bool, compare_to: Any) -> bool:
    if type_ == "table":
        return name not in POST_BASELINE_TABLES
    table = getattr(obj, "table", None)
    table_name = getattr(table, "name", None)
    if table_name in POST_BASELINE_TABLES:
        return False
    if type_ == "column":
        return (table_name, name) not in POST_BASELINE_COLUMNS
    if type_ == "foreign_key_constraint":
        return name not in POST_BASELINE_FOREIGN_KEYS
    if type_ == "index":
        return name not in POST_BASELINE_INDEXES
    return True


def describe(entry: Any) -> list[str]:
    """Turn one compare_metadata entry (nested lists for modify_* operations) into readable reasons."""
    if isinstance(entry, list):
        return [reason for sub in entry for reason in describe(sub)]
    kind = entry[0]
    if kind in ("add_column", "remove_column"):
        _, _, table, column = entry
        where = "in the models but not in the database" if kind == "add_column" else "in the database but not in the models"
        return [f"{table}.{column.name}: column exists {where}"]
    if kind.startswith("modify_"):
        _, _, table, column, _, old, new = entry
        return [f"{table}.{column}: {kind[len('modify_'):]} differs (database {old!r}, models {new!r})"]
    obj = entry[1]
    return [f"{kind}: {getattr(obj, 'name', None) or obj!r}"]


def open_readonly(url: str) -> tuple[Engine, Connection]:
    """Connection whose transactions are read only; per transaction, so it works behind a transaction pooler."""
    from app.db.session import pg_connect_args

    engine = create_engine(url, connect_args=pg_connect_args(url))
    return engine, engine.connect().execution_options(postgresql_readonly=True)


def check_baseline(url: str) -> tuple[bool, list[str]]:
    from app.db.session import Base
    import app.models  # noqa: F401  (registers every table on Base.metadata)

    engine, conn = open_readonly(url)
    reasons: list[str] = []
    with conn:
        if inspect(conn).has_table("alembic_version"):
            reasons.append("alembic_version: table already exists (already stamped, do not stamp again)")
        context = MigrationContext.configure(
            conn, opts={"compare_type": True, "include_object": include_object}
        )
        for entry in compare_metadata(context, Base.metadata):
            reasons.extend(describe(entry))
    engine.dispose()
    return not reasons, reasons


def main() -> None:
    # Read the shell variable only: falling back to backend/.env could check another database than the one to stamp.
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: pass it inline (this script never falls back to backend/.env).", file=sys.stderr)
        sys.exit(2)
    parsed = make_url(url)
    print(f"Checking {parsed.host}:{parsed.port}/{parsed.database}")
    safe, reasons = check_baseline(url)
    if safe:
        print("SAFE TO STAMP")
        return
    print("NOT SAFE TO STAMP")
    for reason in reasons:
        print(f"- {reason}")
    sys.exit(1)


if __name__ == "__main__":
    main()
