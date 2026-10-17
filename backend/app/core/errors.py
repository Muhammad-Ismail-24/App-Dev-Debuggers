"""Common error contract — PDF §5.2.

Every non-2xx response body is exactly:
    {"error": {"code": "UPPER_SNAKE_CASE", "message": "...", "details": {...}}}

`details` is ALWAYS a JSON object (never null, never omitted).
For VALIDATION_ERROR, details.fields is a de-duplicated list of offending field names.
"""

from __future__ import annotations

import logging
import re
import traceback
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from starlette.types import ASGIApp

logger = logging.getLogger("app.core.errors")

# ---------------------------------------------------------------------------
# Identifier helpers (PDF §5.2)
# ---------------------------------------------------------------------------

ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
"""Valid identifier: 1–64 chars from [A-Za-z0-9_.:-], never contains '|'."""


def is_valid_identifier(value: str) -> bool:
    """Return True iff *value* matches ID_PATTERN (which already excludes '|')."""
    return bool(ID_PATTERN.fullmatch(value))


# ---------------------------------------------------------------------------
# ApiError exception
# ---------------------------------------------------------------------------


class ApiError(Exception):
    """Raise this anywhere in the application to produce a structured error response.

    Args:
        status_code: HTTP status to return (e.g. 400, 404, 409).
        code:        UPPER_SNAKE_CASE error code (PDF Appendix B).
        message:     Human-readable explanation (never leaks internal state).
        details:     Additional context dict; defaults to empty dict.
    """

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details: dict[str, Any] = details if details is not None else {}

    def to_response(self) -> JSONResponse:
        return JSONResponse(
            status_code=self.status_code,
            content={"error": {"code": self.code, "message": self.message, "details": self.details}},
        )


# ---------------------------------------------------------------------------
# Convenience constructors
# ---------------------------------------------------------------------------


def validation_error(
    fields: list[str],
    message: str = "Request validation failed.",
) -> ApiError:
    """Return a 400 VALIDATION_ERROR for the given field names (de-duplicated)."""
    seen: set[str] = set()
    unique_fields: list[str] = []
    for f in fields:
        if f not in seen:
            seen.add(f)
            unique_fields.append(f)
    return ApiError(
        status_code=400,
        code="VALIDATION_ERROR",
        message=message,
        details={"fields": unique_fields},
    )


# ---------------------------------------------------------------------------
# Internal helper: build error response content dict
# ---------------------------------------------------------------------------


def _error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


async def _handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
    return exc.to_response()


async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Map FastAPI's 422 RequestValidationError → 400 VALIDATION_ERROR.

    Extracts the top-level request field from each Pydantic error location,
    de-duplicates, and returns them in details.fields.
    """
    fields: list[str] = []
    seen: set[str] = set()
    for error in exc.errors():
        loc = error.get("loc", ())
        # loc is a tuple like ('body', 'field_name', ...) or ('query', 'field_name', ...)
        # We want the top-level request field name (index 1 when len > 1, else index 0).
        if len(loc) > 1:
            field = str(loc[1])
        elif len(loc) == 1:
            field = str(loc[0])
        else:
            field = "unknown"
        if field not in seen:
            seen.add(field)
            fields.append(field)

    return JSONResponse(
        status_code=400,
        content=_error_body(
            "VALIDATION_ERROR",
            "Request validation failed.",
            {"fields": fields},
        ),
    )


async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Map Starlette HTTP exceptions to the standard error body."""
    status = exc.status_code
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(status_code=status, content={"error": exc.detail})

    if status == 404:
        code = "NOT_FOUND"
        message = exc.detail if isinstance(exc.detail, str) else "The requested resource was not found."
    elif status == 405:
        code = "METHOD_NOT_ALLOWED"
        message = exc.detail if isinstance(exc.detail, str) else "Method not allowed."
    elif status == 401:
        code = "UNAUTHORIZED"
        message = exc.detail if isinstance(exc.detail, str) else "Authentication required."
    elif status == 403:
        code = "FORBIDDEN"
        message = exc.detail if isinstance(exc.detail, str) else "You do not have permission to perform this action."
    else:
        # Generic fallback for any other Starlette HTTP error.
        code = "HTTP_ERROR"
        message = exc.detail if isinstance(exc.detail, str) else f"HTTP {status}."

    return JSONResponse(status_code=status, content=_error_body(code, message))


async def _handle_unhandled_exception(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all: log the traceback server-side; never leak internals to clients."""
    logger.error(
        "Unhandled exception on %s %s:\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=500,
        content=_error_body("INTERNAL_ERROR", "An unexpected internal error occurred."),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach all error handlers to the FastAPI application instance."""
    app.add_exception_handler(ApiError, _handle_api_error)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, _handle_validation_error)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, _handle_http_exception)  # type: ignore[arg-type]
    # Catch-all: must be registered last and on the base Exception class.
    app.add_exception_handler(Exception, _handle_unhandled_exception)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Body-size limit middleware (PDF §5.2 — 413 PAYLOAD_TOO_LARGE)
# ---------------------------------------------------------------------------

_MAX_BODY_BYTES: int = 1_048_576  # 1 MiB exactly
_CHECKED_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH"})

_PAYLOAD_TOO_LARGE_BODY: dict[str, Any] = _error_body(
    "PAYLOAD_TOO_LARGE",
    f"Request body must not exceed {_MAX_BODY_BYTES:,} bytes (1 MiB).",
)


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject POST/PUT/PATCH requests whose body exceeds 1 MiB.

    Strategy:
    1. Check Content-Length header first for a fast rejection without reading data.
    2. For chunked / no Content-Length bodies, stream and count bytes, stopping
       as soon as the limit is exceeded — so huge bodies are never fully buffered.
    """

    def __init__(self, app: ASGIApp, max_bytes: int = _MAX_BODY_BYTES) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        if request.method not in _CHECKED_METHODS:
            return await call_next(request)

        # Fast path: Content-Length header present.
        content_length_header = request.headers.get("content-length")
        if content_length_header is not None:
            try:
                declared_length = int(content_length_header)
            except ValueError:
                declared_length = 0
            if declared_length > self.max_bytes:
                return JSONResponse(status_code=413, content=_PAYLOAD_TOO_LARGE_BODY)

        # Slow path: stream and count bytes without loading the whole body.
        received: int = 0
        chunks: list[bytes] = []
        async for chunk in request.stream():
            received += len(chunk)
            if received > self.max_bytes:
                return JSONResponse(status_code=413, content=_PAYLOAD_TOO_LARGE_BODY)
            chunks.append(chunk)

        # Re-assemble a synthetic receive channel so downstream can still read the body.
        body = b"".join(chunks)

        async def _receive() -> dict:  # type: ignore[type-arg]
            return {"type": "http.request", "body": body, "more_body": False}

        request._receive = _receive  # type: ignore[assignment]

        return await call_next(request)
