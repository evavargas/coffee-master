import pytest
from fastapi.testclient import TestClient

ALLOWED_ORIGIN = "http://localhost:3000"


def _preflight(client: TestClient, origin: str, method: str):  # type: ignore[no-untyped-def]
    return client.options(
        "/api/chat",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


@pytest.mark.parametrize("method", ["PATCH", "PUT", "DELETE"])
def test_preflight_allows_patch_put_delete(client: TestClient, method: str) -> None:
    response = _preflight(client, ALLOWED_ORIGIN, method)

    assert response.status_code == 200
    assert method in response.headers["access-control-allow-methods"]


def test_preflight_rejects_unknown_origin(client: TestClient) -> None:
    response = _preflight(client, "http://evil.example", "PATCH")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
