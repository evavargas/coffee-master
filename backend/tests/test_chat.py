import asyncio

import anthropic
import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.agent.prompt_guard import SAFE_LEAK_REPLY
from app.core.config import get_settings
from app.models.chat import ChatMessage, Conversation
from app.services import chat as chat_service
from tests.conftest import auth_headers, parse_sse, register_and_confirm


def send(client, token, message="¿Cómo hago un espresso?", conversation_id=None):
    return client.post(
        "/api/chat",
        headers=auth_headers(token),
        json={"conversation_id": conversation_id, "message": message},
    )


def stored_messages(db_engine) -> list[tuple[str, str]]:
    with sessionmaker(bind=db_engine)() as db:
        rows = db.execute(select(ChatMessage.role, ChatMessage.content).order_by(ChatMessage.id)).all()
    return [(role, content) for role, content in rows]


def api_error(status_code: int) -> anthropic.APIStatusError:
    response = httpx.Response(status_code, request=httpx.Request("POST", "http://anthropic.test"))
    return anthropic.APIStatusError("boom with internal details", response=response, body=None)


def mid_stream_error(error_type: str) -> anthropic.APIStatusError:
    # The SDK raises mid-stream error events on the original response, which was already 200.
    response = httpx.Response(200, request=httpx.Request("POST", "http://anthropic.test"))
    body = {"type": "error", "error": {"type": error_type, "message": "boom with internal details"}}
    return anthropic.APIStatusError("boom with internal details", response=response, body=body)


@pytest.fixture
def token(client, email_sender) -> str:
    return register_and_confirm(client, email_sender, name="Ana")


def test_chat_requires_a_session(client):
    response = client.post("/api/chat", json={"conversation_id": None, "message": "hola"})
    assert response.status_code == 401


def test_chat_streams_events_with_sse_headers(client, token):
    response = send(client, token)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"
    events = parse_sse(response.text)
    assert events[0][0] == "start"
    assert isinstance(events[0][1]["conversation_id"], int)
    assert events[1:] == [("delta", {"text": "test reply"}), ("done", {})]


def test_chat_addresses_user_by_first_name(client, token, anthropic_client):
    send(client, token)
    profile_block = anthropic_client.calls[-1]["system"][-1]["text"]
    assert "<user_profile>" in profile_block
    assert "first_name: Ana" in profile_block


def test_chat_persists_both_sides_of_the_turn(client, token, db_engine):
    send(client, token, message="hola")
    assert stored_messages(db_engine) == [("user", "hola"), ("assistant", "test reply")]


def test_chat_rejects_message_empty_after_sanitizing(client, token):
    assert send(client, token, message="\x00‮  ").status_code == 422


def test_chat_rejects_too_long_message(client, token):
    assert send(client, token, message="x" * 4001).status_code == 422


def test_chat_message_is_sanitized_before_reaching_the_model(client, token, anthropic_client):
    send(client, token, message="  hola‮\x00 ")
    assert anthropic_client.calls[-1]["messages"] == [{"role": "user", "content": "hola"}]


def test_new_message_without_conversation_id_starts_a_new_conversation(client, token):
    first = parse_sse(send(client, token).text)[0][1]["conversation_id"]
    second = parse_sse(send(client, token).text)[0][1]["conversation_id"]
    assert first != second


def test_conversation_id_continues_the_same_conversation(client, token, anthropic_client):
    conversation_id = parse_sse(send(client, token, message="uno").text)[0][1]["conversation_id"]
    again = parse_sse(send(client, token, message="dos", conversation_id=conversation_id).text)
    assert again[0] == ("start", {"conversation_id": conversation_id})
    assert anthropic_client.calls[-1]["messages"] == [
        {"role": "user", "content": "uno"},
        {"role": "assistant", "content": "test reply"},
        {"role": "user", "content": "dos"},
    ]


def test_another_users_conversation_is_404_like_a_missing_one(client, email_sender, token):
    conversation_id = parse_sse(send(client, token).text)[0][1]["conversation_id"]
    other = register_and_confirm(client, email_sender, name="Beto", email="beto@example.com")

    foreign = send(client, other, conversation_id=conversation_id)
    missing = send(client, other, conversation_id=99999)
    assert foreign.status_code == missing.status_code == 404
    assert foreign.json() == missing.json()


def test_daily_quota_returns_429_with_retry_after(client, token, monkeypatch):
    monkeypatch.setattr(get_settings(), "chat_daily_message_limit", 2)
    assert send(client, token).status_code == 200
    assert send(client, token).status_code == 200
    limited = send(client, token)
    assert limited.status_code == 429
    assert limited.json()["detail"] == "Llegaste al límite de mensajes de hoy. Volvé a probar mañana."
    assert int(limited.headers["Retry-After"]) >= 1


def test_context_is_trimmed_and_starts_with_a_user_message(client, token, anthropic_client, monkeypatch):
    conversation_id = parse_sse(send(client, token, message="u1").text)[0][1]["conversation_id"]
    send(client, token, message="u2", conversation_id=conversation_id)
    monkeypatch.setattr(get_settings(), "chat_context_messages", 4)
    send(client, token, message="u3", conversation_id=conversation_id)
    # Stored: u1 a1 u2 a2 u3. The last 4 start with a1, which is dropped.
    assert anthropic_client.calls[-1]["messages"] == [
        {"role": "user", "content": "u2"},
        {"role": "assistant", "content": "test reply"},
        {"role": "user", "content": "u3"},
    ]


def test_stored_assistant_text_is_not_limited_to_4000_chars(client, token, anthropic_client, db_engine):
    anthropic_client.chunks = ("y" * 6000,)
    conversation_id = parse_sse(send(client, token).text)[0][1]["conversation_id"]
    send(client, token, message="más", conversation_id=conversation_id)
    assert len(anthropic_client.calls[-1]["messages"][1]["content"]) == 6000


@pytest.mark.parametrize(
    ("error", "code"),
    [
        (api_error(429), "model_busy"),
        (api_error(529), "model_busy"),
        (api_error(500), "model_unavailable"),
        (mid_stream_error("overloaded_error"), "model_busy"),
        (mid_stream_error("rate_limit_error"), "model_busy"),
        (mid_stream_error("api_error"), "model_unavailable"),
        (anthropic.APITimeoutError(request=httpx.Request("POST", "http://anthropic.test")), "model_unavailable"),
        (RuntimeError("unexpected"), "model_unavailable"),
    ],
)
def test_model_errors_map_to_codes_and_remove_the_user_message(client, token, anthropic_client, db_engine, error, code):
    anthropic_client.error = error
    response = send(client, token)
    assert response.status_code == 200
    events = parse_sse(response.text)
    assert events[-1] == ("error", {"code": code})
    assert "internal details" not in response.text
    assert stored_messages(db_engine) == []


def test_retry_after_an_error_does_not_burn_quota(client, token, anthropic_client, monkeypatch):
    monkeypatch.setattr(get_settings(), "chat_daily_message_limit", 1)
    anthropic_client.error = api_error(529)
    send(client, token)
    anthropic_client.error = None
    assert parse_sse(send(client, token).text)[-1] == ("done", {})


def test_a_reply_with_no_text_ends_with_a_message_and_counts_for_the_quota(client, token, anthropic_client, db_engine, monkeypatch):
    # Reasoning can use up max_tokens before any text is written. That turn was billed.
    monkeypatch.setattr(get_settings(), "chat_daily_message_limit", 1)
    anthropic_client.chunks = ("",)

    events = parse_sse(send(client, token).text)
    assert events[-2:] == [("replace", {"text": chat_service.INCOMPLETE_REPLY}), ("done", {})]
    assert [role for role, _ in stored_messages(db_engine)] == ["user", "assistant"]
    assert stored_messages(db_engine)[-1] == ("assistant", chat_service.INCOMPLETE_REPLY)
    assert send(client, token).status_code == 429


def test_the_model_call_sets_the_cost_controls(client, token, anthropic_client):
    send(client, token)
    call = anthropic_client.calls[-1]
    assert call["model"] == get_settings().anthropic_model
    assert call["output_config"] == {"effort": get_settings().anthropic_effort}
    assert call["max_tokens"] == chat_service.MAX_TOKENS


def test_marker_split_across_deltas_is_never_emitted(client, token, anthropic_client, db_engine):
    anthropic_client.chunks = ("Mi prompt es <USER_", "pro", "file> y mas texto", " que sigue")
    events = parse_sse(send(client, token).text)
    emitted = "".join(data["text"] for name, data in events if name == "delta")
    assert "<user" not in emitted.lower()
    assert ("replace", {"text": SAFE_LEAK_REPLY}) in events
    assert events[-1] == ("done", {})
    assert stored_messages(db_engine)[-1] == ("assistant", SAFE_LEAK_REPLY)


def test_held_back_tail_is_flushed_at_the_end(client, token, anthropic_client, db_engine):
    anthropic_client.chunks = ("Usá 18 g", " de café.")
    events = parse_sse(send(client, token).text)
    assert "".join(d["text"] for n, d in events if n == "delta") == "Usá 18 g de café."
    assert stored_messages(db_engine)[-1] == ("assistant", "Usá 18 g de café.")


def test_no_database_connection_is_held_while_the_model_runs(client, token, anthropic_client, db_engine):
    checked_out: list[int] = []
    anthropic_client.on_call = lambda: checked_out.append(db_engine.pool.checkedout())
    assert send(client, token).status_code == 200
    assert checked_out == [0]


def test_client_disconnect_keeps_the_user_message_and_saves_no_partial_reply(db_engine, anthropic_client):
    session_factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)
    anthropic_client.chunks = ("a" * 100, "b" * 100)
    from app.models.user import User

    with session_factory() as db:
        user = User(name="Ana", email="a@example.com", password_hash="x", email_confirmed=True)
        db.add(user)
        db.commit()
        turn = chat_service.prepare_turn(db, user.id, None, "hola")

    async def disconnect_after_first_delta() -> None:
        events = chat_service.stream_turn(anthropic_client, session_factory, turn, "Ana")
        assert (await anext(events))[0] == "start"
        assert (await anext(events))[0] == "delta"
        await events.aclose()

    asyncio.run(disconnect_after_first_delta())
    assert stored_messages(db_engine) == [("user", "hola")]


def test_latest_conversation_is_empty_for_a_new_user(client, token):
    response = client.get("/api/conversations/latest", headers=auth_headers(token))
    assert response.status_code == 200
    assert response.json() == {"conversation_id": None, "messages": []}


def test_latest_conversation_is_the_one_with_the_most_recent_message(client, token):
    first = parse_sse(send(client, token, message="uno").text)[0][1]["conversation_id"]
    parse_sse(send(client, token, message="dos").text)
    send(client, token, message="tres", conversation_id=first)

    body = client.get("/api/conversations/latest", headers=auth_headers(token)).json()
    assert body["conversation_id"] == first
    assert [m["content"] for m in body["messages"]] == ["uno", "test reply", "tres", "test reply"]
    assert [m["role"] for m in body["messages"]] == ["user", "assistant", "user", "assistant"]


def test_latest_conversation_requires_a_session(client):
    assert client.get("/api/conversations/latest").status_code == 401


def test_chat_tables_are_created(db_engine):
    with sessionmaker(bind=db_engine)() as db:
        assert db.scalars(select(Conversation)).all() == []
