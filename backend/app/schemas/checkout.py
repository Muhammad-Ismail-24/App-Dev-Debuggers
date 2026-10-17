from typing import Any
from pydantic import BaseModel, ConfigDict


class CheckoutResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    order_id: str
    status: str
    currency: str
    items: list[dict[str, Any]]
    subtotal_minor: int
    discount_minor: int
    total_minor: int
    payment: dict[str, Any]
    receipt: dict[str, Any]


class InventoryResponse(BaseModel):
    variant_id: str
    stock: int
    reserved: int
