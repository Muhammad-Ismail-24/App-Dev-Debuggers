"""Routes for sport configuration — NaSCon '26 Platform (PDF §5.6)."""

from typing import Any

from fastapi import APIRouter, Body, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.schemas.sports import SportCreateResponse
from app.services.sports import create_sport

router = APIRouter(tags=["sports"])


@router.post(
    "/audit/v1/sports",
    status_code=status.HTTP_201_CREATED,
    response_model=SportCreateResponse,
)
def register_sport(
    payload: dict[str, Any] = Body(...),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """POST /audit/v1/sports (PDF §5.6).

    Registers a new arbitrary JSON-defined sport configuration.
    Validates strictly in the service layer.
    """
    return create_sport(session, payload)
