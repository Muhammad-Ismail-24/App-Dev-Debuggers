"""Routes for league registration — NaSCon '26 Platform (PDF §5.8)."""

from typing import Any

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.schemas.leagues import LeagueCreateResponse
from app.services.leagues import create_league

router = APIRouter(tags=["leagues"])


@router.post(
    "/audit/v1/leagues",
    status_code=status.HTTP_201_CREATED,
    response_model=LeagueCreateResponse,
)
def register_league(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """POST /audit/v1/leagues (PDF §5.8).

    Registers teams, the full fixture list, and standings configuration.
    Each fixture automatically becomes a match stream with derived status 'upcoming'.
    Validates strictly in the service layer.
    """
    return create_league(session, payload)
