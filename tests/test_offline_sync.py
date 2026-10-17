from conftest import append_event, assert_error


def test_offline_chronology_rebase_future_and_duplicates(live_api):
    append_event(live_api, "init", "m", "match_init", dict(sport_id="football", home_team_id="a", away_team_id="b"))
    append_event(live_api, "start", "m", "match_start", {})
    actions = [dict(action_id="later", type="score_event", queued_at="2026-10-17T11:01:00Z", base_version=2,
                    payload=dict(event_id="second", match_id="m", type="score", payload=dict(team_id="a", event_type="goal"))),
               dict(action_id="earlier", type="score_event", queued_at="2026-10-17T11:00:00Z", base_version=2,
                    payload=dict(event_id="first", match_id="m", type="score", payload=dict(team_id="a", event_type="goal"))),
               dict(action_id="future", type="score_event", queued_at="2026-10-17T11:02:00Z", base_version=999,
                    payload=dict(event_id="future", match_id="m", type="score", payload=dict(team_id="a", event_type="goal")))]
    body = dict(device_id="device", actions=actions)
    r = live_api.post("/audit/v1/offline-sync", json=body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["summary"] == dict(applied=2, rejected=1, duplicate=0)
    assert [x["action_id"] for x in data["results"]] == ["later", "earlier", "future"]
    assert [x["processed_order"] for x in data["results"]] == [2, 1, 3]
    assert [x["resolution"] for x in data["results"]] == ["rebased_append", "appended", "server_wins"]
    assert data["results"][2]["error_code"] == "INVALID_BASE_VERSION"
    assert live_api.post("/audit/v1/offline-sync", json=body).json()["summary"] == dict(applied=0, rejected=0, duplicate=3)
    assert live_api.get("/audit/v1/score/m").json()["home"]["score"] == 2


def test_offline_bad_envelope(live_api):
    assert_error(live_api.post("/audit/v1/offline-sync", json=dict(device_id="device", actions=[])), 400, "VALIDATION_ERROR")
