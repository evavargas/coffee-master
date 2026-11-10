import asyncio
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError
from sqlalchemy import event, func, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.models.knowledge import EMBEDDING_DIMENSIONS, KnowledgeChunk, KnowledgeDocument
from app.rag.corpus import load_knowledge
from app.rag.embeddings import EmbeddingConfigurationError, EmbeddingUnavailableError
from app.rag.ingest import ingest_knowledge
import app.rag.retrieval as retrieval_module
from app.rag.retrieval import RetrievalUnavailableError, retrieve, retrieve_with_timeout
from tests.fake_embeddings import FakeEmbeddingProvider

REAL_ROOT = Path(__file__).resolve().parents[1] / "knowledge" / "cafe"
KW = {"k": 5, "min_score": 0.25, "max_chars": 6000}


def axis(i: int, j: int | None = None, weight: float = 0.0) -> list[float]:
    """Unit-ish vector on axis i, optionally mixed with axis j."""
    v = [0.0] * EMBEDDING_DIMENSIONS
    v[i] = 1.0
    if j is not None:
        v[j] = weight
    return v


@pytest.fixture
def db(db_engine):
    with Session(db_engine, autoflush=False, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def doc(db) -> KnowledgeDocument:
    d = KnowledgeDocument(path="a.md", type="guide", title="Guide A", content_hash="h", embedding_model="m")
    db.add(d)
    db.commit()
    return d


def add_chunk(db, doc, ordinal, text, vector, status="validated", type_="guide", recipe_id=None, heading="A > B"):
    db.add(
        KnowledgeChunk(
            document_id=doc.id, ordinal=ordinal, heading_path=heading, text=text, content_hash=f"h{ordinal}",
            status=status, meta={"type": type_, "status": status, "recipe_id": recipe_id, "title": doc.title},
            embedding=vector,
        )
    )
    db.commit()


def provider_for(vector: list[float]) -> FakeEmbeddingProvider:
    return FakeEmbeddingProvider(vectors={"q": vector})


def test_scores_are_cosine_similarity_and_ordered(db, doc):
    add_chunk(db, doc, 0, "orthogonal", axis(2))
    add_chunk(db, doc, 1, "half", axis(0, 1, 1.0))  # cos = 1/sqrt(2) with the query on axis 0
    add_chunk(db, doc, 2, "identical", axis(0))
    out = retrieve(db, provider_for(axis(0)), "q", k=5, min_score=0.0, max_chars=6000)
    assert [r.text for r in out] == ["identical", "half", "orthogonal"]
    assert out[0].score == pytest.approx(1.0)
    assert out[1].score == pytest.approx(2**-0.5)
    assert out[2].score == pytest.approx(0.0, abs=1e-9)


def test_results_carry_metadata(db, doc):
    add_chunk(db, doc, 0, "t", axis(0), status="testing", type_="recipe", recipe_id="r1", heading="H1 > H2")
    (r,) = retrieve(db, provider_for(axis(0)), "q", **KW)
    assert (r.status, r.type, r.recipe_id, r.title, r.heading_path) == ("testing", "recipe", "r1", "Guide A", "H1 > H2")


def test_below_min_score_dropped_so_unrelated_query_is_empty(db, doc):
    add_chunk(db, doc, 0, "t", axis(1))
    assert retrieve(db, provider_for(axis(0)), "q", **KW) == []


def test_k_limits_results(db, doc):
    for i in range(4):
        add_chunk(db, doc, i, f"t{i}", axis(0, i + 1, 0.1 * (i + 1)))
    out = retrieve(db, provider_for(axis(0)), "q", k=2, min_score=0.0, max_chars=6000)
    assert [r.text for r in out] == ["t0", "t1"]


def test_statuses_filter(db, doc):
    add_chunk(db, doc, 0, "v", axis(0), status="validated")
    add_chunk(db, doc, 1, "n", axis(0), status="not_recommended")
    out = retrieve(db, provider_for(axis(0)), "q", statuses=("validated",), **KW)
    assert [r.text for r in out] == ["v"]
    both = retrieve(db, provider_for(axis(0)), "q", **KW)
    assert {r.status for r in both} == {"validated", "not_recommended"}


def test_duplicate_text_collapsed_keeping_best(db, doc):
    add_chunk(db, doc, 0, "same  text", axis(0, 1, 0.5))
    add_chunk(db, doc, 1, "Same text", axis(0))
    add_chunk(db, doc, 2, "other", axis(0, 2, 1.0))
    out = retrieve(db, provider_for(axis(0)), "q", **KW)
    assert [r.text for r in out] == ["Same text", "other"]


def test_budget_skips_chunk_that_does_not_fit_and_keeps_smaller_later(db, doc):
    add_chunk(db, doc, 0, "a" * 40, axis(0))
    add_chunk(db, doc, 1, "b" * 100, axis(0, 1, 0.2))
    add_chunk(db, doc, 2, "c" * 20, axis(0, 2, 0.4))
    out = retrieve(db, provider_for(axis(0)), "q", k=5, min_score=0.0, max_chars=70)
    assert [r.text for r in out] == ["a" * 40, "c" * 20]


def test_first_chunk_always_included_even_over_budget_and_never_truncated(db, doc):
    add_chunk(db, doc, 0, "x" * 500, axis(0))
    add_chunk(db, doc, 1, "y" * 10, axis(0, 1, 0.5))
    out = retrieve(db, provider_for(axis(0)), "q", k=5, min_score=0.0, max_chars=50)
    assert [r.text for r in out] == ["x" * 500]


@pytest.mark.parametrize("query", ["", "   \n\t"])
def test_blank_query_returns_empty_without_provider_call(db, query):
    provider = FakeEmbeddingProvider()
    assert retrieve(db, provider, query, **KW) == []
    assert provider.calls == []


def test_provider_called_once_as_query_before_any_statement(db_engine, db, doc):
    add_chunk(db, doc, 0, "t", axis(0))
    statements: list[str] = []
    seen_at_embed: list[int] = []
    provider = FakeEmbeddingProvider(vectors={"q": axis(0)}, on_embed=lambda: seen_at_embed.append(len(statements)))
    db.rollback()  # end the implicit transaction so no BEGIN-time statement is pending
    listener = lambda conn, cursor, statement, *a: statements.append(statement)  # noqa: E731
    event.listen(db_engine, "before_cursor_execute", listener)
    try:
        retrieve(db, provider, " q ", **KW)
    finally:
        event.remove(db_engine, "before_cursor_execute", listener)
    assert provider.calls == [{"texts": ["q"], "kind": "query"}]
    assert seen_at_embed == [0]
    assert statements


@pytest.mark.parametrize("error", [EmbeddingUnavailableError("down"), EmbeddingConfigurationError("bad")])
def test_embedding_failures_become_retrieval_unavailable(db, error):
    with pytest.raises(RetrievalUnavailableError) as info:
        retrieve(db, FakeEmbeddingProvider(error=error), "secret question", **KW)
    assert info.value.__cause__ is error
    assert "secret question" not in str(info.value)


def test_database_failure_becomes_retrieval_unavailable(db, monkeypatch):
    boom = OperationalError("SELECT secret-password", {}, Exception("conn refused"))

    def fail(*args, **kwargs):
        raise boom

    monkeypatch.setattr(db, "execute", fail)
    with pytest.raises(RetrievalUnavailableError) as info:
        retrieve(db, provider_for(axis(0)), "q", **KW)
    assert info.value.__cause__ is boom
    message = str(info.value).lower()
    assert "secret-password" not in message and "password" not in message


def test_settings_defaults():
    s = Settings(jwt_secret="x", _env_file=None)
    assert (s.rag_top_k, s.rag_min_score, s.rag_context_max_chars, s.rag_retrieval_timeout_seconds) == (5, 0.25, 6000, 5.0)


def run(coro):
    return asyncio.run(coro)


def test_timeout_wrapper_returns_results_and_closes_own_session(db_engine, db, doc):
    add_chunk(db, doc, 0, "t", axis(0))
    created: list[Session] = []
    base = sessionmaker(bind=db_engine)

    def factory() -> Session:
        session = base()
        session.close = MagicMock(wraps=session.close)  # type: ignore[method-assign]
        created.append(session)
        return session

    out = run(retrieve_with_timeout(factory, provider_for(axis(0)), "q", timeout_seconds=5, **KW))
    assert [r.text for r in out] == ["t"]
    assert len(created) == 1
    created[0].close.assert_called_once()


def test_timeout_raises_retrieval_unavailable(db_engine):
    release = threading.Event()
    finished = threading.Event()

    def slow() -> None:
        release.wait(5)
        finished.set()

    provider = FakeEmbeddingProvider(on_embed=slow)
    started = time.monotonic()
    with pytest.raises(RetrievalUnavailableError, match="timed out"):
        run(retrieve_with_timeout(sessionmaker(bind=db_engine), provider, "q", timeout_seconds=0.05, **KW))
    elapsed = time.monotonic() - started
    release.set()  # let the abandoned worker end before the next test truncates the tables
    finished.wait(2)
    time.sleep(0.2)
    assert elapsed < 0.3


@pytest.fixture(autouse=True)
def permits_are_returned():
    yield
    # Let abandoned workers return their permits, then fail the test that leaked one.
    deadline = time.monotonic() + 2
    while retrieval_module._workers._value != retrieval_module.RETRIEVAL_WORKERS and time.monotonic() < deadline:
        time.sleep(0.01)
    assert retrieval_module._workers._value == retrieval_module.RETRIEVAL_WORKERS


def test_saturated_workers_reject_immediately_and_permits_come_back(db_engine):
    release = threading.Event()
    factory = sessionmaker(bind=db_engine)
    n = retrieval_module.RETRIEVAL_WORKERS

    async def scenario() -> FakeEmbeddingProvider:
        for _ in range(n):  # each call times out while its worker stays blocked: the worker is abandoned
            blocked = FakeEmbeddingProvider(on_embed=lambda: release.wait(5))
            with pytest.raises(RetrievalUnavailableError, match="timed out"):
                await retrieve_with_timeout(factory, blocked, "q", timeout_seconds=0.05, **KW)
        ninth = FakeEmbeddingProvider()
        started = time.monotonic()
        with pytest.raises(RetrievalUnavailableError, match="saturated"):
            await retrieve_with_timeout(factory, ninth, "q", timeout_seconds=1, **KW)
        assert time.monotonic() - started < 0.3
        return ninth

    ninth = run(scenario())
    assert ninth.calls == []
    release.set()
    deadline = time.monotonic() + 2
    while retrieval_module._workers._value != n and time.monotonic() < deadline:
        time.sleep(0.01)
    assert retrieval_module._workers._value == n  # permits are back, so a new call is accepted
    assert run(retrieve_with_timeout(factory, FakeEmbeddingProvider(), "q", timeout_seconds=2, **KW)) == []


def test_worker_that_raises_releases_its_permit(db_engine):
    provider = FakeEmbeddingProvider(error=EmbeddingUnavailableError("down"))
    with pytest.raises(RetrievalUnavailableError):
        run(retrieve_with_timeout(sessionmaker(bind=db_engine), provider, "q", timeout_seconds=2, **KW))
    assert retrieval_module._workers._value == retrieval_module.RETRIEVAL_WORKERS


def test_permit_released_when_run_sync_fails_before_starting(db_engine, monkeypatch):
    async def broken(*args, **kwargs):
        raise RuntimeError("could not start")

    monkeypatch.setattr(retrieval_module.anyio.to_thread, "run_sync", broken)
    with pytest.raises(RuntimeError):
        run(retrieve_with_timeout(sessionmaker(bind=db_engine), FakeEmbeddingProvider(), "q", timeout_seconds=1, **KW))
    assert retrieval_module._workers._value == retrieval_module.RETRIEVAL_WORKERS


def test_session_factory_failure_becomes_retrieval_unavailable():
    def factory() -> Session:
        raise OperationalError("connect", {}, Exception("refused"))

    with pytest.raises(RetrievalUnavailableError) as info:
        run(retrieve_with_timeout(factory, provider_for(axis(0)), "q", timeout_seconds=2, **KW))
    assert isinstance(info.value.__cause__, OperationalError)


def test_statement_timeout_set_before_select(db_engine, db):
    statements: list[str] = []
    listener = lambda conn, cursor, statement, *a: statements.append(statement)  # noqa: E731
    event.listen(db_engine, "before_cursor_execute", listener)
    try:
        retrieve(db, provider_for(axis(0)), "q", statement_timeout_ms=1234, **KW)
    finally:
        event.remove(db_engine, "before_cursor_execute", listener)
    assert "set_config" in statements[0]
    assert "knowledge_chunks" in statements[1]


def test_statement_timeout_error_becomes_retrieval_unavailable(db, doc, monkeypatch):
    add_chunk(db, doc, 0, "t", axis(0))
    real_execute = db.execute

    def slow_select(statement, *args, **kwargs):
        if "knowledge_chunks" in str(statement):
            return real_execute(select(func.pg_sleep(1)))
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db, "execute", slow_select)
    with pytest.raises(RetrievalUnavailableError) as info:
        retrieve(db, provider_for(axis(0)), "q", statement_timeout_ms=50, **KW)
    assert isinstance(info.value.__cause__, OperationalError)
    assert info.value.__cause__.orig.sqlstate == "57014"


def test_empty_provider_result_becomes_retrieval_unavailable(db):
    class Empty:
        def embed(self, texts, *, kind):
            return []

    with pytest.raises(RetrievalUnavailableError) as info:
        retrieve(db, Empty(), "q", **KW)
    assert isinstance(info.value.__cause__, IndexError)


def test_status_filter_applies_before_the_limit(db, doc):
    for i in range(5):
        add_chunk(db, doc, i, f"bad{i}", axis(0, i + 2, 0.1 * (i + 1)), status="not_recommended")
    add_chunk(db, doc, 9, "good", axis(0, 1, 2.0), status="validated")
    out = retrieve(db, provider_for(axis(0)), "q", k=1, min_score=0.0, max_chars=6000, statuses=("validated",))
    assert [r.text for r in out] == ["good"]


def test_invalid_settings_rejected():
    for bad in ({"rag_top_k": 0}, {"rag_context_max_chars": 0}, {"rag_min_score": 1.5}, {"rag_min_score": -0.1},
                {"rag_retrieval_timeout_seconds": 0}):
        with pytest.raises(ValidationError):
            Settings(jwt_secret="x", _env_file=None, **bad)


def test_real_knowledge_chunk_comes_back_first(db):
    provider = FakeEmbeddingProvider()
    ingest_knowledge(db, provider, REAL_ROOT)
    chunk = load_knowledge(REAL_ROOT)[0].chunks[0]
    out = retrieve(db, provider, chunk.embed_text, k=5, min_score=0.25, max_chars=10**9)
    assert out and out[0].score == pytest.approx(1.0)
    assert out[0].text == chunk.text
    # The fake's hash vectors are random-like in [0, 1), so unrelated texts are NOT guaranteed to fall below
    # min_score; the only guaranteed property is that nothing unrelated scores 1.0.
    unrelated = retrieve(db, provider, "zzz unrelated string 12345", k=5, min_score=0.25, max_chars=10**9)
    assert all(r.score < 1.0 for r in unrelated)


def test_other_embedding_model_returns_nothing(db, doc):
    add_chunk(db, doc, 0, "stored with m", axis(0))
    assert retrieve(db, FakeEmbeddingProvider(vectors={"q": axis(0)}, model_id="other"), "q", **KW) == []


def test_same_embedding_model_returns_results(db, doc):
    add_chunk(db, doc, 0, "stored with m", axis(0))
    out = retrieve(db, FakeEmbeddingProvider(vectors={"q": axis(0)}, model_id="m"), "q", **KW)
    assert [r.text for r in out] == ["stored with m"]


def test_provider_without_model_id_is_not_filtered(db, doc):
    add_chunk(db, doc, 0, "stored with m", axis(0))
    provider = FakeEmbeddingProvider(vectors={"q": axis(0)})
    assert not hasattr(type(provider), "model_id") and provider.model_id is None
    assert [r.text for r in retrieve(db, provider, "q", **KW)] == ["stored with m"]


def test_model_filter_applies_before_the_limit(db, doc):
    other = KnowledgeDocument(path="b.md", type="guide", title="Guide B", content_hash="h", embedding_model="b")
    db.add(other)
    db.commit()
    for i in range(5):
        add_chunk(db, other, i, f"wrong model {i}", axis(0, i + 2, 0.1 * (i + 1)))
    add_chunk(db, doc, 9, "right model", axis(0, 1, 2.0))
    provider = FakeEmbeddingProvider(vectors={"q": axis(0)}, model_id="m")
    out = retrieve(db, provider, "q", k=1, min_score=0.0, max_chars=6000)
    assert [r.text for r in out] == ["right model"]
