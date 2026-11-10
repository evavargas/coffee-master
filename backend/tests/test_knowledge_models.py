"""Constraint and vector behavior of the knowledge tables, checked against the real Postgres schema."""

import pytest
from sqlalchemy import delete, select
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.knowledge import EMBEDDING_DIMENSIONS, KnowledgeChunk, KnowledgeDocument
from app.models.recipe import CatalogRecipe


def one_hot(index: int) -> list[float]:
    vector = [0.0] * EMBEDDING_DIMENSIONS
    vector[index] = 1.0
    return vector


def make_document(session: Session, path: str = "guias/01.md", **kwargs) -> KnowledgeDocument:
    values = {"type": "guide", "title": "Guide", "content_hash": "h" * 64, "embedding_model": "cohere.embed-v4:0"}
    document = KnowledgeDocument(path=path, **{**values, **kwargs})
    session.add(document)
    session.flush()
    return document


def make_chunk(session: Session, document: KnowledgeDocument, ordinal: int = 0, **kwargs) -> KnowledgeChunk:
    values = {
        "heading_path": "A > B",
        "text": "text",
        "content_hash": "c" * 64,
        "status": "validated",
        "meta": {},
        "embedding": one_hot(0),
    }
    chunk = KnowledgeChunk(document_id=document.id, ordinal=ordinal, **{**values, **kwargs})
    session.add(chunk)
    session.flush()
    return chunk


def test_settings_dimension_matches_model_constant() -> None:
    assert Settings.model_fields["embedding_dimensions"].default == EMBEDDING_DIMENSIONS


def test_duplicate_document_ordinal_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        document = make_document(s)
        make_chunk(s, document, ordinal=0)
        with pytest.raises(IntegrityError):
            make_chunk(s, document, ordinal=0)


def test_duplicate_path_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        make_document(s, path="a.md")
        with pytest.raises(IntegrityError):
            make_document(s, path="a.md")


def test_invalid_type_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        with pytest.raises(IntegrityError):
            make_document(s, type="blog")


def test_invalid_status_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        document = make_document(s)
        with pytest.raises(IntegrityError):
            make_chunk(s, document, status="draft")


def test_deleting_document_cascades_chunks(db_engine) -> None:
    with Session(db_engine) as s:
        document = make_document(s)
        make_chunk(s, document, ordinal=0)
        make_chunk(s, document, ordinal=1)
        s.execute(delete(KnowledgeDocument).where(KnowledgeDocument.id == document.id))
        assert s.scalars(select(KnowledgeChunk)).all() == []


def test_deleting_catalog_recipe_nulls_chunk_reference(db_engine) -> None:
    with Session(db_engine) as s:
        recipe = CatalogRecipe(
            slug="v60", status="validated", method="v60", data={}, source_document="d.md", source_hash="h" * 64
        )
        s.add(recipe)
        s.flush()
        chunk = make_chunk(s, make_document(s), catalog_recipe_id=recipe.id)
        s.execute(delete(CatalogRecipe).where(CatalogRecipe.id == recipe.id))
        s.refresh(chunk)
        assert chunk.catalog_recipe_id is None


def test_cosine_search_returns_closest_vector(db_engine) -> None:
    with Session(db_engine) as s:
        document = make_document(s)
        for ordinal in range(3):
            make_chunk(s, document, ordinal=ordinal, embedding=one_hot(ordinal))
        query = one_hot(2)
        query[1] = 0.2
        rows = s.scalars(select(KnowledgeChunk).order_by(KnowledgeChunk.embedding.cosine_distance(query))).all()
        assert [c.ordinal for c in rows] == [2, 1, 0]


def test_wrong_dimension_rejected(db_engine) -> None:
    with Session(db_engine) as s:
        document = make_document(s)
        with pytest.raises(DataError, match="expected 1024 dimensions, not 1023"):
            make_chunk(s, document, embedding=[0.0] * (EMBEDDING_DIMENSIONS - 1))
