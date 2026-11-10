"""enable row level security on every public table

Revision ID: 0005_enable_rls
Revises: 0004_fk_indexes
Create Date: 2026-11-10 10:00:00.000000

No policies on purpose: Supabase's Data API (anon/authenticated roles) is denied,
while the backend connects as the table owner (`postgres`), which bypasses RLS.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005_enable_rls"
down_revision: str | None = "0004_fk_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLES: list[str] = [
    "users",
    "verification_codes",
    "conversations",
    "chat_messages",
    "catalog_recipes",
    "user_recipes",
    "saved_catalog_recipes",
    "recipe_proposals",
    "knowledge_documents",
    "knowledge_chunks",
    "alembic_version",
]


def upgrade() -> None:
    # IF EXISTS keeps it idempotent; tables already protected by hand are a no-op.
    for table in TABLES:
        op.execute(f"ALTER TABLE IF EXISTS public.{table} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    # Deliberate no-op: disabling RLS would reopen public access to the Data API.
    pass
