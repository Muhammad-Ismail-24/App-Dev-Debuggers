"""ASGI security middleware, with an atomic Redis rolling-window backend."""
from collections import deque
import hashlib
from math import ceil
from threading import Lock
from time import monotonic
from uuid import uuid4

from starlette.responses import JSONResponse


class MemoryWindowLimiter:
    """Single-process tests/development only. Use RedisWindowLimiter in Docker."""
    def __init__(self, limit=100, window=10, clock=monotonic):
        self.limit, self.window, self.clock = limit, window, clock
        self.requests, self.lock = {}, Lock()

    async def check(self, client):
        with self.lock:
            now = self.clock()
            # Expire inactive clients too, so the dictionary stays bounded by activity.
            for key in list(self.requests):
                if not self.requests[key] or self.requests[key][-1] <= now - self.window:
                    del self.requests[key]
            queue = self.requests.setdefault(client, deque())
            while queue and queue[0] <= now-self.window:
                queue.popleft()
            if len(queue) >= self.limit:
                return max(1, ceil(queue[0]+self.window-now))
            queue.append(now)
            return 0


class RedisWindowLimiter:
    """Requires an injected redis.asyncio client; Lua is atomic across API workers."""
    SCRIPT = """
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000000 + tonumber(time[2])
local window = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then
    local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
    return math.max(1, math.ceil((tonumber(oldest[2]) + window - now) / 1000000))
end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], math.ceil(window / 1000))
return 0
"""

    def __init__(self, redis_client, limit=100, window=10, prefix="nascon:rate:"):
        self.redis, self.limit, self.window, self.prefix = redis_client, limit, window, prefix

    async def check(self, client):
        key = self.prefix + hashlib.sha256(client.encode()).hexdigest()
        return int(await self.redis.eval(self.SCRIPT, 1, key, int(self.window*1_000_000), self.limit, str(uuid4())))


class SecurityMiddleware:
    def __init__(self, app, limiter, max_body_bytes=1024*1024):
        self.app, self.limiter, self.max_body_bytes = app, limiter, max_body_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope["path"]
        if path.startswith("/api/v1/"):
            # Do not trust client-supplied X-Forwarded-For. Configure trusted
            # proxy handling in Uvicorn if the deployment has a reverse proxy.
            retry = await self.limiter.check((scope.get("client") or ("unknown", 0))[0])
            if retry:
                return await self._reject(scope, receive, send, 429, "RATE_LIMITED", {"Retry-After": str(retry)})
        if scope["method"] == "POST" and path.startswith("/audit/v1/"):
            chunks, total = [], 0
            for key, value in scope["headers"]:
                if key.lower() == b"content-length":
                    try:
                        if int(value) > self.max_body_bytes:
                            return await self._reject(scope, receive, send, 413, "PAYLOAD_TOO_LARGE")
                    except ValueError:
                        pass
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                total += len(chunk)
                if total > self.max_body_bytes:
                    return await self._reject(scope, receive, send, 413, "PAYLOAD_TOO_LARGE")
                chunks.append(chunk)
                if not message.get("more_body", False):
                    break
            replayed = False

            async def replay():
                nonlocal replayed
                if not replayed:
                    replayed = True
                    return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
                return await receive()
            return await self.app(scope, replay, send)
        return await self.app(scope, receive, send)

    @staticmethod
    async def _reject(scope, receive, send, status, code, headers=None):
        response = JSONResponse({"error": {"code": code, "message": code.replace("_", " ").capitalize(),
                                           "details": {}}}, status_code=status, headers=headers)
        await response(scope, receive, send)
