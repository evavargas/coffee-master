"""Fixed-window rate limiting, keyed by client IP and endpoint group.

State lives in process memory. That is enough for a single-instance deploy;
with several workers or instances, move the counters to Redis or similar.
"""

import math
from collections import defaultdict, deque
from collections.abc import Callable
from threading import Lock
from time import monotonic

from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings, get_settings

WINDOW_SECONDS = 60


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str, limit: int, window_seconds: int = WINDOW_SECONDS) -> float | None:
        """Record one request. Return None if allowed, or the seconds until the next slot if not."""
        now = monotonic()
        with self._lock:
            timestamps = self._hits[key]
            while timestamps and now - timestamps[0] >= window_seconds:
                timestamps.popleft()
            if len(timestamps) >= limit:
                return window_seconds - (now - timestamps[0])
            timestamps.append(now)
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


rate_limiter = RateLimiter()


def rate_limit(scope: str, get_limit: Callable[[Settings], int]) -> Callable:
    """Build a FastAPI dependency that limits requests per client IP within `scope`."""

    def dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        retry_after = rate_limiter.hit(f"{scope}:{client_ip}", get_limit(get_settings()))
        if retry_after is not None:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiados intentos. Esperá un minuto y volvé a probar.",
                headers={"Retry-After": str(math.ceil(retry_after))},
            )

    return dependency


auth_rate_limit = Depends(rate_limit("auth", lambda s: s.rate_limit_auth_per_minute))
chat_rate_limit = Depends(rate_limit("chat", lambda s: s.rate_limit_chat_per_minute))
conversations_rate_limit = Depends(rate_limit("conversations", lambda s: s.rate_limit_conversations_per_minute))
recipes_rate_limit = Depends(rate_limit("recipes", lambda s: s.rate_limit_recipes_per_minute))
