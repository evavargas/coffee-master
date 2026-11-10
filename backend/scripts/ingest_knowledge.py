"""Ingests backend/knowledge/cafe into the database (documents, embedded chunks, recipe catalog).

Run from backend/:  DATABASE_URL='postgresql+psycopg://...' .venv/bin/python -m scripts.ingest_knowledge [--dry-run] [--force] [--catalog-only]
`--dry-run` validates and chunks only: no database, no AWS, no settings. Otherwise it calls Amazon Bedrock for real.
Exit codes: 0 success, 1 invalid knowledge, a failed document or a database error, 2 usage, abort, configuration or connection problem.
"""

import argparse
import logging
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.rag.corpus import IngestError, load_knowledge

DEFAULT_ROOT = Path(__file__).resolve().parents[1] / "knowledge" / "cafe"


# Lazy factories: the dry-run path must not import sqlalchemy, settings or the database code.
def _make_engine(url: str) -> Any:
    from sqlalchemy import create_engine

    from app.db.session import pg_connect_args

    return create_engine(url, connect_args=pg_connect_args(url))


def _make_provider() -> Any:
    from app.api.deps import get_embedding_provider

    return get_embedding_provider()


def _dry_run(root: Path) -> int:
    try:
        items = load_knowledge(root)
    except IngestError as exc:
        print(exc, file=sys.stderr)
        return 1
    recipes = sum(1 for i in items if i.doc.type == "recipe")
    print(f"documents={len(items)} chunks={sum(len(i.chunks) for i in items)} recipe_files={recipes}")
    return 0


def _ingest(url: str, root: Path, force: bool, catalog_only: bool) -> int:
    from sqlalchemy.engine import make_url
    from sqlalchemy.exc import ArgumentError, InterfaceError, OperationalError, SQLAlchemyError
    from sqlalchemy.orm import Session

    from app.rag.embeddings import EmbeddingConfigurationError
    from app.rag.ingest import IngestAbort, ingest_knowledge

    try:
        parsed = make_url(url)
        print(f"Target: {parsed.host}:{parsed.port or 5432}/{parsed.database}")
    except (ArgumentError, ValueError):  # no scheme or a non-numeric port; never echo the URL
        print("DATABASE_URL is not a valid database URL.", file=sys.stderr)
        return 2
    try:
        provider = None if catalog_only else _make_provider()  # catalog-only needs no AWS
        engine = _make_engine(url)
        try:
            with Session(engine, autoflush=False, expire_on_commit=False) as db:
                report = ingest_knowledge(db, provider, root, force=force, catalog_only=catalog_only)
        finally:
            engine.dispose()
    except IngestError as exc:
        print(exc, file=sys.stderr)
        return 1
    except (IngestAbort, EmbeddingConfigurationError) as exc:
        print(f"Aborted: {exc}", file=sys.stderr)
        return 2
    except (OperationalError, InterfaceError) as exc:
        reason = (str(exc.orig).strip().splitlines() or ["unknown"])[0]  # never the URL
        print(f"Database connection problem: {reason}", file=sys.stderr)
        return 2
    except SQLAlchemyError:
        print("A database error stopped the document being ingested; nothing from it was written.", file=sys.stderr)
        return 1
    print(report)
    return 1 if report.failed else 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Ingest the coffee knowledge base.")
    parser.add_argument("--dry-run", action="store_true", help="validate and chunk only; no database or embeddings")
    parser.add_argument("--force", action="store_true", help="re-embed everything, even after a model change")
    parser.add_argument(
        "--catalog-only", action="store_true", help="only sync catalog_recipes: no embeddings, no AWS, no documents or chunks"
    )
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="knowledge folder (default: backend/knowledge/cafe)")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:  # argparse exits 2 on usage errors, keep it as a return code
        return int(exc.code or 0)
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    root = Path(args.root)
    if args.dry_run and args.catalog_only:
        print("--catalog-only cannot be combined with --dry-run (a dry run writes nothing).", file=sys.stderr)
        return 2
    if args.dry_run:
        return _dry_run(root)
    # Read the shell variable only: falling back to backend/.env could target another database.
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL is not set: pass it inline (this script never falls back to backend/.env).", file=sys.stderr)
        return 2
    return _ingest(url, root, args.force, args.catalog_only)


if __name__ == "__main__":
    sys.exit(main())
