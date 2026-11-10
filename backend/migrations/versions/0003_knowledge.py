"""knowledge

Revision ID: 0003_knowledge
Revises: 0002_recipes
Create Date: 2026-11-07 20:00:00.000000
"""

from collections.abc import Sequence

import pgvector.sqlalchemy
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_knowledge"
down_revision: str | None = "0002_recipes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # No schema clause: on Supabase an already enabled extension (in `extensions`) is kept as is.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "knowledge_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("path", sa.String(length=255), nullable=False),
        sa.Column("type", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("embedding_model", sa.String(length=100), nullable=False),
        sa.Column("ingested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.CheckConstraint("type IN ('recipe', 'guide')", name="ck_knowledge_documents_type"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("path", name="uq_knowledge_documents_path"),
    )

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("document_id", sa.Integer(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("heading_path", sa.String(length=500), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        # The dimension is spelled out on purpose: a migration never reads settings.
        sa.Column("embedding", pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=False),
        sa.Column("catalog_recipe_id", sa.Integer(), nullable=True),
        sa.CheckConstraint("status IN ('validated', 'testing', 'not_recommended')", name="ck_knowledge_chunks_status"),
        sa.ForeignKeyConstraint(
            ["document_id"], ["knowledge_documents.id"], name="fk_knowledge_chunks_document_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["catalog_recipe_id"],
            ["catalog_recipes.id"],
            name="fk_knowledge_chunks_catalog_recipe_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("document_id", "ordinal", name="uq_knowledge_chunks_document_id_ordinal"),
    )
    op.create_index(
        op.f("ix_knowledge_chunks_catalog_recipe_id"), "knowledge_chunks", ["catalog_recipe_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_knowledge_chunks_catalog_recipe_id"), table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_documents")
    # The `vector` extension stays installed: other objects may use it.
