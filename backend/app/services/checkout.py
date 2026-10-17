"""Pure checkout helpers for totals, signed receipts, and receipt PDFs.

The checkout flow is intentionally not implemented here.  These helpers keep
money in integer paisa and leave persistence and transaction orchestration to
the checkout service flow.
"""

from __future__ import annotations

import base64
from datetime import datetime, timezone
from io import BytesIO

from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas

from app.core.errors import ApiError
from app.core.signing import sign_record

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
