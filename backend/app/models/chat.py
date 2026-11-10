"""Persistence for chat: one conversation per thread, many messages per conversation."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.user import utc_now


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint(
            "catalog_recipe_id IS NULL OR user_recipe_id IS NULL", name="ck_conversations_one_recipe"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    # use_alter: user_recipes.conversation_id points back here, so these FKs are added after the tables.
    catalog_recipe_id: Mapped[int | None] = mapped_column(
        ForeignKey("catalog_recipes.id", name="fk_conversations_catalog_recipe_id", ondelete="RESTRICT", use_alter=True),
        index=True,
    )
    user_recipe_id: Mapped[int | None] = mapped_column(
        ForeignKey("user_recipes.id", name="fk_conversations_user_recipe_id", ondelete="SET NULL", use_alter=True),
        index=True,
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
