"""Conversation history endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import conversations_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import (
    ConversationCreate,
    ConversationDetail,
    ConversationListResponse,
    ConversationSummary,
    LatestConversationResponse,
)
from app.services import chat as chat_service
from app.services import conversations as conversations_service

router = APIRouter(prefix="/api/conversations", tags=["chat"], dependencies=[conversations_rate_limit])

_AUTH_RESPONSES = {
    401: {"description": "Missing, invalid or expired session"},
    429: {"description": "Too many requests from this IP"},
}
CONVERSATION_NOT_FOUND = "No encontramos esa conversación."
RECIPE_NOT_FOUND = "Receta no encontrada."


@router.get(
    "",
    response_model=ConversationListResponse,
    summary="List the caller's conversations",
    description=(
        "Only the caller's conversations, most recent activity first (last message, or creation time when empty; "
        "ties broken by newest id). `total` counts all of them. Invalid `limit` or `offset` give 422. "
        "Requires a bearer token."
    ),
    responses={**_AUTH_RESPONSES, 422: {"description": "Invalid limit or offset"}},
)
def list_conversations(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationListResponse:
    items, total = conversations_service.list_conversations(db, current_user.id, limit, offset)
    return ConversationListResponse(items=items, total=total, limit=limit, offset=offset)


@router.post(
    "",
    response_model=ConversationSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Start an empty conversation",
    description=(
        "Creates a conversation, optionally about a recipe: `recipe_ref` is `{kind: \"catalog\", ref: slug}` "
        "(a validated recipe, or an archived one the caller saved, as in `GET /api/recipes/{slug}`) or "
        "`{kind: \"user\", ref: id}` (one of the caller's own recipes). Unknown, unavailable, foreign or "
        "mismatched-type refs (for example a number for a catalog ref, or a boolean) all answer the same 404. "
        "The new conversation is empty, so `/latest` does not return it: open it by id with `GET /{id}`. Extra body fields give 422. Requires a bearer token."
    ),
    responses={
        **_AUTH_RESPONSES,
        404: {"description": "The recipe does not exist or is not available to the caller"},
        422: {"description": "Invalid body or extra fields"},
    },
)
def create_conversation(
    body: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationSummary:
    try:
        return conversations_service.create_conversation(db, current_user.id, body.recipe_ref)
    except conversations_service.RecipeRefNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RECIPE_NOT_FOUND) from exc


@router.get(
    "/latest",
    response_model=LatestConversationResponse,
    summary="Get the latest conversation",
    description=(
        "Returns the conversation holding the user's most recent message, with its messages in "
        "chronological order, plus its `recipe_ref` (same shape as `GET /{id}`, null when none). `conversation_id` "
        "and `recipe_ref` are null and `messages` is empty when the user has no conversation. "
        "Requires a bearer token."
    ),
    responses={
        401: {"description": "Missing, invalid or expired session"},
        429: {"description": "Too many requests from this IP"},
    },
)
def latest_conversation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LatestConversationResponse:
    conversation_id, messages = chat_service.get_latest_conversation(db, current_user.id)
    return LatestConversationResponse(
        conversation_id=conversation_id,
        messages=conversations_service.stored_messages(db, messages),
        recipe_ref=conversations_service.conversation_ref(db, conversation_id) if conversation_id else None,
    )


@router.get(
    "/{conversation_id}",
    response_model=ConversationDetail,
    summary="Get one conversation",
    description=(
        "The conversation's recipe ref and its messages in chronological order; assistant messages may carry "
        "a `proposal`. An unknown id and another user's id give the same 404. Requires a bearer token."
    ),
    responses={**_AUTH_RESPONSES, 404: {"description": "The conversation does not exist or belongs to another user"}},
)
def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetail:
    try:
        row, ref, messages = conversations_service.get_conversation(db, current_user.id, conversation_id)
    except chat_service.ConversationNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, CONVERSATION_NOT_FOUND) from exc
    return ConversationDetail(id=row.id, recipe_ref=ref, messages=messages)
