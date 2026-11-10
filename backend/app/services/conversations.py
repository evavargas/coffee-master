"""Conversation reads and creation: the caller's list, one conversation, recipe refs and stored proposals."""

import logging
from collections.abc import Sequence

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.chat import ChatMessage, Conversation
from app.models.recipe import RecipeProposal, UserRecipe
from app.schemas.chat import ConversationSummary, StoredMessage, StoredProposal
from app.schemas.recipe import RecipeData, RecipeRef
from app.services import recipes as recipes_service
from app.services.chat import ConversationNotFoundError

logger = logging.getLogger(__name__)


class RecipeRefNotFoundError(Exception):
    """The ref is unknown, unavailable to the caller or someone else's (indistinguishable on purpose)."""


def _refs(db: Session, rows: Sequence[Conversation]) -> dict[int, RecipeRef]:
    slugs = recipes_service.catalog_slugs(db, [r.catalog_recipe_id for r in rows if r.catalog_recipe_id])
    refs: dict[int, RecipeRef] = {}
    for r in rows:
        if r.catalog_recipe_id in slugs:
            refs[r.id] = RecipeRef(kind="catalog", ref=slugs[r.catalog_recipe_id])
        elif r.user_recipe_id is not None:
            refs[r.id] = RecipeRef(kind="user", ref=r.user_recipe_id)
    return refs


def conversation_ref(db: Session, conversation_id: int) -> RecipeRef | None:
    """The recipe ref of one conversation (same rules as the detail endpoint); the caller checked ownership."""
    row = db.get(Conversation, conversation_id)
    return _refs(db, [row]).get(conversation_id) if row else None


def list_conversations(
    db: Session, user_id: int, limit: int, offset: int
) -> tuple[list[ConversationSummary], int]:
    """The caller's conversations, most recent activity first (id breaks ties), plus the total count."""
    last_message = (
        select(ChatMessage.conversation_id.label("cid"), func.max(ChatMessage.created_at).label("at"))
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(Conversation.user_id == user_id)
        .group_by(ChatMessage.conversation_id)
        .subquery()
    )
    activity = func.coalesce(last_message.c.at, Conversation.created_at)
    total = db.scalar(select(func.count()).select_from(Conversation).where(Conversation.user_id == user_id)) or 0
    rows = db.execute(
        select(Conversation, activity.label("updated_at"))
        .outerjoin(last_message, last_message.c.cid == Conversation.id)
        .where(Conversation.user_id == user_id)
        .order_by(activity.desc(), Conversation.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    refs = _refs(db, [c for c, _ in rows])
    return [
        ConversationSummary(id=c.id, recipe_ref=refs.get(c.id), created_at=c.created_at, updated_at=updated)
        for c, updated in rows
    ], total


def _owned(db: Session, user_id: int, conversation_id: int) -> Conversation:
    row = db.scalars(
        select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
    ).one_or_none()
    if row is None:
        raise ConversationNotFoundError
    return row


def stored_messages(db: Session, messages: Sequence[ChatMessage]) -> list[StoredMessage]:
    """Messages with their proposal (one extra query for the whole page). Unreadable proposal data gives null."""
    ids = [m.id for m in messages if m.role == "assistant"]
    proposals: dict[int, StoredProposal] = {}
    if ids:
        rows = db.scalars(
            select(RecipeProposal).where(RecipeProposal.message_id.in_(ids)).order_by(RecipeProposal.id)
        )
        for row in rows:  # a message has one proposal in practice; the latest wins
            try:
                proposals[row.message_id] = StoredProposal(
                    proposal_id=row.id, recipe=RecipeData(**row.data), saved_recipe_id=row.saved_recipe_id
                )
            except (ValidationError, TypeError, ValueError):
                logger.warning("Proposal %s has data that no longer validates; omitting it", row.id)
                proposals.pop(row.message_id, None)
    return [StoredMessage(role=m.role, content=m.content, proposal=proposals.get(m.id)) for m in messages]


def get_conversation(
    db: Session, user_id: int, conversation_id: int
) -> tuple[Conversation, RecipeRef | None, list[StoredMessage]]:
    row = _owned(db, user_id, conversation_id)
    messages = db.scalars(
        select(ChatMessage).where(ChatMessage.conversation_id == row.id).order_by(ChatMessage.id)
    ).all()
    return row, _refs(db, [row]).get(row.id), stored_messages(db, messages)


def create_conversation(db: Session, user_id: int, ref: RecipeRef | None) -> ConversationSummary:
    """A new empty conversation, optionally about a catalog recipe or one of the caller's own."""
    catalog_id: int | None = None
    user_recipe_id: int | None = None
    if ref is not None and ref.kind == "catalog" and isinstance(ref.ref, str):
        try:
            catalog_id = recipes_service.resolve_catalog_recipe(db, user_id, ref.ref)[0].id
        except recipes_service.CatalogRecipeNotFound as exc:
            raise RecipeRefNotFoundError from exc
    elif ref is not None and ref.kind == "user" and isinstance(ref.ref, int) and not isinstance(ref.ref, bool):
        user_recipe_id = db.scalar(
            select(UserRecipe.id).where(UserRecipe.id == ref.ref, UserRecipe.user_id == user_id)
        )
        if user_recipe_id is None:
            raise RecipeRefNotFoundError
    elif ref is not None:
        raise RecipeRefNotFoundError  # wrong ref type for its kind
    row = Conversation(user_id=user_id, catalog_recipe_id=catalog_id, user_recipe_id=user_recipe_id)
    db.add(row)
    db.commit()
    return ConversationSummary(id=row.id, recipe_ref=ref, created_at=row.created_at, updated_at=row.created_at)
