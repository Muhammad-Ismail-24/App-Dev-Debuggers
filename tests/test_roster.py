import pytest
from conftest import assert_error


def scenario():
    return dict(league=dict(league_id="roster", tenant_id="tenant-alpha", sport_id="football",
                           transfer_window=dict(open="2026-09-01", close="2026-09-30"), max_squad_size=3, required_positions={"gk": 1}),
                squads=[dict(squad_id="a", club_id="ca", tenant_id="tenant-alpha", name="A"),
                        dict(squad_id="b", club_id="cb", tenant_id="tenant-alpha", name="B")],
                players=[dict(player_id="keeper", name="K", position="gk", squad_id="a", role="captain"),
                         dict(player_id="p", name="P", position="df", squad_id="a", role="starter")], matches_in_progress=[])


def transfer(**changes):
    return dict(request_id="tr", league_id="roster", player_id="p", type="transfer", from_squad_id="a",
                to_squad_id="b", effective_date="2026-09-30", loan_end_date=None, reason="Move", requested_by="manager") | changes


@pytest.mark.parametrize("live", [False, True])
def test_last_day_transfer_and_immutable_replay(live_api, live):
    body = scenario()
    if live:
        body["matches_in_progress"] = [dict(match_id="live", home_squad_id="a", away_squad_id="b")]
    assert live_api.post("/audit/v1/roster/setup", json=body).status_code == 201
    r = live_api.post("/audit/v1/roster/transfer", json=transfer())
    assert r.status_code == 201, r.text
    assert r.json()["state"] == ("deferred_until_match_end" if live else "active")
    assert r.json()["blocking_match_id"] == ("live" if live else None)
    replay = live_api.post("/audit/v1/roster/transfer", json=transfer())
    assert replay.status_code == 200 and replay.json() == r.json()
    assert len(live_api.get("/audit/v1/roster/history/p?as_of=2026-09-30").json()["history"]) == 1


@pytest.mark.parametrize("changes,code", [({"player_id": "keeper"}, "MIN_POSITION_VIOLATION"),
    ({"effective_date": "2026-10-01"}, "TRANSFER_WINDOW_CLOSED"), ({"from_squad_id": "b", "to_squad_id": "a"}, "NOT_IN_SQUAD")])
def test_roster_rejections_leave_no_audit(live_api, changes, code):
    assert live_api.post("/audit/v1/roster/setup", json=scenario()).status_code == 201
    body = transfer(**changes)
    assert_error(live_api.post("/audit/v1/roster/transfer", json=body), 409, code)
    assert live_api.get("/audit/v1/roster/history/"+body["player_id"]).json()["history"] == []


def test_loan_auto_return_once(live_api):
    assert live_api.post("/audit/v1/roster/setup", json=scenario()).status_code == 201
    assert live_api.post("/audit/v1/roster/transfer", json=transfer(type="loan", loan_end_date="2026-10-02")).status_code == 201
    assert live_api.get("/audit/v1/roster/history/p?as_of=2026-10-02").json()["current_squad_id"] == "b"
    for _ in range(2):
        r = live_api.get("/audit/v1/roster/history/p?as_of=2026-10-03").json()
        assert r["current_squad_id"] == "a" and r["parent_squad_id"] is None
        assert [e["action"] for e in r["history"]] == ["loan", "loan_return"]
