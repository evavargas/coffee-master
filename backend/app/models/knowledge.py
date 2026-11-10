"""Persistence for the RAG knowledge base: ingested documents and their embedded chunks."""

from datetime import datetime
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.user import utc_now

# Fixed in the model and in migration 0003: changing it means a new migration plus a forced re-embedding.
EMBEDDING_DIMENSIONS = 1024


class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"
    __table_args__ = (
        UniqueConstraint("path", name="uq_knowledge_documents_path"),
        CheckConstraint("type IN ('recipe', 'guide')", name="ck_knowledge_documents_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Relative path under the knowledge folder.
    path: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(255))
    content_hash: Mapped[str] = mapped_column(String(64))
    # Model id used to embed the chunks, for example `cohere.embed-v4:0`.
    embedding_model: Mapped[str] = mapped_column(String(100))
    ingested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    last_error: Mapped[str | None] = mapped_column(Text)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        UniqueConstraint("document_id", "ordinal", name="uq_knowledge_chunks_document_id_ordinal"),
        CheckConstraint(
            "status IN ('validated', 'testing', 'not_recommended')", name="ck_knowledge_chunks_status"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("knowledge_documents.id", name="fk_knowledge_chunks_document_id", ondelete="CASCADE")
    )
    ordinal: Mapped[int] = mapped_column(Integer)
    heading_path: Mapped[str] = mapped_column(String(500))
    text: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20))
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # shortcut: exact scan below a few thousand chunks, add an HNSW index (vector_cosine_ops) when chunks exceed ~5000
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIMENSIONS))
    catalog_recipe_id: Mapped[int | None] = mapped_column(
        ForeignKey("catalog_recipes.id", name="fk_knowledge_chunks_catalog_recipe_id", ondelete="SET NULL"),
        index=True,
    )
