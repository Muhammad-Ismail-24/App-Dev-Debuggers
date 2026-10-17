import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import os
from threading import Barrier
from time import perf_counter

import httpx
import pytest

from conftest import assert_error, signature


def order(id_, token="tok_success", discount=None):
    return dict(order_id=id_, customer_id="customer", items=[dict(variant_id="var-jersey-001-M", quantity=1)],
                discount_code=discount, payment=dict(token=token))


def test_checkout_receipt_replay_and_duplicate(live_api):
    body = order("order1", discount="WELCOME10")
    r = live_api.post("/audit/v1/checkout", json=body)
    assert r.status_code == 201, r.text
    data = r.json()
    assert (data["subtotal_minor"], data["discount_minor"], data["total_minor"], data["currency"], data["status"]) == (450000, 45000, 405000, "PKR", "paid")
    receipt = data["receipt"]
    pdf = base64.b64decode(receipt["pdf_base64"], validate=True)
    assert pdf.startswith(b"%PDF")
    from pypdf import PdfReader
    text = "\n".join(page.extract_text() for page in PdfReader(BytesIO(pdf)).pages)
    assert "order1" in text and "PKR 4050.00" in text
    if "DAY1_SALT" in os.environ:
        assert receipt["signature"] == signature(os.environ["DAY1_SALT"], "order1", receipt["payload"])
    replay = live_api.post("/audit/v1/checkout", json=body)
    assert replay.status_code == 200 and replay.json() == data
    assert_error(live_api.post("/audit/v1/checkout", json={**body, "customer_id": "other"}), 409, "DUPLICATE_ORDER_ID")


@pytest.mark.parametrize("token,code", [("tok_declined", "PAYMENT_DECLINED"), ("tok_capture_fail", "PAYMENT_CAPTURE_FAILED")])
def test_payment_failures_release_stock(live_api, token, code):
    assert_error(live_api.post("/audit/v1/checkout", json=order("failed", token)), 402, code)
    assert live_api.get("/audit/v1/inventory/var-jersey-001-M").json() == dict(variant_id="var-jersey-001-M", stock=1, reserved=0)
    assert live_api.post("/audit/v1/checkout", json=order("success")).status_code == 201


def test_twenty_buyers_final_unit(live_api):
    barrier = Barrier(20)
    url = str(live_api.base_url)
    def purchase(i):
        with httpx.Client(base_url=url, timeout=10, trust_env=False) as api:
            barrier.wait(timeout=10)
            start = perf_counter()
            response = api.post("/audit/v1/checkout", json=order(f"burst-{i}"))
            return response, start, perf_counter()
    with ThreadPoolExecutor(max_workers=20) as pool:
        results = list(pool.map(purchase, range(20)))
    statuses = [r.status_code for r, _, _ in results]
    assert statuses.count(201) == 1 and statuses.count(409) == 19, statuses
    for response, _, _ in results:
        if response.status_code == 409:
            assert_error(response, 409, "OUT_OF_STOCK")
    assert max(end for _, _, end in results) - min(start for _, start, _ in results) <= 10
    assert live_api.get("/audit/v1/inventory/var-jersey-001-M").json() == dict(variant_id="var-jersey-001-M", stock=0, reserved=0)


def test_checkout_validation_precedence(live_api):
    body = order("bad", discount="BAD")
    body["items"][0]["variant_id"] = "missing"
    assert_error(live_api.post("/audit/v1/checkout", json=body), 404, "VARIANT_NOT_FOUND")
    body["items"][0]["quantity"] = "1"
    assert_error(live_api.post("/audit/v1/checkout", json=body), 400, "VALIDATION_ERROR")
    assert_error(live_api.post("/audit/v1/checkout", json=order("discount", discount="BAD")), 400, "INVALID_DISCOUNT_CODE")
