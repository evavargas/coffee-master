"""Semantic retrieval over the embedded knowledge chunks (online chat path)."""

import asyncio
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass

import anyio
import anyio.to_thread
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.rag.embeddings import EmbeddingError, EmbeddingProvider

logger = logging.getLogger(__name__)

# Chat messages are short; this only bounds what a pathological message can send to the embedding model.
MAX_QUERY_CHARS = 2000
DEFAULT_STATUSES = ("validated", "testing", "not_recommended")
DEFAULT_STATEMENT_TIMEOUT_MS = 5000
RETRIEVAL_WORKERS = 8  # own cap so a slow Bedrock cannot exhaust the shared 40-thread pool
CANDIDATE_FACTOR = 3  # fetch k * 3 candidates so thresholding and deduplication still leave k


class RetrievalUnavailableError(Exception):
    """Embedding or database failure; the caller should fall back to the full knowledge."""


@dataclass(frozen=True)
class RetrievedChunk:
    text: str
    title: str
    heading_path: str
    score: float  # cosine similarity, 1.0 for identical vectors
    status: str
    type: str
    recipe_id: str | None


# Caps REAL threads (not event-loop waiters): a permit is returned only when the worker thread finishes.
_workers = threading.BoundedSemaphore(RETRIEVAL_WORKERS)


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def _select_within_budget(candidates: list[RetrievedChunk], k: int, max_chars: int) -> list[RetrievedChunk]:
    chosen: list[RetrievedChunk] = []
    seen: set[str] = set()
    used = 0
    for chunk in candidates:
        key = _normalize(chunk.text)
        if key in seen:
            continue
        # Whole chunks only: a recipe cut in half would be wrong advice. A chunk that does not fit is skipped
        # and smaller ones further down are still tried. The first accepted chunk is always kept, even when it
        # alone exceeds the budget, so a relevant hit is never dropped just for being long.
        if chosen and used + len(chunk.text) > max_chars:
            continue
        seen.add(key)
        chosen.append(chunk)
        used += len(chunk.text)
        if len(chosen) == k:
            break
    return chosen


def retrieve(
    db: Session,
    provider: EmbeddingProvider,
    query: str,
    *,
    k: int,
    min_score: float,
    max_chars: int,
    statuses: tuple[str, ...] = DEFAULT_STATUSES,
    statement_timeout_ms: int = DEFAULT_STATEMENT_TIMEOUT_MS,
) -> list[RetrievedChunk]:
    """Nearest chunks by cosine similarity, best first. Raises RetrievalUnavailableError on any failure.

    The transaction-local `statement_timeout` stays active until the caller's transaction ends when the caller
    passes its own session; production uses `retrieve_with_timeout`, which opens a short-lived session.
    """
    query = query.strip()[:MAX_QUERY_CHARS]
    if not query:
        return []
    try:
        # Embed before touching the database: the caller must not hold a connection during the network call.
        vector = provider.embed([query], kind="query")[0]
    except (EmbeddingError, IndexError) as exc:  # IndexError: a provider that returned no vector
        raise RetrievalUnavailableError("Could not embed the query.") from exc
    distance = KnowledgeChunk.embedding.cosine_distance(vector)
    stmt = (
        select(KnowledgeChunk, KnowledgeDocument.title, (1 - distance).label("score"))
        .join(KnowledgeDocument, KnowledgeDocument.id == KnowledgeChunk.document_id)
        .where(KnowledgeChunk.status.in_(statuses))
        .order_by(distance)
        .limit(max(k * CANDIDATE_FACTOR, k))
    )
    # Vectors from another model are not comparable: scores would be meaningless, so a mismatch is an empty result
    # (the chat then uses its empty fallback). Providers that do not expose their model are not filtered.
    model_id = getattr(provider, "model_id", None)
    if model_id:
        stmt = stmt.where(KnowledgeDocument.embedding_model == model_id)
    try:
        # Transaction-scoped (equals SET LOCAL, which cannot take bind params), so it also works through
        # the Supabase transaction pooler.
        db.execute(select(func.set_config("statement_timeout", str(max(1, statement_timeout_ms)), True)))
        rows = db.execute(stmt).all()
    except SQLAlchemyError as exc:
        raise RetrievalUnavailableError("Could not query the knowledge chunks.") from exc
    candidates = [
        RetrievedChunk(
            text=chunk.text,
            title=title,
            heading_path=chunk.heading_path,
            score=float(score),
            status=chunk.status,
            type=str(chunk.meta.get("type", "")),
            recipe_id=chunk.meta.get("recipe_id"),
        )
        for chunk, title, score in rows
        if score >= min_score
    ]
    results = _select_within_budget(candidates, k, max_chars)
    logger.info(
        "retrieval: %d candidates, %d results, best score %s",
        len(rows),
        len(results),
        f"{rows[0][2]:.3f}" if rows else "n/a",
    )
    return results


async def retrieve_with_timeout(
    session_factory: Callable[[], Session],
    provider: EmbeddingProvider,
    query: str,
    *,
    k: int,
    min_score: float,
    max_chars: int,
    timeout_seconds: float,
    statuses: tuple[str, ...] = DEFAULT_STATUSES,
) -> list[RetrievedChunk]:
    timeout_ms = max(1, int(timeout_seconds * 1000))
    if not _workers.acquire(blocking=False):
        raise RetrievalUnavailableError("Retrieval is saturated.")
    started = threading.Event()
    lock = threading.Lock()
    released = False

    def release() -> None:  # exactly once, whichever of the worker or the caller gets there first
        nonlocal released
        with lock:
            if released:
                return
            released = True
        _workers.release()

    def work() -> list[RetrievedChunk]:
        started.set()
        try:
            with session_factory() as db:  # own short-lived session, so the caller holds no connection
                return retrieve(
                    db, provider, query, k=k, min_score=min_score, max_chars=max_chars, statuses=statuses,
                    statement_timeout_ms=timeout_ms,
                )
        except SQLAlchemyError as exc:
            raise RetrievalUnavailableError("Could not use the database for retrieval.") from exc
        finally:
            release()

    try:
        # The worker thread cannot be cancelled: after a timeout it keeps running in the background, bounded by
        # the embedding client's timeouts (about 14 s: 2 attempts x (2 s connect + 5 s read)) plus the
        # statement timeout. The semaphore caps real threads at RETRIEVAL_WORKERS; its permit comes back only
        # when the thread ends.
        future = anyio.to_thread.run_sync(work, abandon_on_cancel=True)
        return await asyncio.wait_for(future, timeout_seconds)
    except BaseException as exc:
        if not started.is_set():
            release()  # never leak a permit if the work could not start (also after a timeout while queued)
        if isinstance(exc, TimeoutError):
            raise RetrievalUnavailableError("Retrieval timed out.") from exc
        raise
