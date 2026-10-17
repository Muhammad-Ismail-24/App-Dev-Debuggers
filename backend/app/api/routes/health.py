"""Health probe endpoint — PDF §5.4."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.db.models import SystemState
from app.db.session import get_session

logger = logging.getLogger("app.api.routes.health")

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(session: Session = Depends(get_session)) -> dict[str, Any]:
    """Health probe endpoint (PDF §5.4).

    Returns 200 {"status": "ok"} ONLY when:
    1. The database is reachable, AND
    2. system_state.seeded is true.

    Otherwise returns 503 with error code NOT_READY.
    """
    try:
        row = session.query(SystemState).filter(SystemState.key == "seeded").first()
        if not row or row.value is not True:
            raise ApiError(
                status_code=503,
                code="NOT_READY",
                message="Application is not ready: baseline data is not seeded.",
            )
        return {"status": "ok"}
    except ApiError:
        raise
    except Exception as exc:
        logger.warning("Health check failed (database unreachable or error): %s", exc)
        raise ApiError(
            status_code=503,
            code="NOT_READY",
            message="Application is not ready: database is unreachable.",
        ) from exc
