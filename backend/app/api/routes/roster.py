"""Routes for roster management — NaSCon '26 Platform (PDF §5.11).

Endpoints
---------
POST /audit/v1/roster/setup         — configure / atomically replace a league's roster state
POST /audit/v1/roster/transfer      — transfer, loan, or release a player
GET  /audit/v1/roster/history/{id}  — immutable audit history for a player

Design contract
---------------
- HTTP handlers are intentionally thin (plain `def`).
- All business logic lives in `app.services.roster`.
- The session is committed HERE (not inside the service) so that
  `roster_service.transfer` can be reused by offline-sync inside a savepoint.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.schemas.roster import (
    PlayerHistoryResponse,
    RosterSetupResponse,
    TransferResponse,
)
from app.services.roster import get_player_history, roster_service, setup_roster

router = APIRouter(tags=["roster"])


# ---------------------------------------------------------------------------
# POST /audit/v1/roster/setup
# ---------------------------------------------------------------------------


@router.post(
    "/audit/v1/roster/setup",
    status_code=status.HTTP_201_CREATED,
    response_model=RosterSetupResponse,
)
def roster_setup(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """POST /audit/v1/roster/setup (PDF §5.11).

    Configures (or fully replaces) the roster state for a league in one atomic
    transaction.  Re-sending the same league_id REPLACES all prior state.

    Validates body strictly; bad schema/dates → 400; missing sport → 404.
    """
    result = setup_roster(session, payload)
    session.commit()
    return result


# ---------------------------------------------------------------------------
# POST /audit/v1/roster/transfer
# ---------------------------------------------------------------------------


@router.post(
    "/audit/v1/roster/transfer",
    status_code=status.HTTP_201_CREATED,
    response_model=TransferResponse,
)
def roster_transfer(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> Any:
    """POST /audit/v1/roster/transfer (PDF §5.11).

    Validates in the exact 8-step order required by the spec (first failure wins).

    Idempotency:
    - Identical request_id + identical body → 200 with stored response.
    - Same request_id, different body      → 409 DUPLICATE_REQUEST_ID.
    - First successful call                → 201.

    Commits on success; ApiError aborts cleanly.
    """
    http_status, body = roster_service.transfer(session, payload)
    session.commit()

    if http_status != 201:
        # 200 idempotent replay — return explicit JSONResponse to override
        # FastAPI's default 201 OpenAPI declaration.
        return JSONResponse(status_code=http_status, content=body)
    return body


# ---------------------------------------------------------------------------
# GET /audit/v1/roster/history/{player_id}
# ---------------------------------------------------------------------------


@router.get(
    "/audit/v1/roster/history/{player_id}",
    status_code=status.HTTP_200_OK,
    response_model=PlayerHistoryResponse,
)
def roster_history(
    player_id: str,
    as_of: str | None = Query(
        default=None,
        description="Date in YYYY-MM-DD format (defaults to today's server date).",
    ),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """GET /audit/v1/roster/history/{player_id}?as_of=YYYY-MM-DD (PDF §5.11).

    Returns the full immutable audit trail for the player, oldest-first.
    Automatically applies any due loan returns before computing current state.

    Errors: 400 bad as_of format; 404 unknown player_id.
    """
    result = get_player_history(session, player_id, as_of)
    # Commit so any auto-return writes are durable.
    session.commit()
    return result
