from collections import Counter
from copy import deepcopy
from itertools import combinations
from time import perf_counter

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api.routes.fixtures import router
from app.services.fixtures import InvalidResult, NoValidPairing, generate_fixtures
from conftest import contract_test_app


def generate(format_, n, **params):
    return generate_fixtures(dict(format=format_, teams=[f"t{i}" for i in range(1, n+1)], params=params))


@pytest.mark.parametrize("n", range(2, 41))
@pytest.mark.parametrize("legs", [1, 2])
def test_round_robin_invariants(n, legs):
    result = generate("round_robin", n, legs=legs)
    pairs, ordered, byes = Counter(), Counter(), Counter()
    balance = {leg: Counter() for leg in range(1, legs+1)}
    assert result["round_count"] == legs * (n if n % 2 else n-1)
    for r in result["rounds"]:
        players = list(r["byes"])
        assert len(r["byes"]) == n % 2
        byes.update(r["byes"])
        for i, m in enumerate(r["matches"], 1):
            assert m["match_id"] == f"RR-L{m['leg']}-R{r['round']}-M{i}"
            assert m["status"] == "scheduled" and m["awarded_to"] is None
            a, b = m["home"], m["away"]
            players += [a, b]
            pairs[tuple(sorted((a, b)))] += 1
            ordered[a, b] += 1
            balance[m["leg"]][a] += 1
            balance[m["leg"]][b] -= 1
        assert len(players) == len(set(players)) == n
    assert len(pairs) == n*(n-1)//2 and set(pairs.values()) == {legs}
    assert all(abs(v) <= 1 for c in balance.values() for v in c.values())
    if legs == 2:
        assert set(ordered.values()) == {1}
    if n % 2:
        assert len(byes) == n and set(byes.values()) == {legs}
    assert result["summary"] == dict(total=n*(n-1)//2*legs, scheduled=n*(n-1)//2*legs, forfeit=0, voided=0)


@pytest.mark.parametrize("policy", ["void_all", "forfeit_remaining"])
def test_withdrawals_preserve_fixtures(policy):
    withdrawals = [{"team_id": "t1", "after_round": 2}, {"team_id": "t2", "after_round": 0}]
    result = generate("round_robin", 5, legs=2, withdrawals=withdrawals, withdrawal_policy=policy)
    counts = Counter()
    for r in result["rounds"]:
        for m in r["matches"]:
            absent = {w["team_id"] for w in withdrawals if policy == "void_all" or r["round"] > w["after_round"]}
            involved = absent & {m["home"], m["away"]}
            status = "voided" if involved and (policy == "void_all" or len(involved) == 2) else "forfeit" if involved else "scheduled"
            assert m["status"] == status
            assert m["awarded_to"] == (next(iter({m["home"], m["away"]} - involved)) if status == "forfeit" else None)
            counts[status] += 1
    assert result["summary"]["total"] == 20
    assert all(result["summary"][k] == counts[k] for k in counts)


def all_matches(result):
    if "rounds" in result:
        return [m for r in result["rounds"] for m in r["matches"]]
    return [m for key in ("winners", "losers") for r in result[key] for m in r["matches"]] + result["grand_final"]


@pytest.mark.parametrize("n", [2, 3, 5, 6, 8, 17, 64, 127, 128])
def test_single_elimination_seeding_and_byes(n):
    result = generate("single_elim", n)
    size = result["bracket_size"]
    first = result["rounds"][0]["matches"]
    assert sum(m["bye"] for m in first) == size-n
    assert len(all_matches(result)) == size-1
    seen = []
    for m in first:
        assert m["home_seed"] < (m["away_seed"] or size+1)
        seen += [t for t in (m["home"], m["away"]) if t]
        if m["bye"]:
            assert m["winner"] == m["home"] and m["away"] is None
    assert len(set(seen)) == n
    if n == 6:
        assert [(m["home"], m["away"]) for m in first] == [("t1", None), ("t4", "t5"), ("t2", None), ("t3", "t6")]


def test_advancement_and_third_place_results_unordered():
    result = generate("single_elim", 4, third_place_match=True, results=[
        {"match_id": "TP", "winner": "t4"}, {"match_id": "R2M1", "winner": "t1"},
        {"match_id": "R1M2", "winner": "t2"}, {"match_id": "R1M1", "winner": "t1"}])
    m = {m["match_id"]: m for m in all_matches(result)}
    assert m["R2M1"]["winner"] == "t1" and m["R2M1"]["loser"] == "t2"
    assert (m["TP"]["home"], m["TP"]["away"], m["TP"]["winner"]) == ("t4", "t3", "t4")


@pytest.mark.parametrize("format_,n,params", [
    ("round_robin", 1, {}), ("round_robin", 41, {}), ("double_elim", 2, {}),
    ("single_elim", 129, {}), ("swiss", 65, {}),
    ("round_robin", 4, {"legs": True}), ("round_robin", 4, {"legs": "2"}),
    ("round_robin", 4, {"legs": 3}), ("round_robin", 4, {"withdrawals": [{"team_id": "missing", "after_round": 0}]}),
    ("round_robin", 4, {"withdrawals": [{"team_id": "t1", "after_round": 4}]}),
    ("swiss", 4, {"round": 2}), ("swiss", 4, {"total_rounds": 4}),
    ("single_elim", 4, {"third_place_match": 1}),
    ("single_elim", 4, {"results": [{"match_id": "R1M1", "winner": "t1"}]*2}),
])
def test_invalid_requests(format_, n, params):
    with pytest.raises(ValidationError):
        generate(format_, n, **params)


@pytest.mark.parametrize("result", [
    {"match_id": "missing", "winner": "t1"}, {"match_id": "R1M1", "winner": "t2"},
    {"match_id": "R2M1", "winner": "t1"}])
def test_invalid_results(result):
    with pytest.raises(InvalidResult):
        generate("single_elim", 4, results=[result])


@pytest.mark.parametrize("n", [3, 5, 8, 16, 31, 128])
def test_double_elimination_graph(n):
    result = generate("double_elim", n)
    size = result["bracket_size"]
    matches = {m["match_id"]: m for m in all_matches(result)}
    inbound = Counter()
    assert sum(len(r["matches"]) for r in result["losers"]) == size-2
    for m in matches.values():
        for kind in ("winner_to", "loser_to"):
            if m[kind]:
                dest = m[kind]
                assert dest["match_id"] in matches
                inbound[dest["match_id"], dest["slot"]] += 1
        if m["bracket"] == "winners":
            assert m["winner_to"] and m["loser_to"]
        if m["bracket"] == "losers":
            assert m["winner_to"] and m["loser_to"] is None
    for id_ in matches:
        if not id_.startswith("WR1M"):
            assert inbound[id_, "home"] == inbound[id_, "away"] == 1


@pytest.mark.parametrize("n", [3, 6, 8, 17])
@pytest.mark.parametrize("reset", [False, True])
@pytest.mark.parametrize("lb_wins", [False, True])
def test_double_elimination_play_through(n, reset, lb_wins):
    results = []
    for _ in range(2*n+15):
        result = generate("double_elim", n, bracket_reset=reset, results=results)
        playable = [m for m in all_matches(result) if m["home"] and m["away"] and not m["winner"]
                    and (m["match_id"] != "GF2" or m["required"] is True)]
        if not playable:
            break
        for m in playable:
            results.append(dict(match_id=m["match_id"], winner=m["away"] if m["match_id"] == "GF1" and lb_wins else m["home"]))
    gf = result["grand_final"]
    assert gf[0]["winner"]
    if reset:
        assert gf[1]["required"] == lb_wins
        assert gf[1]["conditional"] is True
        assert {gf[1]["home"], gf[1]["away"]} == {gf[0]["home"], gf[0]["away"]}
        assert gf[1]["home"] == gf[0]["winner"]
        assert bool(gf[1]["winner"]) == lb_wins
    else:
        assert len(gf) == 1


@pytest.mark.parametrize("n", [2, 3, 5, 6, 63, 64])
def test_swiss_first_round_exact(n):
    result = generate("swiss", n)
    m = n//2
    assert [(p["home"], p["away"]) for p in result["pairings"]] == [(f"t{i}", f"t{i+m}") for i in range(1, m+1)]
    assert result["bye"] == (f"t{n}" if n % 2 else None)
    assert all(s["score"] == s["buchholz"] == 0 for s in result["standings"])


def exhaustive_cost(teams, scores, forbidden):
    if not teams:
        return 0
    a, *rest = teams
    return min((abs(scores[a]-scores[b]) + exhaustive_cost([t for t in rest if t != b], scores, forbidden)
                for b in rest if frozenset((a, b)) not in forbidden), default=float("inf"))


@pytest.mark.parametrize("n", [5, 6, 8, 10])
def test_swiss_optimality_against_exhaustive_oracle(n):
    history, seen, had_bye = [], set(), set()
    for number in range(1, min(n, 5)):
        try:
            result = generate("swiss", n, total_rounds=n-1, round=number, history=history)
        except NoValidPairing:
            # Verify infeasibility independently, including every eligible bye.
            scores = {f"t{i}": 0 for i in range(1, n+1)}
            for h in history:
                if h["bye"]:
                    scores[h["bye"]] += 1
                for m in h["matches"]:
                    scores[m["home"]] += 1 if m["result"] == "home" else .5
                    scores[m["away"]] += 0 if m["result"] == "home" else .5
            candidates = [t for t in scores if t not in had_bye] if n % 2 else [None]
            assert all(exhaustive_cost([t for t in scores if t != b], scores, seen) == float("inf") for b in candidates)
            break
        scores = {s["team_id"]: s["score"] for s in result["standings"]}
        active = [t for t in scores if t != result["bye"]]
        if number > 1:
            assert sum(abs(scores[p["home"]]-scores[p["away"]]) for p in result["pairings"]) == exhaustive_cost(active, scores, seen)
        if result["bye"]:
            assert result["bye"] not in had_bye
            had_bye.add(result["bye"])
        h = dict(round=number, bye=result["bye"], matches=[])
        for i, p in enumerate(result["pairings"]):
            pair = frozenset((p["home"], p["away"]))
            assert pair not in seen
            seen.add(pair)
            h["matches"].append(dict(home=p["home"], away=p["away"], result="home" if i % 2 else "draw"))
        history.append(h)


def test_swiss_buchholz_and_bye():
    history = [dict(round=1, bye="t5", matches=[dict(home="t1", away="t3", result="home"), dict(home="t2", away="t4", result="draw")])]
    r = generate("swiss", 5, round=2, history=history)
    assert r["bye"] == "t3"
    assert [(s["team_id"], s["score"], s["buchholz"]) for s in r["standings"]] == [
        ("t1", 1, 0), ("t5", 1, 0), ("t2", .5, .5), ("t4", .5, .5), ("t3", 0, 1)]


def test_swiss_maximum_field_performance():
    start = perf_counter()
    first = generate("swiss", 64)
    history = [dict(round=1, bye=None, matches=[dict(home=p["home"], away=p["away"], result="home") for p in first["pairings"]])]
    assert len(generate("swiss", 64, round=2, history=history)["pairings"]) == 32
    assert perf_counter() - start < 5


def test_http_validation_and_purity():
    client = TestClient(contract_test_app(router))
    body = dict(format="round_robin", teams=["a", "b", "c"], params={}, extra="ignored")
    original = deepcopy(body)
    assert client.post("/audit/v1/fixtures", json=body).json() == generate_fixtures(body)
    assert body == original
    for bad in ({}, dict(format="swiss", teams=["a", "a"]), dict(format="swiss", teams=["a|", "b"])):
        r = client.post("/audit/v1/fixtures", json=bad)
        assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_ERROR"
        assert r.json()["error"]["details"]["fields"]
    assert client.post("/audit/v1/fixtures", content="{").status_code == 400


def test_http_infeasible_pairing_and_invalid_winner():
    client = TestClient(contract_test_app(router))
    # Three rounds remove every cross edge of K3,3. What remains is two
    # disconnected odd triangles, which cannot have a perfect matching.
    teams = [f"t{i}" for i in range(1, 7)]
    history = [dict(round=r+1, bye=None, matches=[dict(home=teams[i], away=teams[3+(i+r)%3], result="draw") for i in range(3)]) for r in range(3)]
    r = client.post("/audit/v1/fixtures", json=dict(format="swiss", teams=teams, params=dict(round=4, total_rounds=5, history=history)))
    assert r.status_code == 409 and r.json()["error"]["code"] == "NO_VALID_PAIRING"
    assert r.json()["error"]["details"] == {"round": 4}
    r = client.post("/audit/v1/fixtures", json=dict(format="single_elim", teams=teams, params=dict(results=[dict(match_id="R1M1", winner="t2")])))
    assert r.status_code == 400 and r.json()["error"]["details"]["fields"] == ["params.results"]
    with pytest.raises(InvalidResult):
        generate("double_elim", 4, results=[dict(match_id="GF2", winner="t1")])


def test_live_fixture_contract(live_api):
    for format_, n in [("round_robin", 5), ("single_elim", 6), ("swiss", 7), ("double_elim", 8)]:
        body = dict(format=format_, teams=[f"t{i}" for i in range(1, n+1)], params={})
        r = live_api.post("/audit/v1/fixtures", json=body)
        assert r.status_code == 200 and r.json() == generate_fixtures(body)
