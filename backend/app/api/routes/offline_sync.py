"""Routes for offline sync reconciliation — NaSCon '26 Platform (PDF §5.14).

Endpoint
--------
POST /audit/v1/offline-sync — Replay queued offline actions with conflict resolution.

Design contract
---------------
- HTTP handler is a plain synchronous `def` running in a thread pool.
- Validates envelope strictly; per-action outcomes are returned with HTTP 200.
- Commits outer transaction once and triggers notify_match_changed for applied events.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.schemas.offline_sync import OfflineSyncResponse
from app.services.offline_sync import sync_service
from app.services.scoring import notify_match_changed

router = APIRouter(tags=["offline_sync"])


@router.post(
    "/audit/v1/offline-sync",
    status_code=status.HTTP_200_OK,
    response_model=OfflineSyncResponse,
)
def offline_sync(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """POST /audit/v1/offline-sync (PDF §5.14).

    Replays a batch of 1 to 100 queued score_event and roster_transfer actions
    chronologically in isolated savepoints against authoritative DB state.

    Always returns HTTP 200 with per-action outcomes unless the envelope itself
    is malformed (which yields 400 VALIDATION_ERROR).
    """
    result, applied_events = sync_service.process_offline_sync(session, payload)
    session.commit()

    # Notify live WebSocket subscribers of all newly applied score events
    for match_id, event_type in applied_events:
        notify_match_changed(match_id, event_type)

    return result
