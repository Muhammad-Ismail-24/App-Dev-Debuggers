"""Pure checkout helpers for totals, signed receipts, and receipt PDFs.

The checkout flow is intentionally not implemented here.  These helpers keep
money in integer paisa and leave persistence and transaction orchestration to
the checkout service flow.
"""

from __future__ import annotations

import base64
import re
from datetime import datetime, timezone
from io import BytesIO

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

from app.core.errors import ApiError
from app.core.signing import sign_record
from app.db.models import DomainEventOutbox, Order, OrderItem, ProductVariant
from app.workers.publisher import publish_domain_event
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

WELCOME10_PERCENT = 10
CURRENCY = "PKR"


def format_major_units(minor: int) -> str:
    """Format integer minor units as a two-decimal major-unit string."""
    sign = "-" if minor < 0 else ""
    absolute_minor = abs(minor)
    return f"{sign}{absolute_minor // 100}.{absolute_minor % 100:02d}"


def compute_totals(items: list[dict], discount_code: str | None) -> dict:
    """Compute subtotal, discount, and total in integer minor units."""
    subtotal_minor = sum(
        item["unit_price_minor"] * item["quantity"]
        for item in items
    )

    if discount_code is None:
        discount_minor = 0
    elif discount_code == "WELCOME10":
        discount_minor = subtotal_minor * WELCOME10_PERCENT // 100
    else:
        raise ApiError(
            status_code=400,
            code="INVALID_DISCOUNT_CODE",
            message="Invalid discount code.",
        )

    return {
        "subtotal_minor": subtotal_minor,
        "discount_minor": discount_minor,
        "total_minor": subtotal_minor - discount_minor,
    }


def _utc_paid_at(paid_at: datetime) -> str:
    """Render a paid-at datetime in the required UTC wire format."""
    if paid_at.tzinfo is None:
        utc_paid_at = paid_at.replace(tzinfo=timezone.utc)
    else:
        utc_paid_at = paid_at.astimezone(timezone.utc)
    return utc_paid_at.strftime("%Y-%m-%dT%H:%M:%SZ")


def build_receipt_payload(
    order_id: str,
    customer_id: str,
    items: list[dict],
    totals: dict,
    paid_at: datetime,
) -> dict:
    """Build the exact signed receipt payload shape."""
    return {
        "order_id": order_id,
        "customer_id": customer_id,
        "items": [
            {
                "variant_id": item["variant_id"],
                "quantity": item["quantity"],
                "unit_price_minor": item["unit_price_minor"],
            }
            for item in items
        ],
        "subtotal_minor": totals["subtotal_minor"],
        "discount_minor": totals["discount_minor"],
        "total_minor": totals["total_minor"],
        "currency": CURRENCY,
        "paid_at": _utc_paid_at(paid_at),
    }


def sign_receipt(order_id: str, payload: dict) -> str:
    """Sign exactly the receipt payload supplied by the caller."""
    return sign_record(order_id, payload)


def generate_receipt_pdf(payload: dict) -> bytes:
    """Generate a server-side PDF receipt using a built-in standard font."""
    output = BytesIO()
    document = canvas.Canvas(output, pagesize=LETTER)
    document.setFont("Helvetica", 12)

    y = 750
    document.drawString(50, y, f"Order ID: {payload['order_id']}")
    y -= 20
    document.drawString(50, y, f"Customer: {payload['customer_id']}")
    y -= 20
    document.drawString(
        50,
        y,
        f"Total: {payload['currency']} {format_major_units(payload['total_minor'])}",
    )
    y -= 20
    document.drawString(
        50,
        y,
        f"Subtotal: {payload['currency']} {format_major_units(payload['subtotal_minor'])}",
    )
    y -= 20
    document.drawString(
        50,
        y,
        f"Discount: {payload['currency']} {format_major_units(payload['discount_minor'])}",
    )
    y -= 30
    document.drawString(50, y, "Line items:")
    y -= 20

    for item in payload["items"]:
        line = (
            f"{item['variant_id']} x {item['quantity']} - "
            f"{payload['currency']} {format_major_units(item['unit_price_minor'])}"
        )
        document.drawString(50, y, line)
        y -= 18

    y -= 5
    document.drawString(50, y, f"Paid at: {payload['paid_at']}")
    document.save()
    return output.getvalue()


def receipt_pdf_base64(payload: dict) -> str:
    """Return the receipt PDF encoded using standard base64."""
    return base64.b64encode(generate_receipt_pdf(payload)).decode("ascii")


def _validation(request: object) -> dict:
    if not isinstance(request, dict):
        raise ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {"fields": ["body"]})
    fields = []
    if not isinstance(request.get("order_id"), str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", str(request.get("order_id", ""))):
        fields.append("order_id")
    if not isinstance(request.get("customer_id"), str) or not request.get("customer_id") or len(request.get("customer_id", "")) > 200:
        fields.append("customer_id")
    items = request.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 10:
        fields.append("items")
    else:
        seen = set()
        for i, item in enumerate(items):
            if not isinstance(item, dict) or not {"variant_id", "quantity"} <= set(item):
                fields.append(f"items[{i}]")
                continue
            vid, qty = item["variant_id"], item["quantity"]
            if not isinstance(vid, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", vid):
                fields.append(f"items[{i}].variant_id")
            if vid in seen:
                fields.append(f"items[{i}].variant_id")
            seen.add(vid)
            if isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= 10:
                fields.append(f"items[{i}].quantity")
    if request.get("discount_code") is not None and not isinstance(request.get("discount_code"), str):
        fields.append("discount_code")
    payment = request.get("payment")
    if not isinstance(payment, dict) or "token" not in payment or not isinstance(payment.get("token"), str) or not payment.get("token"):
        fields.append("payment")
    if fields:
        raise ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {"fields": fields})
    return request


def _gateway(token: str) -> tuple[str, str]:
    if token not in {"tok_success", "tok_capture_fail"}:
        raise ApiError(402, "PAYMENT_DECLINED", "Payment was declined.")
    auth = "auth-" + token
    if token == "tok_capture_fail":
        raise ApiError(402, "PAYMENT_CAPTURE_FAILED", "Payment capture failed.")
    return auth, "capture-" + token


def _release(session: Session, reserved: list[tuple[str, int]]) -> None:
    for variant_id, quantity in reserved:
        session.execute(update(ProductVariant).where(ProductVariant.variant_id == variant_id).values(
            stock=ProductVariant.stock + quantity))
    session.commit()


def checkout(session: Session, request: dict) -> tuple[int, dict]:
    request = _validation(request)
    variants = {}
    for item in request["items"]:
        row = session.query(ProductVariant).filter(ProductVariant.variant_id == item["variant_id"]).first()
        if row is None:
            raise ApiError(404, "VARIANT_NOT_FOUND", "Variant not found.", {"variant_id": item["variant_id"]})
        variants[row.variant_id] = row
    totals = compute_totals(
        [{"variant_id": i["variant_id"], "quantity": i["quantity"], "unit_price_minor": variants[i["variant_id"]].price_minor} for i in request["items"]],
        request.get("discount_code"),
    )
    prior = session.query(Order).filter(Order.order_id == request["order_id"]).first()
    if prior is not None:
        if prior.status == "paid" and prior.request_body == request:
            return 200, dict(prior.response)
        raise ApiError(409, "DUPLICATE_ORDER_ID", "Order ID already exists.")
    reserved: list[tuple[str, int]] = []
    for item in sorted(request["items"], key=lambda x: x["variant_id"]):
        qty = item["quantity"]
        result = session.execute(update(ProductVariant).where(
            ProductVariant.variant_id == item["variant_id"], ProductVariant.stock >= qty
        ).values(stock=ProductVariant.stock - qty))
        if result.rowcount != 1:
            session.rollback()
            raise ApiError(409, "OUT_OF_STOCK", "Insufficient stock.", {"variant_id": item["variant_id"]})
        reserved.append((item["variant_id"], qty))
    session.commit()
    try:
        auth, capture = _gateway(request["payment"]["token"])
    except ApiError:
        _release(session, reserved)
        raise
    try:
        paid_at = datetime.utcnow()
        receipt_payload = build_receipt_payload(request["order_id"], request["customer_id"],
            [{"variant_id": i["variant_id"], "quantity": i["quantity"], "unit_price_minor": variants[i["variant_id"]].price_minor} for i in request["items"]],
            totals, paid_at)
        signature = sign_receipt(request["order_id"], receipt_payload)
        response = {"order_id": request["order_id"], "status": "paid", "currency": CURRENCY,
                    "items": receipt_payload["items"], **totals,
                    "payment": {"authorization_id": auth, "capture_id": capture, "state": "captured"},
                    "receipt": {"payload": receipt_payload, "signature": signature, "pdf_base64": receipt_pdf_base64(receipt_payload)}}
        order = Order(order_id=request["order_id"], customer_id=request["customer_id"], status="paid",
                      currency=CURRENCY, subtotal_minor=totals["subtotal_minor"], discount_minor=totals["discount_minor"],
                      total_minor=totals["total_minor"], discount_code=request.get("discount_code"),
                      request_body=request, response=response, authorization_id=auth, capture_id=capture)
        try:
            session.add(order)
            session.flush()
        except IntegrityError:
            # A concurrent request with the same order_id committed first: give back our reservation,
            # then replay its stored result (identical body) or report the id clash (PDF 5.12).
            session.rollback()
            _release(session, reserved)
            reserved.clear()  # already released; the generic handler below must not release twice
            prior = session.query(Order).filter(Order.order_id == request["order_id"]).first()
            if prior is not None and prior.status == "paid" and prior.request_body == request:
                return 200, dict(prior.response)
            raise ApiError(409, "DUPLICATE_ORDER_ID", "Order ID already exists.")
        for item in receipt_payload["items"]:
            session.add(OrderItem(order_id=order.order_id, variant_id=item["variant_id"],
                                  quantity=item["quantity"], unit_price_minor=item["unit_price_minor"]))
        publish_domain_event(session, "order.status_changed",
                             {"order_id": order.order_id, "from_status": "pending", "to_status": "paid"})
        session.commit()
        return 201, response
    except Exception:
        session.rollback()
        _release(session, reserved)
        raise


def transition_order(session: Session, order_id: str, new_status: str) -> dict:
    order = session.query(Order).filter(Order.order_id == order_id).with_for_update().first()
    if order is None:
        raise ApiError(404, "ORDER_NOT_FOUND", "Order not found.")
    allowed = {"pending": {"paid", "cancelled"}, "paid": {"packed", "refunded", "cancelled"},
               "packed": {"shipped"}, "shipped": {"delivered"}, "delivered": {"refunded"}}
    if new_status not in allowed.get(order.status, set()):
        raise ApiError(409, "ILLEGAL_TRANSITION", "Illegal order status transition.")
    old = order.status
    order.status = new_status
    publish_domain_event(session, "order.status_changed",
                         {"order_id": order_id, "from_status": old, "to_status": new_status})
    return {"order_id": order_id, "status": new_status}


def get_inventory(session: Session, variant_id: str) -> dict:
    row = session.query(ProductVariant).filter(ProductVariant.variant_id == variant_id).first()
    if row is None:
        raise ApiError(404, "VARIANT_NOT_FOUND", "Variant not found.")
    return {"variant_id": row.variant_id, "stock": row.stock, "reserved": row.reserved}
