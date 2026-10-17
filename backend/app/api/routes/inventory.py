from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_session
from app.schemas.checkout import InventoryResponse
from app.services.checkout import get_inventory

router = APIRouter(tags=["inventory"])


@router.get("/audit/v1/inventory/{variant_id}", response_model=InventoryResponse)
def inventory(variant_id: str, session: Session = Depends(get_session)) -> dict:
    return get_inventory(session, variant_id)
