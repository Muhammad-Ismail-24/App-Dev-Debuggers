"""WebSocket endpoints for live match updates — NaSCon '26 Platform (PDF §5.9, instructions.md §2.1).

Endpoints
---------
WS /api/v1/ws/matches/{match_id} — Realtime updates for a single match
WS /api/v1/ws/feed               — Realtime feed for all matches

Design contract
---------------
- Native WebSocket support for React Native / mobile clients.
- Unauthenticated in Part I.
- Bad or unknown match_id sends one standard-shaped error JSON then terminates.
- Authoritative state remains in PostgreSQL, not socket memory.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core.errors import is_valid_identifier
from app.db.models import Match
from app.db.session import session_scope
from app.services.realtime import hub

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])


@router.websocket("/api/v1/ws/matches/{match_id}")
async def ws_match_feed(websocket: WebSocket, match_id: str) -> None:
    """WS /api/v1/ws/matches/{match_id}

    Subscribes to live score, status, and pinned-product updates for match_id.
    Validates match_id format and existence; sends one standard error body
    and closes if unknown or malformed.
    """
    if not is_valid_identifier(match_id):
        await websocket.accept()
        await websocket.send_json(
            {
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Invalid match_id format.",
                    "details": {"fields": ["match_id"]},
                }
            }
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Check match existence in database
    match_exists = False
    with session_scope() as session:
        m = session.query(Match).filter(Match.match_id == match_id).first()
        match_exists = m is not None

    if not match_exists:
        await websocket.accept()
        await websocket.send_json(
            {
                "error": {
                    "code": "MATCH_NOT_FOUND",
                    "message": f"Match '{match_id}' not found.",
                    "details": {"match_id": match_id},
                }
            }
        )
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Valid match: accept connection and register in the hub
    await websocket.accept()
    await hub.connect_match(match_id, websocket)

    try:
        while True:
            # Keep reading to receive client pings/messages or detect clean disconnect
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.disconnect_match(match_id, websocket)


@router.websocket("/api/v1/ws/feed")
async def ws_global_feed(websocket: WebSocket) -> None:
    """WS /api/v1/ws/feed

    Subscribes to live score, status, and pinned-product updates across all matches.
    """
    await websocket.accept()
    await hub.connect_feed(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await hub.disconnect_feed(websocket)
