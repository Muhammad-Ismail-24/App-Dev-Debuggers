"""Pure fixture generation. No persistence or sport-name-specific behavior."""
from collections import Counter

from app.schemas.fixtures import FixturesRequest


class NoValidPairing(ValueError):
    def __init__(self, round_number):
        self.round_number = round_number
        super().__init__("No complete rematch-free pairing exists")


class InvalidResult(ValueError):
    pass


def generate_fixtures(request: FixturesRequest | dict) -> dict:
    request = FixturesRequest.model_validate(request)
    return {"round_robin": _round_robin, "swiss": _swiss,
            "single_elim": _single_elimination, "double_elim": _double_elimination}[
                request.format](request.teams, request.params)


def _round_robin(teams, params):
    n = len(teams)
    ring = list(range(n)) + ([None] if n % 2 else [])
    first_leg = []
    for _ in range(len(ring) - 1):
        pairs, byes = [], []
        for a, b in zip(ring[:len(ring)//2], reversed(ring[len(ring)//2:])):
            if a is None or b is None:
                byes.append(teams[b if a is None else a])
                continue
            # A cyclic orientation is regular on an odd field. For an even field,
            # orient the extra team's edges alternately to keep imbalance <= 1.
            if n % 2:
                a_home = (b - a) % n <= n // 2
            elif n - 1 in (a, b):
                other = b if a == n - 1 else a
                a_home = (other % 2 == 0) == (a == n - 1)
            else:
                a_home = (b - a) % (n - 1) <= (n - 1) // 2
            pairs.append((teams[a], teams[b]) if a_home else (teams[b], teams[a]))
        first_leg.append((pairs, byes))
        ring = [ring[0], ring[-1], *ring[1:-1]]
    withdrawn = {}
    for w in params["withdrawals"]:
        withdrawn[w["team_id"]] = min(w["after_round"], withdrawn.get(w["team_id"], w["after_round"]))
    rounds, counts = [], Counter()
    for leg in range(1, params["legs"] + 1):
        for local, (pairs, byes) in enumerate(first_leg, 1):
            number = (leg - 1) * len(first_leg) + local
            matches = []
            for index, (a, b) in enumerate(pairs, 1):
                home, away = (a, b) if leg == 1 else (b, a)
                status, awarded = "scheduled", None
                if params["withdrawal_policy"] == "void_all":
                    if home in withdrawn or away in withdrawn:
                        status = "voided"
                else:
                    absent = [t for t in (home, away) if t in withdrawn and number > withdrawn[t]]
                    if len(absent) == 2:
                        status = "voided"
                    elif absent:
                        status, awarded = "forfeit", away if absent[0] == home else home
                counts[status] += 1
                matches.append(dict(match_id=f"RR-L{leg}-R{number}-M{index}", leg=leg,
                                    home=home, away=away, status=status, awarded_to=awarded))
            rounds.append(dict(round=number, matches=matches, byes=byes.copy()))
    return dict(format="round_robin", legs=params["legs"], team_count=n, round_count=len(rounds),
                rounds=rounds, summary=dict(total=sum(counts.values()),
                **{k: counts[k] for k in ("scheduled", "forfeit", "voided")}))


def _swiss(teams, params):
    # Integer half-points make the optimization exact, including all draws.
    import networkx as nx

    scores = dict.fromkeys(teams, 0)
    opponents = {t: [] for t in teams}
    byes = set()
    for h in params["history"]:
        if h["bye"] is not None:
            byes.add(h["bye"])
            scores[h["bye"]] += 2
        for m in h["matches"]:
            a, b = m["home"], m["away"]
            opponents[a].append(b)
            opponents[b].append(a)
            scores[a] += {"home": 2, "away": 0, "draw": 1}[m["result"]]
            scores[b] += {"home": 0, "away": 2, "draw": 1}[m["result"]]
    buchholz = {t: sum(scores[o] for o in opponents[t]) for t in teams}
    seed = {t: i for i, t in enumerate(teams)}
    ranked = sorted(teams, key=lambda t: (-scores[t], -buchholz[t], seed[t]))
    number = params["round"]
    if number == 1:
        m = len(teams) // 2
        pairs = list(zip(teams[:m], teams[m:2*m]))
        bye = teams[-1] if len(teams) % 2 else None
    else:
        candidates = sorted((t for t in teams if t not in byes),
                            key=lambda t: (scores[t], -seed[t])) if len(teams) % 2 else [None]
        for bye in candidates:
            active = [t for t in teams if t != bye]
            graph = nx.Graph()
            graph.add_nodes_from(active)
            for i, a in enumerate(active):
                for b in active[i+1:]:
                    if b not in opponents[a]:
                        graph.add_edge(a, b, weight=abs(scores[a] - scores[b]))
            # Generic weighted blossom matching, NOT a fixture-generation library.
            matching = nx.min_weight_matching(graph, weight="weight")
            if len(matching) * 2 == len(active):
                pairs = sorted((tuple(sorted(p, key=seed.get)) for p in matching),
                               key=lambda p: (seed[p[0]], seed[p[1]]))
                break
        else:
            raise NoValidPairing(number)
    return dict(format="swiss", round=number, total_rounds=params["total_rounds"], bye=bye,
                pairings=[dict(match_id=f"SW-R{number}-M{i}", home=a, away=b)
                          for i, (a, b) in enumerate(pairs, 1)],
                standings=[dict(rank=i, team_id=t, score=scores[t]/2, buchholz=buchholz[t]/2)
                           for i, t in enumerate(ranked, 1)])


def _seed_order(size):
    order = [1, 2]
    while len(order) < size:
        total = len(order) * 2 + 1
        order = [v for s in order for v in (s, total - s)]
    return order


def _match(id_, bracket, round_, index):
    return dict(match_id=id_, bracket=bracket, round=round_, index=index,
                home=None, away=None, home_seed=None, away_seed=None, bye=False,
                winner=None, loser=None, winner_to=None, loser_to=None)


def _target(match, slot):
    return dict(match_id=match["match_id"], slot=slot)


def _winners(teams, prefix, bracket):
    size = 1 << (len(teams) - 1).bit_length()
    rounds = [dict(round=r, matches=[_match(f"{prefix}{r}M{i}", bracket, r, i)
               for i in range(1, (size >> r) + 1)]) for r in range(1, size.bit_length())]
    order = _seed_order(size)
    for i, m in enumerate(rounds[0]["matches"]):
        a, b = sorted(order[2*i:2*i+2])
        m.update(home=teams[a-1], home_seed=a,
                 away=teams[b-1] if b <= len(teams) else None,
                 away_seed=b if b <= len(teams) else None)
    for current, following in zip(rounds, rounds[1:]):
        for i, m in enumerate(current["matches"]):
            m["winner_to"] = _target(following["matches"][i//2], "home" if i % 2 == 0 else "away")
    return size, rounds


def _propagate(rounds, teams, results, reset_match=None):
    matches = [m for r in rounds for m in r["matches"]]
    lookup = {m["match_id"]: m for m in matches}
    supplied = {r["match_id"]: r["winner"] for r in results}
    if set(supplied) - lookup.keys():
        raise InvalidResult("params.results: unknown match_id")
    known = {(m["match_id"], slot) for m in rounds[0]["matches"] for slot in ("home", "away")}
    done = set()
    seed = {t: i for i, t in enumerate(teams, 1)}
    while True:
        progressed = False
        for m in matches:
            id_ = m["match_id"]
            if id_ in done or m is reset_match:
                continue
            if not all((id_, slot) in known for slot in ("home", "away")):
                continue
            a, b = m["home"], m["away"]
            if a is None or b is None:
                m.update(bye=True, winner=a or b)
                if id_ in supplied and supplied[id_] != m["winner"]:
                    raise InvalidResult("params.results: incorrect bye winner")
            elif id_ in supplied:
                if supplied[id_] not in (a, b):
                    raise InvalidResult("params.results: winner is not a participant")
                m.update(winner=supplied[id_], loser=b if supplied[id_] == a else a)
            else:
                continue
            done.add(id_)
            progressed = True
            for outcome in ("winner", "loser"):
                dest = m[outcome + "_to"]
                if dest is not None:
                    target = lookup[dest["match_id"]]
                    slot = dest["slot"]
                    target[slot] = m[outcome]
                    target[slot + "_seed"] = seed.get(m[outcome])
                    known.add((target["match_id"], slot))
        if not progressed:
            break
    if reset_match is not None:
        gf = lookup["GF1"]
        reset_match["required"] = None if gf["winner"] is None else gf["winner"] == gf["away"]
        # Before GF1 is played show its participants. After it is played use
        # the winner_to/loser_to slots already populated by graph propagation.
        if gf["winner"] is None:
            for slot in ("home", "away"):
                reset_match[slot] = gf[slot]
                reset_match[slot + "_seed"] = gf[slot + "_seed"]
        if reset_match["match_id"] in supplied:
            win = supplied[reset_match["match_id"]]
            if reset_match["required"] is not True or win not in (gf["home"], gf["away"]):
                raise InvalidResult("params.results: reset is not required or winner is invalid")
            reset_match.update(winner=win, loser=gf["away"] if win == gf["home"] else gf["home"])
            done.add(reset_match["match_id"])
    if set(supplied) - done:
        raise InvalidResult("params.results: participants are not yet determined")


def _single_elimination(teams, params):
    size, rounds = _winners(teams, "R", "main")
    if params["third_place_match"]:
        third = _match("TP", "third_place", len(rounds), 1)
        if len(rounds) > 1:
            for i, m in enumerate(rounds[-2]["matches"]):
                m["loser_to"] = _target(third, "home" if i == 0 else "away")
        rounds[-1]["matches"].append(third)
    _propagate(rounds, teams, params["results"])
    return dict(format="single_elim", bracket_size=size, rounds=rounds)


def _double_elimination(teams, params):
    size, winners = _winners(teams, "WR", "winners")
    k = len(winners)
    losers = [dict(round=r, matches=[_match(f"LR{r}M{i}", "losers", r, i)
              for i in range(1, (size >> ((r+1)//2 + 1)) + 1)]) for r in range(1, 2*k-1)]
    for i, m in enumerate(winners[0]["matches"]):
        m["loser_to"] = _target(losers[0]["matches"][i//2], "home" if i % 2 == 0 else "away")
    for r in range(2, k+1):
        for i, m in enumerate(winners[r-1]["matches"]):
            # Reverse drop-in order to reduce immediate rematches; slot mapping is free.
            m["loser_to"] = _target(losers[2*r-3]["matches"][-1-i], "away")
    for r in range(1, len(losers)):
        for i, m in enumerate(losers[r-1]["matches"]):
            m["winner_to"] = _target(losers[r]["matches"][i if r % 2 else i//2],
                                     "home" if r % 2 or i % 2 == 0 else "away")
    gf = _match("GF1", "grand_final", 1, 1)
    finals = [gf]
    winners[-1]["matches"][0]["winner_to"] = _target(gf, "home")
    losers[-1]["matches"][0]["winner_to"] = _target(gf, "away")
    reset = None
    if params["bracket_reset"]:
        reset = _match("GF2", "grand_final", 2, 1)
        reset.update(conditional=True, required=None)
        gf["winner_to"] = _target(reset, "home")
        gf["loser_to"] = _target(reset, "away")
        finals.append(reset)
    _propagate(winners + losers + [dict(matches=finals)], teams, params["results"], reset)
    return dict(format="double_elim", bracket_size=size, bracket_reset=params["bracket_reset"],
                winners=winners, losers=losers, grand_final=finals)
