"""FastAPI application entry point — NaSCon '26 Multi-Sport League Platform.

Port: 8080 (set in docker-compose.yml / Uvicorn invocation; never 8000).
Absolute import root: `app` (e.g. `from app.core.errors import ApiError`).
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.api.router import api_router
from app.core.config import get_settings
import app.core.errors
from app.core.errors import register_exception_handlers
from app.db.seed import is_seeded, seed_all
from app.db.session import init_db, session_scope, wait_for_database
from app.services.realtime import (
    hub as realtime_hub,
    on_match_event_committed,
)
from app.security.jwt import JwtService
from app.security.rate_limit import MemoryWindowLimiter, RedisWindowLimiter, SecurityMiddleware
from app.security.sources import DbAuthorizationSource, DbStandingsSource, ResilientLimiter
from app.services.scoring import register_match_listener

logger = logging.getLogger("app.main")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ---------------------------------------------------------------------------
# Body size limiter (PDF §5.2 — 413 PAYLOAD_TOO_LARGE)
# Pure ASGI middleware ensuring streaming bodies are not prematurely consumed
# ---------------------------------------------------------------------------

_MAX_BODY_BYTES: int = 1_048_576  # 1 MiB
_CHECKED_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH"})
_PAYLOAD_TOO_LARGE_BODY: dict[str, Any] = {
    "error": {
        "code": "PAYLOAD_TOO_LARGE",
        "message": f"Request body must not exceed {_MAX_BODY_BYTES:,} bytes (1 MiB).",
        "details": {},
    }
}


class BodySizeLimitMiddleware:
    """Reject POST/PUT/PATCH requests whose body exceeds 1 MiB without consuming stream."""

    def __init__(self, app: ASGIApp, max_bytes: int = _MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") not in _CHECKED_METHODS:
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers", []))
        content_length_header = headers.get(b"content-length")
        if content_length_header is not None:
            try:
                declared_length = int(content_length_header)
                if declared_length > self.max_bytes:
                    resp = JSONResponse(status_code=413, content=_PAYLOAD_TOO_LARGE_BODY)
                    await resp(scope, receive, send)
                    return
            except ValueError:
                pass

        received_bytes = 0
        limit_exceeded = False

        async def tracked_receive() -> Message:
            nonlocal received_bytes, limit_exceeded
            message = await receive()
            if message["type"] == "http.request":
                body = message.get("body", b"")
                received_bytes += len(body)
                if received_bytes > self.max_bytes:
                    limit_exceeded = True
            return message

        async def wrapped_send(message: Message) -> None:
            if limit_exceeded and message["type"] == "http.response.start":
                resp = JSONResponse(status_code=413, content=_PAYLOAD_TOO_LARGE_BODY)
                await resp(scope, receive, send)
                return
            await send(message)

        await self.app(scope, tracked_receive, wrapped_send)


# Alias in app.core.errors so any external consumer gets the pure ASGI implementation
app.core.errors.BodySizeLimitMiddleware = BodySizeLimitMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    logger.info("Starting NaSCon '26 Backend API...")
    logger.info(
        "Configured services: DB=%s, REDIS=%s, RABBITMQ=%s, MINIO=%s",
        settings.DATABASE_URL,
        settings.REDIS_URL,
        settings.RABBITMQ_URL,
        settings.MINIO_ENDPOINT,
    )
    # NOTE: Never log or print DAY1_SALT

    # --------------------------------------------------------------------------
    # Database connectivity wait, schema creation, and baseline deterministic seed
    # --------------------------------------------------------------------------
    wait_for_database()
    init_db()

    with session_scope() as session:
        if not is_seeded(session):
            logger.info("Database not seeded. Running baseline deterministic seed...")
            seed_all(session, seed=42)
            logger.info("Baseline seed complete.")
        else:
            logger.info("Database already seeded.")

    # --------------------------------------------------------------------------
    # Realtime WebSocket feed initialization (instructions.md §2.1)
    # --------------------------------------------------------------------------
    loop = asyncio.get_running_loop()
    realtime_hub.set_loop(loop)
    realtime_hub.start_heartbeat()
    register_match_listener(on_match_event_committed)
    logger.info("Realtime WebSocket hub initialized with match listener.")

    yield

    logger.info("Shutting down NaSCon '26 Backend API...")
    realtime_hub.stop_heartbeat()


app = FastAPI(
    title="NaSCon '26 Multi-Sport League Platform",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Exception handlers — must be registered BEFORE adding middleware so that
# the handlers are in place when requests reach the route layer.
# ---------------------------------------------------------------------------
register_exception_handlers(app)

# ---------------------------------------------------------------------------
# Middleware stack (innermost first in terms of execution order for requests;
# BaseHTTPMiddleware wraps are added outermost-last, so add CORSMiddleware last
# so it runs first on inbound requests).
# ---------------------------------------------------------------------------

# 0. Security: RBAC probe pre-authorization, /api/v1 rolling-window rate limit (Redis, in-process fallback).
_limiter = MemoryWindowLimiter()
try:
    import redis.asyncio as _aioredis

    _limiter = ResilientLimiter(RedisWindowLimiter(_aioredis.from_url(get_settings().REDIS_URL)), _limiter)
except Exception:  # noqa: BLE001
    logger.warning("redis client unavailable; using in-process rate limiter")
app.add_middleware(SecurityMiddleware, limiter=_limiter)

# 1. Body size limiter — rejects oversized POST/PUT/PATCH before route dispatch.
app.add_middleware(BodySizeLimitMiddleware)

# 2. CORS — outermost wrapper so preflight OPTIONS responses bypass the size check.
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
# Trusted sources used by Sufiyan's standings and RBAC routes (see app/security/sources.py).
app.state.standings_source = DbStandingsSource()
app.state.authorization_source = DbAuthorizationSource()
app.state.jwt_service = JwtService(get_settings().JWT_SECRET)

app.include_router(api_router)
