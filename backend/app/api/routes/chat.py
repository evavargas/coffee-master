"""Chat endpoint: streams the coffee agent's reply for the logged-in user."""

import json
from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.deps import get_anthropic_client, get_current_user, get_chat_embedding_provider, get_session_factory
from app.core.rate_limit import chat_rate_limit
from app.db.session import get_db
from app.models.user import User
from app.rag.embeddings import EmbeddingProvider
from app.schemas.chat import ChatRequest
from app.services import chat as chat_service

router = APIRouter(prefix="/api", tags=["chat"], dependencies=[chat_rate_limit])

QUOTA_MESSAGE = "Llegaste al límite de mensajes de hoy. Volvé a probar mañana."
CONVERSATION_NOT_FOUND_MESSAGE = "No encontramos esa conversación."

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

CHAT_DESCRIPTION = """\
Sends one message and streams the agent's reply as Server-Sent Events. The server keeps the
history; the client sends only the new message and, to continue a thread, its `conversation_id`
(null starts a new conversation). The agent addresses the user by first name. Requires a bearer token.

Errors before the stream starts are normal JSON `{"detail": "<Spanish message>"}`.
Once the response is 200, each event is `event: <name>` + `data: <json>` + a blank line:

- `start` `{"conversation_id": int}`: always first.
- `delta` `{"text": str}`: zero or more; append to the assistant bubble.
- `replace` `{"text": str}`: replace the whole assistant bubble with this text (a guard blocked a leak).
- `recipe` `{"proposal_id": int, "recipe": RecipeData}`: at most one, after the last `delta` and before `done`. Sent only when the model proposed a recipe and it passed validation. Nothing is saved to the user's book: the client saves it with `POST /api/me/recipes {"proposal_id"}`.
- `done` `{}`: terminal, success.
- `error` `{"code": "model_busy" | "model_unavailable"}`: terminal, failure. The user message is not kept, so a retry does not duplicate it.
"""

SSE_EXAMPLE = (
    'event: start\ndata: {"conversation_id": 7}\n\n'
    'event: delta\ndata: {"text": "Hola Ana, "}\n\n'
    'event: delta\ndata: {"text": "para un espresso..."}\n\n'
    'event: recipe\ndata: {"proposal_id": 3, "recipe": {"name": "V60 más dulce", "method": "v60", "steps": []}}\n\n'
    "event: done\ndata: {}\n\n"
)


def format_sse(event: str, data: dict) -> str:
    """One SSE frame. `event` is one of start, delta, replace, recipe, done, error."""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def _sse_stream(events: AsyncIterator[chat_service.ChatEvent]) -> AsyncIterator[str]:
    async for name, data in events:
        yield format_sse(name, data)


@router.post(
    "/chat",
    response_model=None,
    response_class=StreamingResponse,
    summary="Ask the coffee agent (streamed)",
    description=CHAT_DESCRIPTION,
    responses={
        200: {
            "description": "Server-Sent Events stream. See the endpoint description for each event payload.",
            "content": {"text/event-stream": {"schema": {"type": "string"}, "example": SSE_EXAMPLE}},
        },
        401: {"description": "Missing, invalid or expired session"},
        404: {"description": "The conversation does not exist or belongs to another user"},
        422: {"description": "Invalid message (empty after sanitizing, or longer than 4000 characters)"},
        429: {"description": "IP rate limit or daily message quota reached; includes Retry-After"},
    },
)
async def chat(
    body: ChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    client: AsyncAnthropic = Depends(get_anthropic_client),
    session_factory: chat_service.SessionFactory = Depends(get_session_factory),
    embedding_provider: EmbeddingProvider | None = Depends(get_chat_embedding_provider),
) -> StreamingResponse:
    user_name = current_user.name
    try:
        turn = await run_in_threadpool(
            chat_service.prepare_turn, db, current_user.id, body.conversation_id, body.message
        )
    except chat_service.ConversationNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, CONVERSATION_NOT_FOUND_MESSAGE) from exc
    except chat_service.DailyLimitReachedError as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            QUOTA_MESSAGE,
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    finally:
        # Dependency cleanup runs only after the stream ends, so release the connection now.
        await run_in_threadpool(db.close)

    events = chat_service.stream_turn(
        client, session_factory, embedding_provider, turn, user_name, body.message
    )
    return StreamingResponse(_sse_stream(events), media_type="text/event-stream", headers=SSE_HEADERS)
