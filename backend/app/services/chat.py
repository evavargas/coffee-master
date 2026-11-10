"""Chat business logic: conversations, quota, server-built context and the streamed model turn.

Persistence order matters: the user message is committed before the model is called
(so disconnecting mid-stream cannot dodge the daily quota), and no database
connection is held while the model streams.
"""

import json
import logging
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import anthropic
from anthropic import AsyncAnthropic
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.agent.prompt import build_system_blocks, render_recipe_context
from app.agent.prompt_guard import SAFE_LEAK_REPLY, StreamingOutputGuard, contains_internal_marker
from app.agent.recipe_tool import PROPOSE_RECIPE_TOOL, TOOL_NAME
from app.core.config import get_settings
from app.models.chat import ChatMessage, Conversation
from app.models.recipe import CatalogRecipe, RecipeProposal, UserRecipe
from app.models.user import utc_now
from app.rag.embeddings import EmbeddingProvider
from app.rag.retrieval import RetrievalUnavailableError, RetrievedChunk, retrieve_with_timeout
from app.schemas.recipe import RecipeData

logger = logging.getLogger(__name__)

# Hidden reasoning also consumes this budget, so it has to leave room for the visible text.
MAX_TOKENS = 8000

INCOMPLETE_REPLY = "No pude completar la respuesta. Probá con una pregunta más concreta."

# Shown when the model only called the tool and wrote no text.
PROPOSAL_READY_REPLY = "Te armé una propuesta de receta. Mirala y, si te gusta, guardala en tu libro."

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
    recipe_context: str | None = None


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


def _build_recipe_context(db: Session, conversation_id: int) -> str | None:
    """Rendered `<recipe_context>` from the conversation's base recipe and latest proposal, or None."""
    conversation = db.get(Conversation, conversation_id)
    base_kind: str | None = None
    base: dict[str, Any] | None = None
    if conversation is not None and conversation.catalog_recipe_id is not None:
        row = db.get(CatalogRecipe, conversation.catalog_recipe_id)
        base_kind, base = "catalog", row.data if row else None
    elif conversation is not None and conversation.user_recipe_id is not None:
        row = db.get(UserRecipe, conversation.user_recipe_id)
        base_kind, base = "user", row.data if row else None
    proposal = db.scalar(
        select(RecipeProposal.data)
        .join(ChatMessage, ChatMessage.id == RecipeProposal.message_id)
        .where(ChatMessage.conversation_id == conversation_id)
        .order_by(RecipeProposal.id.desc())
        .limit(1)
    )
    return render_recipe_context(base_kind, base, proposal)


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
        recipe_context=_build_recipe_context(db, conversation_id),
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


def _save_assistant_message(
    session_factory: SessionFactory, conversation_id: int, text: str, recipe: RecipeData | None = None
) -> int | None:
    """Store the reply (and the proposal, in the same transaction). Returns the proposal id, if any."""
    with session_factory() as db:
        message = ChatMessage(conversation_id=conversation_id, role="assistant", content=text)
        db.add(message)
        proposal: RecipeProposal | None = None
        if recipe is not None:
            db.flush()
            proposal = RecipeProposal(message_id=message.id, data=recipe.model_dump(mode="json"))
            db.add(proposal)
        db.commit()
        return proposal.id if proposal is not None else None


def _unescape(value: Any) -> Any:
    """Undo the prompt's `&lt;` escaping in every string of the tool input (the next render escapes it again)."""
    if isinstance(value, str):
        return value.replace("&lt;", "<")
    if isinstance(value, dict):
        return {k: _unescape(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_unescape(v) for v in value]
    return value


def _extract_proposal(final_message: Any) -> RecipeData | None:
    """The first `propose_recipe` call, if complete, clean and valid. Anything else is logged (never content) and dropped."""
    if getattr(final_message, "stop_reason", None) == "max_tokens":
        # The SDK builds the input from partial JSON, so a cut-off call can look valid.
        logger.warning("Discarded a recipe proposal: the reply was truncated at max_tokens")
        return None
    for block in getattr(final_message, "content", None) or []:
        if getattr(block, "type", None) != "tool_use" or getattr(block, "name", None) != TOOL_NAME:
            continue
        data = _unescape(block.input)
        if contains_internal_marker(json.dumps(data, ensure_ascii=False)):
            logger.warning("Discarded a recipe proposal that contained internal prompt markers")
            return None
        try:
            return RecipeData.model_validate(data)
        except ValidationError as exc:
            problems = [(".".join(str(p) for p in e["loc"]), e["msg"]) for e in exc.errors()]
            logger.warning("Discarded an invalid recipe proposal: %s", problems)
    return None


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


async def _retrieve_for_turn(
    session_factory: SessionFactory, provider: EmbeddingProvider | None, message: str
) -> list[RetrievedChunk] | None:
    """Chunks for the prompt, or None to use the full knowledge. Never logs text."""
    settings = get_settings()
    if not settings.rag_enabled:
        logger.info("Chat turn knowledge: disabled")
        return None
    if provider is None:  # RAG is on but the provider could not be built
        logger.info("Chat turn knowledge: fallback_error")
        return None
    try:
        chunks = await retrieve_with_timeout(
            session_factory,
            provider,
            message,
            k=settings.rag_top_k,
            min_score=settings.rag_min_score,
            max_chars=settings.rag_context_max_chars,
            timeout_seconds=settings.rag_retrieval_timeout_seconds,
        )
    except RetrievalUnavailableError as exc:
        logger.warning(
            "Retrieval unavailable (%s, cause %s); using the full knowledge",
            type(exc).__name__,
            type(exc.__cause__).__name__,
        )
        logger.info("Chat turn knowledge: fallback_error")
        return None
    except Exception as exc:  # noqa: BLE001
        # Any retrieval bug must not fail the turn: the full knowledge is available. CancelledError and
        # KeyboardInterrupt are BaseException, so they still propagate. Never log the message or a traceback.
        logger.warning(
            "Retrieval failed unexpectedly (%s, cause %s); using the full knowledge",
            type(exc).__name__,
            type(exc.__cause__).__name__,
        )
        logger.info("Chat turn knowledge: fallback_error")
        return None
    if not chunks and settings.rag_fallback_on_empty:
        logger.info("Chat turn knowledge: fallback_empty")
        return None
    logger.info(
        "Chat turn knowledge: rag chunks=%d best_score=%s",
        len(chunks),
        f"{chunks[0].score:.3f}" if chunks else "n/a",
    )
    return chunks


async def stream_turn(
    client: AsyncAnthropic,
    session_factory: SessionFactory,
    embedding_provider: EmbeddingProvider | None,
    turn: PreparedTurn,
    user_name: str,
    message: str,
) -> AsyncIterator[ChatEvent]:
    """Run the model and yield the SSE events (start, delta*, replace?, recipe?, then done or error).

    Client disconnects surface as cancellation/GeneratorExit at a yield or await. They are
    deliberately not caught: the user message stays and no partial reply is saved.
    """
    yield "start", {"conversation_id": turn.conversation_id}

    guard = StreamingOutputGuard()
    parts: list[str] = []
    tail = ""
    recipe: RecipeData | None = None
    proposal_id: int | None = None
    try:
        retrieved = await _retrieve_for_turn(session_factory, embedding_provider, message)
        async with client.messages.stream(
            model=get_settings().anthropic_model,
            max_tokens=MAX_TOKENS,
            output_config={"effort": get_settings().anthropic_effort},
            system=build_system_blocks(user_name, retrieved, turn.recipe_context),
            tools=[PROPOSE_RECIPE_TOOL],
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
                final_message = await stream.get_final_message()
                _log_turn_result(final_message)
                recipe = _extract_proposal(final_message)

        tail = guard.finish()
        reply = SAFE_LEAK_REPLY if guard.blocked else "".join(parts) + tail
        # The model ran and was billed, so this is a real turn: it stays stored and counts for the quota.
        incomplete = not reply.strip()
        if incomplete:
            logger.warning("The model produced no text; answering with a fallback message")
            reply = PROPOSAL_READY_REPLY if recipe is not None else INCOMPLETE_REPLY
        proposal_id = await run_in_threadpool(
            _save_assistant_message, session_factory, turn.conversation_id, reply, recipe
        )
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
    if recipe is not None and proposal_id is not None:
        yield "recipe", {"proposal_id": proposal_id, "recipe": recipe.model_dump(mode="json")}
    yield "done", {}
