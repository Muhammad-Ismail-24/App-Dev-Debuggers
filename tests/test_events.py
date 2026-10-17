import os
import pytest
from conftest import append_event, assert_error, mystery_sport, signature


def test_official_signature_vector_oracle():
    assert signature("demo-salt", "evt-1", {"team_id": "t1", "event_type": "goal"}) == "972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501"


def test_append_only_compensation_replay_and_signatures(live_api):
    api = live_api
    append_event(api, "init", "m", "match_init", dict(sport_id="football", home_team_id="a", away_team_id="b"))
    bad = dict(event_id="early", match_id="m", type="score", payload=dict(team_id="a", event_type="goal"))
    assert_error(api.post("/audit/v1/events", json=bad), 409, "MATCH_NOT_IN_PROGRESS")
    append_event(api, "start", "m", "match_start", {})
    payload = dict(team_id="a", event_type="goal")
    first = append_event(api, "goal-1", "m", "score", payload)
    assert append_event(api, "goal-1", "m", "score", payload, status=200) == first
    assert_error(api.post("/audit/v1/events", json=dict(event_id="goal-1", match_id="m", type="score", payload=dict(team_id="b", event_type="goal"))), 409, "DUPLICATE_EVENT_ID")
    append_event(api, "end", "m", "match_end", {})
    before = api.get("/audit/v1/score/m").json()
    append_event(api, "undo", "m", "compensation", dict(compensates="goal-1", reason="Review"))
    after = api.get("/audit/v1/score/m").json()
    assert before["home"]["score"] == 1 and after["home"]["score"] == 0
    assert after["outcome"] == "draw" and after["version"] == 5
    assert len(after["events"]) == len(before["events"])+1
    for old, new in zip(before["events"], after["events"]):
        for k in ("event_id", "type", "payload", "signature", "sequence"):
            assert old[k] == new[k]
    assert_error(api.post("/audit/v1/events", json=dict(event_id="undo2", match_id="m", type="compensation", payload=dict(compensates="goal-1", reason="Again"))), 409, "INVALID_COMPENSATION")
    assert_error(api.post("/audit/v1/events", json=dict(event_id="start2", match_id="m", type="match_start", payload={})), 409, "ILLEGAL_TRANSITION")


@pytest.mark.parametrize("model,score,limit_error", [("event", 6, None), ("innings", 4, "INNINGS_COMPLETE"), ("round", 2, "SERIES_ALREADY_DECIDED")])
def test_data_driven_models_and_limits(live_api, model, score, limit_error):
    sport = mystery_sport(model)
    assert live_api.post("/audit/v1/sports", json=sport).status_code == 201
    append_event(live_api, "init", "m", "match_init", dict(sport_id=sport["sport_id"], home_team_id="a", away_team_id="b"))
    append_event(live_api, "start", "m", "match_start", {})
    for i in range(2):
        append_event(live_api, f"score{i}", "m", "score", dict(team_id="a", event_type="bonus"))
    projection = live_api.get("/audit/v1/score/m").json()
    assert projection["home"]["score"] == score
    if limit_error:
        assert_error(live_api.post("/audit/v1/events", json=dict(event_id="extra", match_id="m", type="score", payload=dict(team_id="a", event_type="bonus"))), 409, limit_error)
        append_event(live_api, "undo", "m", "compensation", dict(compensates="score1", reason="Review"))
        append_event(live_api, "restored", "m", "score", dict(team_id="a", event_type="bonus"))


def test_unknown_ids_events_and_tie_policy(live_api):
    assert_error(live_api.get("/audit/v1/score/missing"), 404, "MATCH_NOT_FOUND")
    append_event(live_api, "init", "m", "match_init", dict(sport_id="basketball", home_team_id="a", away_team_id="b"))
    append_event(live_api, "start", "m", "match_start", {})
    assert_error(live_api.post("/audit/v1/events", json=dict(event_id="bad", match_id="m", type="score", payload=dict(team_id="a", event_type="undefined"))), 400, "UNKNOWN_EVENT_TYPE")
    assert_error(live_api.post("/audit/v1/events", json=dict(event_id="end", match_id="m", type="match_end", payload={})), 409, "TIE_NOT_ALLOWED")
    append_event(live_api, "tb", "m", "tiebreak_winner", dict(team_id="b"))
    append_event(live_api, "end", "m", "match_end", {})
    append_event(live_api, "undo", "m", "compensation", dict(compensates="tb", reason="Review"))
    assert live_api.get("/audit/v1/score/m").json()["outcome"] == "undecided"


def test_live_hmac_verification_requires_runtime_salt(live_api):
    if "DAY1_SALT" not in os.environ:
        pytest.skip("Set DAY1_SALT to the running API's salt to verify signatures")
    payload = dict(sport_id="football", home_team_id="a", away_team_id="b")
    r = append_event(live_api, "init", "m", "match_init", payload)
    assert r["signature"] == signature(os.environ["DAY1_SALT"], "init", payload)
