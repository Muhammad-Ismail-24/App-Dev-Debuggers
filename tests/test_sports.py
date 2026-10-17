import pytest
from conftest import assert_error, mystery_sport


@pytest.mark.parametrize("model", ["event", "innings", "round"])
def test_mystery_sport_config(live_api, model):
    body = mystery_sport(model)
    r = live_api.post("/audit/v1/sports", json=body)
    assert r.status_code == 201 and r.json()["sport_id"] == body["sport_id"]
    assert r.json()["config"]["scoring_events"] == body["scoring_events"]
    assert_error(live_api.post("/audit/v1/sports", json=body), 409, "SPORT_EXISTS")


@pytest.mark.parametrize("changes", [{"sport_id": "x'; DROP TABLE sports;--"}, {"draw_allowed": "true"},
                                      {"periods": {"count": 0, "duration_minutes": 1}}, {"scoring_events": {}}])
def test_sports_validation(live_api, changes):
    assert_error(live_api.post("/audit/v1/sports", json={**mystery_sport(), **changes}), 400, "VALIDATION_ERROR")
