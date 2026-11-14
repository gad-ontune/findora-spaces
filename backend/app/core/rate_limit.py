from __future__ import annotations

import threading
import time
from collections import defaultdict

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.exceptions import RateLimited


class RateLimiter:
    """Redis-backed fixed-window limiter with an in-process fallback.

    The fallback protects a single instance if Redis is unavailable; production deployments
    should rely on the shared Redis limiter so limits apply across API instances.
    """

    def __init__(self, scope: str, limit: int, window_seconds: int):
        self.scope = scope
        self.limit = limit
        self.window = window_seconds
        self._redis: Redis | None = None
        self._redis_checked = False
        self._lock = threading.Lock()
        self._memory: dict[str, list[float]] = defaultdict(list)

    def _client(self) -> Redis | None:
        if self._redis_checked:
            return self._redis
        self._redis_checked = True
        try:
            client = Redis.from_url(settings.redis_url, socket_timeout=0.4, decode_responses=True)
            client.ping()
            self._redis = client
        except RedisError:
            self._redis = None
        return self._redis

    def hit(self, key: str) -> None:
        window_key = f"rl:{self.scope}:{key}"
        client = self._client()
        if client:
            try:
                count = client.incr(window_key)
                if count == 1:
                    client.expire(window_key, self.window)
                if count > self.limit:
                    raise RateLimited()
                return
            except RateLimited:
                raise
            except RedisError:
                pass
        now = time.time()
        with self._lock:
            entries = [t for t in self._memory[window_key] if now - t < self.window]
            entries.append(now)
            self._memory[window_key] = entries
            if len(entries) > self.limit:
                raise RateLimited()
