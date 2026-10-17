from typing import Any
from fastapi import APIRouter, Body, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.db.session import get_session
from app.schemas.checkout import CheckoutResponse
from app.services.checkout import checkout

router = APIRouter(tags=["checkout"])


@router.post("/audit/v1/checkout", response_model=CheckoutResponse)
def create_checkout(payload: dict[str, Any] = Body(...), session: Session = Depends(get_session)) -> Any:
    code, response = checkout(session, payload)
    return JSONResponse(status_code=code, content=response)
