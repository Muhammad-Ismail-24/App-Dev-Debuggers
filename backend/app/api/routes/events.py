from typing import Any
from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session
from app.db.session import get_session, session_scope
from app.schemas.events import EventResponse, ScoreResponse
from app.services.scoring import get_score_projection, notify_match_changed, score_service

router = APIRouter(tags=["events"])


@router.post("/audit/v1/events", response_model=EventResponse)
def append_event(payload: dict[str, Any] = Body(...), session: Session = Depends(get_session)) -> Any:
    created = False
    with session_scope() as tx:
        code, body = score_service.append_event(tx, payload)
        created = code == 201
    if created:
        notify_match_changed(body["match_id"], body["type"])
    from fastapi.responses import JSONResponse
    return JSONResponse(status_code=code, content=body)


@router.get("/audit/v1/score/{match_id}", response_model=ScoreResponse)
def get_score(match_id: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    return get_score_projection(session, match_id)
