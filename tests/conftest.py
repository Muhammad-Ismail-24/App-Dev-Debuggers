"""Unit harness only; it does not replace Ismail's production application."""
import os
import hashlib
import hmac
import json
import sys
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))


def contract_test_app(*routers):
    app = FastAPI()

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        fields = [".".join(str(x) for x in e["loc"] if x != "body") or "body" for e in exc.errors()]
        return JSONResponse({"error": {"code": "VALIDATION_ERROR", "message": "Invalid request",
                                      "details": {"fields": fields}}}, status_code=400)

    for router in routers:
        app.include_router(router)
    return app


@pytest.fixture
def live_api():
    url = os.environ.get("NASCON_API_URL")
    if not url:
        pytest.skip("Live backend unavailable: set NASCON_API_URL (tests reset its graded data)")
    with httpx.Client(base_url=url, timeout=10, trust_env=False) as client:
        response = client.post("/audit/v1/reset", json={})
        assert response.status_code == 200, response.text
        yield client


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    error = response.json()["error"]
    assert error["code"] == code
    assert isinstance(error["message"], str) and isinstance(error["details"], dict)
    if code == "VALIDATION_ERROR":
        assert isinstance(error["details"]["fields"], list) and error["details"]["fields"]


def signature(salt, id_, payload):
    """Independent test oracle, not a second application signing helper."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hmac.new(salt.encode(), (id_+"|"+canonical).encode(), hashlib.sha256).hexdigest()


def append_event(api, event_id, match_id, type_, payload, status=201):
    body = dict(event_id=event_id, match_id=match_id, type=type_, payload=payload)
    r = api.post("/audit/v1/events", json=body)
    assert r.status_code == status, r.text
    assert r.json()["event_id"] == event_id and r.json()["match_id"] == match_id
    salt = os.environ.get("DAY1_SALT")
    if salt is not None:
        assert r.json()["signature"] == signature(salt, event_id, payload)
    return r.json()


def mystery_sport(model="event"):
    periods = {"event": dict(count=2, duration_minutes=20),
               "innings": dict(innings_per_team=1, overs_per_innings=1, balls_per_over=2, wickets_per_innings=2),
               "round": dict(best_of=3)}[model]
    events = {"event": {"bonus": {"points": 3}},
              "innings": {"bonus": dict(runs=2, legal_ball=True, wicket=False),
                          "extra": dict(runs=1, legal_ball=False, wicket=False),
                          "out": dict(runs=0, legal_ball=True, wicket=True)},
              "round": {"bonus": {"rounds": 1}}}[model]
    return dict(sport_id="mystery_"+model, name="Config-only sport", scoring_model=model,
                periods=periods, scoring_events=events, draw_allowed=True,
                overtime=dict(policy="none"), roster=dict(min_squad_size=1, max_squad_size=5, required_positions={}))
