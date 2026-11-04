"""Chat business logic: conversations, quota, server-built context and the streamed model turn.

Persistence order matters: the user message is committed before the model is called
(so disconnecting mid-stream cannot dodge the daily quota), and no database
connection is held while the model streams.
"""

import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import anthropic
from anthropic import AsyncAnthropic
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.agent.prompt import build_system_blocks
from app.agent.prompt_guard import SAFE_LEAK_REPLY, StreamingOutputGuard
from app.core.config import get_settings
from app.models.chat import ChatMessage, Conversation
from app.models.user import utc_now

logger = logging.getLogger(__name__)

# Hidden reasoning also consumes this budget, so it has to leave room for the visible text.
MAX_TOKENS = 8000

INCOMPLETE_REPLY = "No pude completar la respuesta. Probá con una pregunta más concreta."

ERROR_MODEL_BUSY = "model_busy"
ERROR_MODEL_UNAVAILABLE = "model_unavailable"
_BUSY_STATUS_CODES = (429, 529)
_BUSY_ERROR_TYPES = ("overloaded_error", "rate_limit_error")

SessionFactory = Callable[[], Session]
ChatEvent = tuple[str, dict[str, Any]]


class ConversationNotFoundError(Exception):
    """The conversation does not exist or belongs to another user (indistinguishable on purpose)."""


class DailyLimitReachedError(Exception):
    def __init__(self, retry_after_seconds: int) -> None:
        super().__init__("Daily message limit reached")
        self.retry_after_seconds = retry_after_seconds


@dataclass(frozen=True)
class PreparedTurn:
    conversation_id: int
    user_message_id: int
    context: list[dict[str, str]]


def _start_of_today_utc() -> datetime:
    return utc_now().replace(hour=0, minute=0, second=0, microsecond=0)


def _count_user_messages_today(db: Session, user_id: int) -> int:
    return db.scalar(
        select(func.count(ChatMessage.id))
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(Conversation.user_id == user_id)
        .where(ChatMessage.role == "user")
        .where(ChatMessage.created_at >= _start_of_today_utc())
    ) or 0


def _seconds_until_utc_midnight() -> int:
    next_midnight = _start_of_today_utc() + timedelta(days=1)
    return max(1, int((next_midnight - utc_now()).total_seconds()))


def _build_context(db: Session, conversation_id: int) -> list[dict[str, str]]:
    """Last N stored messages, chronological, trimmed so the first one is from the user."""
    rows = db.execute(
        select(ChatMessage.role, ChatMessage.content)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(ChatMessage.id.desc())
        .limit(get_settings().chat_context_messages)
    ).all()
    context = [{"role": role, "content": content} for role, content in reversed(rows)]
    while context and context[0]["role"] != "user":
        context.pop(0)
    return context


def prepare_turn(db: Session, user_id: int, conversation_id: int | None, message: str) -> PreparedTurn:
    """Validate ownership and quota, store the user message and build the model context."""
    if conversation_id is not None:
        owned = db.scalar(
            select(Conversation.id).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        )
        if owned is None:
            raise ConversationNotFoundError

    if _count_user_messages_today(db, user_id) >= get_settings().chat_daily_message_limit:
        raise DailyLimitReachedError(_seconds_until_utc_midnight())

    if conversation_id is None:
        conversation = Conversation(user_id=user_id)
        db.add(conversation)
        db.flush()
        conversation_id = conversation.id

    user_message = ChatMessage(conversation_id=conversation_id, role="user", content=message)
    db.add(user_message)
    db.commit()
    return PreparedTurn(
        conversation_id=conversation_id,
        user_message_id=user_message.id,
        context=_build_context(db, conversation_id),
    )


def get_latest_conversation(db: Session, user_id: int) -> tuple[int | None, list[ChatMessage]]:
    """The conversation holding the user's most recent message, with all its messages in order."""
    conversation_id = db.scalar(
        select(ChatMessage.conversation_id)
        .join(Conversation, Conversation.id == ChatMessage.conversation_id)
        .where(Conversation.user_id == user_id)
        .order_by(ChatMessage.id.desc())
        .limit(1)
    )
    if conversation_id is None:
        return None, []
    messages = db.scalars(
        select(ChatMessage).where(ChatMessage.conversation_id == conversation_id).order_by(ChatMessage.id)
    ).all()
    return conversation_id, list(messages)


def error_code_for(exc: Exception) -> str:
    """Map a model failure to the client-facing code. Details are logged, never sent."""
    if not isinstance(exc, anthropic.APIStatusError):
        return ERROR_MODEL_UNAVAILABLE
    if exc.status_code in _BUSY_STATUS_CODES:
        return ERROR_MODEL_BUSY
    # An error raised mid-stream arrives on a response that was already 200: only its body tells the type.
    error = exc.body.get("error") if isinstance(exc.body, dict) else None
    if isinstance(error, dict) and error.get("type") in _BUSY_ERROR_TYPES:
        return ERROR_MODEL_BUSY
    return ERROR_MODEL_UNAVAILABLE


def _save_assistant_message(session_factory: SessionFactory, conversation_id: int, text: str) -> None:
    with session_factory() as db:
        db.add(ChatMessage(conversation_id=conversation_id, role="assistant", content=text))
        db.commit()


def _delete_message(session_factory: SessionFactory, message_id: int) -> None:
    with session_factory() as db:
        db.execute(delete(ChatMessage).where(ChatMessage.id == message_id))
        db.commit()


def _log_turn_result(final_message: Any) -> None:
    """Log token usage (never content) and warn on truncation."""
    usage = final_message.usage
    logger.info(
        "Chat turn usage: input=%s output=%s cache_read=%s cache_creation=%s",
        getattr(usage, "input_tokens", None),
        getattr(usage, "output_tokens", None),
        getattr(usage, "cache_read_input_tokens", None),
        getattr(usage, "cache_creation_input_tokens", None),
    )
    if final_message.stop_reason == "max_tokens":
        logger.warning("Reply truncated at max_tokens; raise MAX_TOKENS or shorten the instructions")


async def stream_turn(
    client: AsyncAnthropic,
    session_factory: SessionFactory,
    turn: PreparedTurn,
    user_name: str,
) -> AsyncIterator[ChatEvent]:
    """Run the model and yield the SSE events (start, delta*, replace?, then done or error).

    Client disconnects surface as cancellation/GeneratorExit at a yield or await. They are
    deliberately not caught: the user message stays and no partial reply is saved.
    """
    yield "start", {"conversation_id": turn.conversation_id}

    guard = StreamingOutputGuard()
    parts: list[str] = []
    tail = ""
    try:
        async with client.messages.stream(
            model=get_settings().anthropic_model,
            max_tokens=MAX_TOKENS,
            output_config={"effort": get_settings().anthropic_effort},
            system=build_system_blocks(user_name),
            messages=turn.context,
        ) as stream:
            async for chunk in stream.text_stream:
                safe = guard.feed(chunk)
                if guard.blocked:
                    break  # Leaving the block closes the stream: no more tokens are paid for.
                if safe:
                    parts.append(safe)
                    yield "delta", {"text": safe}
            if not guard.blocked:
                _log_turn_result(await stream.get_final_message())

        tail = guard.finish()
        reply = SAFE_LEAK_REPLY if guard.blocked else "".join(parts) + tail
        # The model ran and was billed, so this is a real turn: it stays stored and counts for the quota.
        incomplete = not reply.strip()
        if incomplete:
            logger.warning("The model produced no text; answering with the incomplete-reply message")
            reply = INCOMPLETE_REPLY
        await run_in_threadpool(_save_assistant_message, session_factory, turn.conversation_id, reply)
    except Exception as exc:
        logger.exception("Chat turn failed (%s)", type(exc).__name__)
        try:
            await run_in_threadpool(_delete_message, session_factory, turn.user_message_id)
        except Exception:
            logger.exception("Could not remove the user message after a failed turn")
        yield "error", {"code": error_code_for(exc)}
        return

    if guard.blocked or incomplete:
        yield "replace", {"text": reply}
    elif tail:
        yield "delta", {"text": tail}
    yield "done", {}
