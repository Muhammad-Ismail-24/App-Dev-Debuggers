from copy import deepcopy
import hashlib

import pytest
from fastapi.testclient import TestClient

from app.api.routes.standings import router
from app.services.standings import calculate_standings, lots_key
from conftest import contract_test_app


def match(id_, a, b, x, y, *, status="completed", winner=None, outcome=None, balls=(6, 6), wickets=(0, 0), fair=(0, 0)):
    winner = winner or (a if x > y else b if y > x else None)
    return dict(match_id=id_, status=status, winner_team_id=winner,
                outcome=outcome or ("home_win" if winner == a else "away_win" if winner == b else "draw"),
                home=dict(team_id=a, score=x, balls=balls[0], wickets=wickets[0], fair_play=fair[0]),
                away=dict(team_id=b, score=y, balls=balls[1], wickets=wickets[1], fair_play=fair[1]))


def table(matches, teams=("a", "b", "c"), model="event", **config):
    league = dict(league_id="lg-1", sport_id="mystery", teams=list(teams), lots_seed=42,
                  fixtures=[dict(match_id=m["match_id"], home=m["home"]["team_id"], away=m["away"]["team_id"]) for m in matches],
                  qualification=dict(spots=1))
    league.update(config)
    sport = dict(scoring_model=model, periods=dict(wickets_per_innings=10, overs_per_innings=20, balls_per_over=6))
    return calculate_standings(league, sport, matches)


def test_three_way_mini_league():
    result = table([match("ab", "a", "b", 3, 0), match("bc", "b", "c", 2, 0), match("ca", "c", "a", 1, 0)])
    assert [r["team_id"] for r in result["table"]] == ["a", "b", "c"]
    assert [r["resolved_by"] for r in result["table"]] == ["h2h_diff", "h2h_points", None]
    assert result["h2h"]["b"]["c"] == dict(played=1, points=3, scored=2, conceded=0)


def test_restart_after_split_uses_smaller_h2h_group():
    # All have six points. Mini-league diff separates b, ties a/c. Restart
    # ranks c above a by their head-to-head win.
    ms = [match("ab", "a", "b", 1, 0), match("bc", "b", "c", 3, 0), match("ca", "c", "a", 2, 0),
          match("ad", "a", "d", 1, 0), match("bd", "b", "d", 8, 0), match("cd", "c", "d", 1, 0)]
    # a mini diff -1; b +2; c -1: b first, c beats a on restart.
    r = table(ms, teams=("a", "b", "c", "d"))
    assert [x["team_id"] for x in r["table"]] == ["b", "c", "a", "d"]
    assert [x["resolved_by"] for x in r["table"]] == ["h2h_diff", "h2h_points", None, None]


@pytest.mark.parametrize("model", ["event", "round"])
def test_totals_tiebreak_winner_and_qualification(model):
    r = table([match("ab", "a", "b", 2, 2, winner="a"), match("ac", "a", "c", 4, 0),
               match("bc", "b", "c", 1, 1)], model=model)
    a, b, c = r["table"]
    assert (a["played"], a["won"], a["points"], a["diff"], a["status"]) == (2, 2, 6, 4, "clinched")
    assert b["status"] == c["status"] == "eliminated"


def test_incomplete_and_undecided_are_remaining():
    r = table([match("ab", "a", "b", 2, 0), match("bc", "b", "c", 100, 0, status="in_progress"),
               match("ac", "a", "c", 0, 0, outcome="undecided")])
    rows = {r["team_id"]: r for r in r["table"]}
    assert rows["c"]["played"] == 0 and rows["b"]["scored"] == 0
    assert all(r["status"] == "still_possible" for r in rows.values())


def test_nrr_balls_all_out_and_mini_league():
    r = table([match("ab", "a", "b", 100, 90, balls=(61, 60), wickets=(10, 0))],
              teams=("a", "b"), model="innings", points=dict(win=0, draw=0, loss=0))
    rows = {r["team_id"]: r for r in r["table"]}
    assert rows["a"]["diff"] == -4.0 and rows["b"]["diff"] == 4.0
    assert r["table"][0]["team_id"] == "b"
    r = table([match("ab", "a", "b", 10, 9, balls=(7, 6))], teams=("a", "b"), model="innings")
    assert r["table"][0]["diff"] == -0.429


def test_nrr_uses_aggregate_overs_not_average_match_rates():
    r = table([match("ab", "a", "b", 100, 90, balls=(60, 60)),
               match("ac", "a", "c", 100, 50, balls=(120, 60))], model="innings")
    a = next(row for row in r["table"] if row["team_id"] == "a")
    # 200 runs / 30 overs - 140 conceded / 20 overs = -0.333.
    assert a["scored"] == 200 and a["conceded"] == 140 and a["diff"] == -0.333
    assert r["h2h"]["a"]["b"] == dict(played=1, points=3, scored=100, conceded=90)


def test_h2h_subset_outweighs_overall_differential():
    # a and b have three points apiece. b's large overall differential must
    # lose to a's direct win inside that two-team mini-league.
    matches = [match("ab", "a", "b", 1, 0), match("bc", "b", "c", 100, 0),
               match("ca", "c", "a", 1, 0), match("cd", "c", "d", 1, 0)]
    r = table(matches, teams=("a", "b", "c", "d"))
    assert [row["team_id"] for row in r["table"]] == ["c", "a", "b", "d"]
    assert r["table"][1]["resolved_by"] == "h2h_points"
    assert r["table"][2]["diff"] > r["table"][1]["diff"]


def test_lots_exact_empty_and_no_mutation():
    assert lots_key(42, "lg-1", "t1") == "0613316991ce0ac31e88d6003e3ff4d5e21bb072ac5f81b42c0cdc6598453293"
    r = table([], teams=("t1", "t2", "t3"), tie_break_order=["draw_lots", "scored"])
    assert [x["team_id"] for x in r["table"]] == sorted(["t1", "t2", "t3"], key=lambda t: lots_key(42, "lg-1", t))
    assert [x["resolved_by"] for x in r["table"]] == ["draw_lots", "draw_lots", None]
    assert all(len(v) == 2 for v in r["h2h"].values())
    assert all(x["status"] == "still_possible" for x in r["table"])
    ms = [match("ab", "a", "b", 1, 0)]
    before = deepcopy(ms)
    table(ms)
    assert ms == before


@pytest.mark.parametrize("criterion", ["overall_diff", "scored", "fair_play"])
def test_configurable_criteria(criterion):
    r = table([match("ab", "a", "b", 4, 1, fair=(0, -2))], teams=("a", "b"),
              points=dict(win=0, loss=0, draw=0), tie_break_order=[criterion])
    assert r["table"][0]["team_id"] == "a"
    assert r["table"][0]["resolved_by"] == criterion


def test_all_teams_qualify_and_zero_ball_rate():
    r = table([match("ab", "a", "b", 0, 0, balls=(0, 0))], model="innings", qualification=dict(spots=3))
    assert all(x["status"] == "clinched" and x["diff"] == 0 for x in r["table"])


def test_route_fetches_fresh_authoritative_projections():
    class Source:
        projection = match("ab", "a", "b", 1, 0)
        def get_league(self, id_):
            if id_ == "missing":
                return None
            return dict(league_id=id_, sport_id="generic", teams=["a", "b"], lots_seed=42,
                        qualification=dict(spots=1), fixtures=[dict(match_id="ab", home="a", away="b")])
        def get_sport(self, id_):
            return dict(scoring_model="event")
        def get_score_projection(self, id_):
            return self.projection
    app = contract_test_app(router)
    source = app.state.standings_source = Source()
    client = TestClient(app)
    assert client.get("/audit/v1/standings/lg").json()["table"][0]["status"] == "clinched"
    source.projection = match("ab", "a", "b", 0, 0)
    assert all(r["status"] == "still_possible" for r in client.get("/audit/v1/standings/lg").json()["table"])
    assert client.get("/audit/v1/standings/missing").status_code == 404


def test_live_standings_recalculate_after_compensation(live_api):
    from conftest import append_event
    body = dict(league_id="lg", sport_id="football", teams=["a", "b"],
                fixtures=[dict(match_id="m", home="a", away="b")], qualification=dict(spots=1))
    assert live_api.post("/audit/v1/leagues", json=body).status_code == 201
    append_event(live_api, "start", "m", "match_start", {})
    append_event(live_api, "goal", "m", "score", dict(team_id="a", event_type="goal"))
    append_event(live_api, "end", "m", "match_end", {})
    before = live_api.get("/audit/v1/standings/lg").json()
    assert before["table"][0]["team_id"] == "a" and before["table"][0]["status"] == "clinched"
    append_event(live_api, "undo", "m", "compensation", dict(compensates="goal", reason="Review"))
    after = live_api.get("/audit/v1/standings/lg").json()
    assert all(r["status"] == "still_possible" and r["points"] == 1 for r in after["table"])
    assert after["h2h"]["a"]["b"]["scored"] == 0
