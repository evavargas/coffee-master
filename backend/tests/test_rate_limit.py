from app.core.rate_limit import RateLimiter


def test_limiter_allows_requests_up_to_the_limit():
    limiter = RateLimiter()
    assert [limiter.hit("k", limit=3) for _ in range(3)] == [None, None, None]


def test_limiter_blocks_the_next_request_and_reports_retry_time():
    limiter = RateLimiter()
    for _ in range(3):
        limiter.hit("k", limit=3)
    retry_after = limiter.hit("k", limit=3)
    assert retry_after is not None
    assert 0 < retry_after <= 60


def test_limiter_keys_are_independent():
    limiter = RateLimiter()
    limiter.hit("a", limit=1)
    assert limiter.hit("b", limit=1) is None


def test_login_is_throttled_after_the_auth_limit(client):
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    # Default auth limit is 10 requests per minute per IP.
    statuses = [client.post("/api/auth/login", json=body).status_code for _ in range(11)]
    assert statuses[:10] == [401] * 10
    assert statuses[10] == 429


def test_throttled_response_has_retry_after_and_spanish_detail(client):
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    for _ in range(10):
        client.post("/api/auth/login", json=body)
    response = client.post("/api/auth/login", json=body)
    assert response.status_code == 429
    assert int(response.headers["Retry-After"]) >= 1
    assert "Demasiados intentos" in response.json()["detail"]


def test_chat_has_its_own_limit_separate_from_auth(client):
    # Exhausting the auth limit must not block the chat endpoint.
    body = {"email": "nobody@example.com", "password": "wrong-password"}
    for _ in range(11):
        client.post("/api/auth/login", json=body)
    response = client.post("/api/chat", json={"conversation_id": None, "message": "hola"})
    assert response.status_code == 401
