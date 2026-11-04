from scripts.export_openapi import OPENAPI_PATH, render_openapi


def test_openapi_json_is_up_to_date():
    assert OPENAPI_PATH.exists(), "Run: cd backend && .venv/bin/python -m scripts.export_openapi"
    assert OPENAPI_PATH.read_text(encoding="utf-8") == render_openapi(), (
        "backend/openapi.json is stale. Run: cd backend && .venv/bin/python -m scripts.export_openapi"
    )


def test_chat_documents_the_event_stream():
    import json

    spec = json.loads(render_openapi())
    ok = spec["paths"]["/api/chat"]["post"]["responses"]["200"]
    assert "text/event-stream" in ok["content"]
    description = spec["paths"]["/api/chat"]["post"]["description"]
    for event in ("start", "delta", "replace", "done", "error"):
        assert f"`{event}`" in description
