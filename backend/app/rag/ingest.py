"""Offline ingestion of `backend/knowledge/cafe` into `knowledge_documents`, `knowledge_chunks` and `catalog_recipes`.

Run by a person or CI after the knowledge changes, never during a chat request. Parsing and validation of
every file happens first; the database is only touched afterwards, one transaction per document.

`catalog_only=True` fills and maintains only `catalog_recipes` (no documents, no chunks, no provider, no AWS).
A normal run also repairs the catalog of an UNCHANGED document without embedding: a repaired validated recipe counts
as `updated`; a repaired guide, `testing` or `not_recommended` recipe counts as `unchanged` plus `archived` when a row
was archived. Report mapping in catalog-only mode: `added` = new catalog rows, `updated` = changed or un-archived rows, `unchanged` =
documents needing no catalog change, `archived` = rows archived (status flip, renamed slug, removed file).

Model id rule: `provider.model_id` when the provider exposes it, otherwise `settings.embedding_model_id`.
"""

import logging
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.knowledge import EMBEDDING_DIMENSIONS, KnowledgeChunk, KnowledgeDocument
from app.models.recipe import CatalogRecipe
from app.models.user import utc_now
from app.rag.corpus import IngestError, KnowledgeItem, load_knowledge
from app.rag.embeddings import (
    EmbeddingConfigurationError,
    EmbeddingProvider,
    EmbeddingUnavailableError,
)
from app.schemas.recipe import RecipeStatus

__all__ = ["IngestAbort", "IngestError", "IngestReport", "ingest_knowledge"]

logger = logging.getLogger(__name__)

REMOVAL_GUARD_MIN_DOCUMENTS = 3  # aborting needs more than this many removals AND more than half of the documents


class IngestAbort(Exception):
    """The run must stop before or while writing (model or dimension mismatch, fatal embedding configuration)."""


@dataclass(frozen=True)
class IngestReport:
    documents: int
    chunks: int
    added: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0
    archived: int = 0
    failed: int = 0


def _model_id(provider: EmbeddingProvider) -> str:
    return getattr(provider, "model_id", None) or get_settings().embedding_model_id


def _check_model(db: Session, model_id: str, force: bool) -> None:
    if force:
        return
    if get_settings().embedding_dimensions != EMBEDDING_DIMENSIONS:
        raise IngestAbort(
            f"embedding_dimensions differs from the model constant ({EMBEDDING_DIMENSIONS}); "
            "re-run with --force to re-embed everything (after a migration for the new size)."
        )
    stale = db.scalars(select(KnowledgeDocument.embedding_model).where(KnowledgeDocument.embedding_model != model_id).distinct()).all()
    if stale:
        raise IngestAbort(
            f"Documents were embedded with {sorted(stale)} but the current model is {model_id}; "
            "re-run with --force to re-embed everything."
        )


def _upsert_catalog(db: Session, item: KnowledgeItem) -> int:
    recipe = item.doc.recipe
    assert recipe is not None
    values = {
        "slug": item.doc.id,
        "status": RecipeStatus.VALIDATED.value,
        "method": recipe.method.value,
        "data": recipe.model_dump(mode="json", exclude_none=False),
        "source_document": item.key,
        "source_section": None,
        "source_hash": item.content_hash,
        "archived_at": None,
    }
    stmt = pg_insert(CatalogRecipe).values(**values)
    stmt = stmt.on_conflict_do_update(index_elements=["slug"], set_={k: v for k, v in values.items() if k != "slug"})
    return db.execute(stmt.returning(CatalogRecipe.id)).scalar_one()


def _archive(db: Session, *conditions) -> int:
    result = db.execute(
        update(CatalogRecipe).where(CatalogRecipe.archived_at.is_(None), *conditions).values(archived_at=utc_now())
    )
    return result.rowcount


def _replace_chunks(db: Session, item: KnowledgeItem, document_id: int, vectors: list[list[float]], catalog_id: int | None) -> None:
    db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id))
    db.add_all(
        KnowledgeChunk(
            document_id=document_id,
            ordinal=c.ordinal,
            heading_path=c.heading_path,
            text=c.text,
            content_hash=c.content_hash,
            status=str(item.doc.status),
            meta=c.meta,
            embedding=vector,
            catalog_recipe_id=catalog_id,
        )
        for c, vector in zip(item.chunks, vectors, strict=True)
    )


def _sync_catalog(db: Session, item: KnowledgeItem) -> tuple[int | None, int]:
    """Upserts or archives the catalog rows of one document; returns (catalog id or None, archived rows)."""
    if item.doc.type == "recipe" and item.doc.status == RecipeStatus.VALIDATED:
        catalog_id = _upsert_catalog(db, item)
        # A renamed id leaves the old slug pointing at this file.
        return catalog_id, _archive(db, CatalogRecipe.source_document == item.key, CatalogRecipe.slug != item.doc.id)
    if item.doc.type == "recipe":
        return None, _archive(db, or_(CatalogRecipe.slug == item.doc.id, CatalogRecipe.source_document == item.key))
    return None, _archive(db, CatalogRecipe.source_document == item.key)  # a guide, possibly a former recipe


def _write_document(
    db: Session, item: KnowledgeItem, existing: KnowledgeDocument | None, vectors: list[list[float]], model_id: str
) -> int:
    """Replaces the document, its chunks and its catalog rows; returns the number of archived catalog rows."""
    catalog_id, archived = _sync_catalog(db, item)
    row = existing or KnowledgeDocument(path=item.key)
    row.type, row.title, row.content_hash = item.doc.type, item.doc.title, item.content_hash
    row.embedding_model, row.ingested_at, row.last_error = model_id, utc_now(), None
    db.add(row)
    db.flush()
    _replace_chunks(db, item, row.id, vectors, catalog_id)
    return archived


def _is_current(existing: KnowledgeDocument | None, item: KnowledgeItem, model_id: str) -> bool:
    return existing is not None and existing.content_hash == item.content_hash and existing.embedding_model == model_id


def _catalog_in_sync(db: Session, item: KnowledgeItem) -> bool:
    """Whether the catalog rows and the chunk links already reflect this document (guides and recipes alike)."""
    stored_chunks = select(KnowledgeChunk.id).join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
    stored_chunks = stored_chunks.where(KnowledgeDocument.path == item.key)
    if item.doc.type == "recipe" and item.doc.status == RecipeStatus.VALIDATED:
        row = db.scalar(select(CatalogRecipe).where(CatalogRecipe.slug == item.doc.id))
        if not (
            row is not None and row.archived_at is None and row.status == RecipeStatus.VALIDATED.value
            and row.source_hash == item.content_hash and row.source_document == item.key
        ):
            return False
        return db.scalar(stored_chunks.where(KnowledgeChunk.catalog_recipe_id.is_distinct_from(row.id)).limit(1)) is None
    conditions = [CatalogRecipe.source_document == item.key]
    if item.doc.type == "recipe":
        conditions.append(CatalogRecipe.slug == item.doc.id)
    if db.scalar(select(CatalogRecipe.id).where(CatalogRecipe.archived_at.is_(None), or_(*conditions)).limit(1)) is not None:
        return False
    return db.scalar(stored_chunks.where(KnowledgeChunk.catalog_recipe_id.is_not(None)).limit(1)) is None


def _repair_catalog(db: Session, item: KnowledgeItem) -> tuple[bool, int]:
    """Re-syncs the catalog of an UNCHANGED document (its chunks stay, so no embedding call).

    The catalog can drift without the file changing, for example after `--catalog-only` archived a row and the
    file came back with the same bytes. Cheaper than re-embedding: run the shared `_sync_catalog` and relink the
    chunks. Returns (repaired, archived rows); repaired is False if another run fixed it first.
    """
    db.execute(select(func.pg_advisory_xact_lock(func.hashtext(item.key))))
    if _catalog_in_sync(db, item):
        db.rollback()
        return False, 0
    catalog_id, archived = _sync_catalog(db, item)
    db.execute(
        update(KnowledgeChunk)
        .where(KnowledgeChunk.document_id == select(KnowledgeDocument.id).where(KnowledgeDocument.path == item.key).scalar_subquery())
        .values(catalog_recipe_id=catalog_id)
    )
    db.commit()
    return True, archived


def _read_existing(db: Session, key: str) -> KnowledgeDocument | None:
    return db.scalar(select(KnowledgeDocument).where(KnowledgeDocument.path == key))


def _check_removals(db: Session, keys: set[str]) -> None:
    """Guards against a wrong or emptied root wiping the corpus."""
    stored = set(db.scalars(select(KnowledgeDocument.path)).all())
    gone = len(stored - keys)
    if gone > REMOVAL_GUARD_MIN_DOCUMENTS and gone * 2 > len(stored):
        raise IngestAbort(
            f"This run would remove {gone} of {len(stored)} documents; check the knowledge root. "
            "Re-run with --force for a deliberate cleanup."
        )


def _record_error(db: Session, key: str, message: str) -> None:
    db.execute(update(KnowledgeDocument).where(KnowledgeDocument.path == key).values(last_error=message))
    db.commit()


def _remove_missing(db: Session, keys: set[str]) -> tuple[int, int]:
    removed = archived = 0
    for path in db.scalars(select(KnowledgeDocument.path).order_by(KnowledgeDocument.path)).all():
        if path in keys:
            continue
        db.execute(delete(KnowledgeDocument).where(KnowledgeDocument.path == path))
        archived += _archive(db, CatalogRecipe.source_document == path)
        db.commit()
        removed += 1
        logger.info("Removed document %s", path)
    return removed, archived


def ingest_knowledge(
    db: Session | None,
    provider: EmbeddingProvider | None,
    root: Path,
    *,
    dry_run: bool = False,
    force: bool = False,
    catalog_only: bool = False,
) -> IngestReport:
    items = load_knowledge(root)
    total_chunks = sum(len(i.chunks) for i in items)
    if dry_run:
        return IngestReport(documents=len(items), chunks=total_chunks)
    if catalog_only:
        if db is None:
            raise IngestAbort("A database session is required unless dry_run is set.")
        return _ingest_catalog_only(db, items, total_chunks, force)
    if db is None or provider is None:
        raise IngestAbort("A database session and an embedding provider are required unless dry_run is set.")

    model_id = _model_id(provider)
    _check_model(db, model_id, force)
    if not force:
        _check_removals(db, {i.key for i in items})
    db.rollback()  # end the read transaction; the loop never holds one while embedding

    counts = {"added": 0, "updated": 0, "unchanged": 0, "archived": 0, "failed": 0}
    for item in items:
        # 1. Short read transaction: decide whether the document changed.
        unchanged = not force and _is_current(_read_existing(db, item.key), item, model_id)
        in_sync = unchanged and _catalog_in_sync(db, item)
        db.rollback()
        if unchanged:
            repaired, archived = (False, 0) if in_sync else _repair_document_catalog(db, item)
            counts["archived"] += archived
            counts["updated" if repaired and item.doc.status == RecipeStatus.VALIDATED and item.doc.type == "recipe" else "unchanged"] += 1
            continue
        # 2. Embed with no transaction open (it would pin a pooler connection during the network call).
        try:
            vectors = provider.embed([c.embed_text for c in item.chunks], kind="document") if item.chunks else []
        except EmbeddingUnavailableError as exc:
            counts["failed"] += 1
            logger.warning("Embedding unavailable for %s", item.key)
            _record_error(db, item.key, str(exc))
            continue
        except EmbeddingConfigurationError as exc:
            raise IngestAbort(f"Embedding configuration error while ingesting {item.key}: {exc}") from exc
        # 3. Write transaction, serialized per path against concurrent runs.
        try:
            outcome, archived = _commit_document(db, item, vectors, model_id, force)
        except Exception:
            db.rollback()
            raise
        counts["archived"] += archived
        if outcome == "unchanged":
            counts["unchanged"] += 1
            continue
        counts[outcome] += 1
        logger.info("Ingested %s (%d chunks)", item.key, len(item.chunks))

    removed, archived = _remove_missing(db, {i.key for i in items})
    counts["archived"] += archived
    logger.info("Ingestion finished: %s, removed=%d", counts, removed)
    return IngestReport(documents=len(items), chunks=total_chunks, removed=removed, **counts)


def _repair_document_catalog(db: Session, item: KnowledgeItem) -> tuple[bool, int]:
    try:
        return _repair_catalog(db, item)
    except Exception:
        db.rollback()
        raise


def _commit_document(
    db: Session, item: KnowledgeItem, vectors: list[list[float]], model_id: str, force: bool
) -> tuple[str, int]:
    """Returns (outcome, archived rows); outcome is "added", "updated" or "unchanged" (another run wrote this version)."""
    db.execute(select(func.pg_advisory_xact_lock(func.hashtext(item.key))))
    existing = _read_existing(db, item.key)
    if not force and _is_current(existing, item, model_id):
        db.rollback()
        return "unchanged", 0
    archived = _write_document(db, item, existing, vectors, model_id)
    db.commit()
    return ("updated" if existing is not None else "added"), archived


def _check_catalog_removals(db: Session, keys: set[str]) -> None:
    active = db.scalars(select(CatalogRecipe.source_document).where(CatalogRecipe.archived_at.is_(None))).all()
    gone = sum(1 for source in active if source not in keys)
    if gone > REMOVAL_GUARD_MIN_DOCUMENTS and gone * 2 > len(active):
        raise IngestAbort(
            f"This run would archive {gone} of {len(active)} catalog recipes; check the knowledge root. "
            "Re-run with --force for a deliberate cleanup."
        )


def _catalog_outcome(db: Session, item: KnowledgeItem, force: bool) -> tuple[str, int]:
    """One document's catalog transaction; returns (outcome, archived rows)."""
    db.execute(select(func.pg_advisory_xact_lock(func.hashtext(item.key))))
    if not force and _catalog_in_sync(db, item):
        db.rollback()
        return "unchanged", 0
    validated = item.doc.type == "recipe" and item.doc.status == RecipeStatus.VALIDATED
    row = db.scalar(select(CatalogRecipe).where(CatalogRecipe.slug == item.doc.id)) if validated else None
    _, archived = _sync_catalog(db, item)
    db.commit()
    if validated:
        return ("added" if row is None else "updated"), archived
    return ("archived" if archived else "unchanged"), archived


def _ingest_catalog_only(db: Session, items: list[KnowledgeItem], total_chunks: int, force: bool) -> IngestReport:
    keys = {i.key for i in items}
    if not force:
        _check_catalog_removals(db, keys)
    db.rollback()
    counts = {"added": 0, "updated": 0, "unchanged": 0, "archived": 0}
    for item in items:
        try:
            outcome, archived = _catalog_outcome(db, item, force)
        except Exception:
            db.rollback()
            raise
        counts["archived"] += archived
        if outcome != "archived":
            counts[outcome] += 1
    # After all upserts, so a moved recipe (same slug, new path) is already pointing at its new file.
    for row_id in db.scalars(
        select(CatalogRecipe.id).where(CatalogRecipe.archived_at.is_(None), CatalogRecipe.source_document.not_in(keys))
    ).all():
        counts["archived"] += _archive(db, CatalogRecipe.id == row_id)
        db.commit()
    logger.info("Catalog sync finished: %s", counts)
    return IngestReport(documents=len(items), chunks=total_chunks, **counts)
