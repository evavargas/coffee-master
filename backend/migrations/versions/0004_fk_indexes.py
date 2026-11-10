"""indexes on recipe foreign keys

Revision ID: 0004_fk_indexes
Revises: 0003_knowledge
Create Date: 2026-11-08 10:00:00.000000
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004_fk_indexes"
down_revision: str | None = "0003_knowledge"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEXES: list[tuple[str, str]] = [
    ("conversations", "catalog_recipe_id"),
    ("conversations", "user_recipe_id"),
    ("user_recipes", "parent_catalog_id"),
    ("user_recipes", "parent_user_id"),
    ("user_recipes", "conversation_id"),
    ("saved_catalog_recipes", "catalog_recipe_id"),
    ("recipe_proposals", "saved_recipe_id"),
]


def upgrade() -> None:
    for table, column in INDEXES:
        op.create_index(op.f(f"ix_{table}_{column}"), table, [column])


def downgrade() -> None:
    for table, column in INDEXES:
        op.drop_index(op.f(f"ix_{table}_{column}"), table_name=table)
