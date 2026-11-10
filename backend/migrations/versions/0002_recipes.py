"""recipes

Revision ID: 0002_recipes
Revises: 0001_baseline
Create Date: 2026-11-07 18:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_recipes"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "catalog_recipes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("source_document", sa.String(length=255), nullable=False),
        sa.Column("source_section", sa.String(length=255), nullable=True),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('validated', 'testing', 'not_recommended')", name="ck_catalog_recipes_status"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_catalog_recipes_slug"), "catalog_recipes", ["slug"], unique=True)
    op.create_index(op.f("ix_catalog_recipes_method"), "catalog_recipes", ["method"], unique=False)

    op.create_table(
        "user_recipes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("parent_catalog_id", sa.Integer(), nullable=True),
        sa.Column("parent_user_id", sa.Integer(), nullable=True),
        sa.Column("conversation_id", sa.Integer(), nullable=True),
        sa.Column("is_favorite", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("parent_catalog_id IS NULL OR parent_user_id IS NULL", name="ck_user_recipes_one_parent"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_recipes_user_id"),
        sa.ForeignKeyConstraint(
            ["parent_catalog_id"], ["catalog_recipes.id"], name="fk_user_recipes_parent_catalog_id", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["parent_user_id"], ["user_recipes.id"], name="fk_user_recipes_parent_user_id", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["conversations.id"], name="fk_user_recipes_conversation_id", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_user_recipes_user_id"), "user_recipes", ["user_id"], unique=False)

    op.create_table(
        "saved_catalog_recipes",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("catalog_recipe_id", sa.Integer(), nullable=False),
        sa.Column("is_favorite", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_saved_catalog_recipes_user_id"),
        sa.ForeignKeyConstraint(
            ["catalog_recipe_id"],
            ["catalog_recipes.id"],
            name="fk_saved_catalog_recipes_catalog_recipe_id",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("user_id", "catalog_recipe_id"),
    )

    op.create_table(
        "recipe_proposals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("saved_recipe_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["message_id"], ["chat_messages.id"], name="fk_recipe_proposals_message_id", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["saved_recipe_id"], ["user_recipes.id"], name="fk_recipe_proposals_saved_recipe_id", ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_recipe_proposals_message_id"), "recipe_proposals", ["message_id"], unique=False)

    # Added after user_recipes exists: user_recipes.conversation_id points back at conversations.
    op.add_column("conversations", sa.Column("catalog_recipe_id", sa.Integer(), nullable=True))
    op.add_column("conversations", sa.Column("user_recipe_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_conversations_catalog_recipe_id",
        "conversations",
        "catalog_recipes",
        ["catalog_recipe_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_conversations_user_recipe_id",
        "conversations",
        "user_recipes",
        ["user_recipe_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_conversations_one_recipe", "conversations", "catalog_recipe_id IS NULL OR user_recipe_id IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint("ck_conversations_one_recipe", "conversations", type_="check")
    op.drop_constraint("fk_conversations_user_recipe_id", "conversations", type_="foreignkey")
    op.drop_constraint("fk_conversations_catalog_recipe_id", "conversations", type_="foreignkey")
    op.drop_column("conversations", "user_recipe_id")
    op.drop_column("conversations", "catalog_recipe_id")
    op.drop_index(op.f("ix_recipe_proposals_message_id"), table_name="recipe_proposals")
    op.drop_table("recipe_proposals")
    op.drop_table("saved_catalog_recipes")
    op.drop_index(op.f("ix_user_recipes_user_id"), table_name="user_recipes")
    op.drop_table("user_recipes")
    op.drop_index(op.f("ix_catalog_recipes_method"), table_name="catalog_recipes")
    op.drop_index(op.f("ix_catalog_recipes_slug"), table_name="catalog_recipes")
    op.drop_table("catalog_recipes")
