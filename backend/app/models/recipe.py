"""Persistence for recipes: the curated catalog, user-owned recipes, saved catalog entries and chat proposals.

`data` columns hold the JSON of `app.schemas.recipe.RecipeData`; the schema validates it, not the database.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, String, false
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.user import utc_now


class CatalogRecipe(Base):
    __tablename__ = "catalog_recipes"
    __table_args__ = (
        CheckConstraint("status IN ('validated', 'testing', 'not_recommended')", name="ck_catalog_recipes_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20))
    # Denormalized from `data` so the catalog can be filtered by method in SQL.
    method: Mapped[str] = mapped_column(String(32), index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    source_document: Mapped[str] = mapped_column(String(255))
    source_section: Mapped[str | None] = mapped_column(String(255))
    source_hash: Mapped[str] = mapped_column(String(64))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserRecipe(Base):
    __tablename__ = "user_recipes"
    __table_args__ = (
        CheckConstraint(
            "parent_catalog_id IS NULL OR parent_user_id IS NULL", name="ck_user_recipes_one_parent"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", name="fk_user_recipes_user_id"), index=True)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    parent_catalog_id: Mapped[int | None] = mapped_column(
        ForeignKey("catalog_recipes.id", name="fk_user_recipes_parent_catalog_id", ondelete="RESTRICT"), index=True
    )
    parent_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("user_recipes.id", name="fk_user_recipes_parent_user_id", ondelete="SET NULL"), index=True
    )
    conversation_id: Mapped[int | None] = mapped_column(
        ForeignKey("conversations.id", name="fk_user_recipes_conversation_id", ondelete="SET NULL"), index=True
    )
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)  # bumped by content edits only, never by favoriting


class SavedCatalogRecipe(Base):
    __tablename__ = "saved_catalog_recipes"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", name="fk_saved_catalog_recipes_user_id"), primary_key=True
    )
    catalog_recipe_id: Mapped[int] = mapped_column(
        ForeignKey("catalog_recipes.id", name="fk_saved_catalog_recipes_catalog_recipe_id", ondelete="RESTRICT"),
        primary_key=True,
        index=True,
    )
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class RecipeProposal(Base):
    __tablename__ = "recipe_proposals"

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("chat_messages.id", name="fk_recipe_proposals_message_id", ondelete="CASCADE"), index=True
    )
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
    saved_recipe_id: Mapped[int | None] = mapped_column(
        ForeignKey("user_recipes.id", name="fk_recipe_proposals_saved_recipe_id", ondelete="SET NULL"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
