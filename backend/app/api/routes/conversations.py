"""Conversation history endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.rate_limit import conversations_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.schemas.chat import LatestConversationResponse, StoredMessage
from app.services import chat as chat_service

router = APIRouter(prefix="/api/conversations", tags=["chat"], dependencies=[conversations_rate_limit])


@router.get(
    "/latest",
    response_model=LatestConversationResponse,
    summary="Get the latest conversation",
    description=(
        "Returns the conversation holding the user's most recent message, with its messages in "
        "chronological order. `conversation_id` is null and `messages` is empty when the user has none. "
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
        messages=[StoredMessage(role=m.role, content=m.content) for m in messages],
    )
