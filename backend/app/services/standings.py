"""Section 5.10 tables over authoritative projections, never event replay."""
import hashlib
from fractions import Fraction
from itertools import groupby

from app.schemas.standings import StandingsSource

DEFAULT_TIE_BREAKS = ["h2h_points", "h2h_diff", "overall_diff", "scored", "fair_play", "draw_lots"]


def lots_key(seed: int, league_id: str, team_id: str) -> str:
    return hashlib.sha256(f"{seed}|{league_id}|{team_id}".encode("utf-8")).hexdigest()


def _overs(side, periods):
    if side["wickets"] >= periods["wickets_per_innings"]:
        return Fraction(periods["overs_per_innings"])
    return Fraction(side["balls"], periods["balls_per_over"])


def _diff(team, matches, sport):
    scored = conceded = 0
    faced = bowled = Fraction(0)
    for m in matches:
        if team not in (m["home"]["team_id"], m["away"]["team_id"]):
            continue
        own, other = (m["home"], m["away"]) if m["home"]["team_id"] == team else (m["away"], m["home"])
        scored += own["score"]
        conceded += other["score"]
        if sport["scoring_model"] == "innings":
            faced += _overs(own, sport["periods"])
            bowled += _overs(other, sport["periods"])
    if sport["scoring_model"] != "innings":
        return scored - conceded
    # No legal balls: define that rate as zero, including an empty table.
    value = (Fraction(scored) / faced if faced else 0) - (Fraction(conceded) / bowled if bowled else 0)
    return float(round(value, 3))


def calculate_standings(league: dict, sport: dict, projections: list[dict]) -> dict:
    teams = league["teams"]
    points = league.get("points", dict(win=3, draw=1, loss=0))
    spots = league["qualification"]["spots"]
    # A missing projection is an adapter defect, not an invented score of 0-0.
    by_id = {m["match_id"]: m for m in projections}
    all_matches = [by_id[f["match_id"]] for f in league["fixtures"]]
    completed = [m for m in all_matches if m["status"] == "completed" and m["outcome"] != "undecided"]
    played_ids = {m["match_id"] for m in completed}
    rows = {t: dict(team_id=t, played=0, won=0, drawn=0, lost=0, scored=0, conceded=0,
                    diff=0, points=0, fair_play=0, status="still_possible", resolved_by=None) for t in teams}
    h2h = {a: {b: dict(played=0, points=0, scored=0, conceded=0) for b in teams if b != a} for a in teams}
    remaining = dict.fromkeys(teams, 0)
    for f in league["fixtures"]:
        if f["match_id"] not in played_ids:
            remaining[f["home"]] += 1
            remaining[f["away"]] += 1
    for m in completed:
        for own, other in ((m["home"], m["away"]), (m["away"], m["home"])):
            t, o = own["team_id"], other["team_id"]
            row = rows[t]
            outcome = "draw" if m["outcome"] == "draw" else "win" if m["winner_team_id"] == t else "loss"
            row[{"win": "won", "draw": "drawn", "loss": "lost"}[outcome]] += 1
            row["played"] += 1
            row["scored"] += own["score"]
            row["conceded"] += other["score"]
            row["points"] += points[outcome]
            row["fair_play"] += own["fair_play"]
            h = h2h[t][o]
            h["played"] += 1
            h["scored"] += own["score"]
            h["conceded"] += other["score"]
            h["points"] += points[outcome]
    for t in teams:
        rows[t]["diff"] = _diff(t, completed, sport)
    order = [c for c in league.get("tie_break_order", sport.get("tie_break_order", DEFAULT_TIE_BREAKS)) if c != "draw_lots"] + ["draw_lots"]

    def resolve(group):
        if len(group) < 2:
            return group
        mini = [m for m in completed if m["home"]["team_id"] in group and m["away"]["team_id"] in group]
        for criterion in order:
            if criterion == "draw_lots":
                ranked = sorted(group, key=lambda t: (lots_key(league["lots_seed"], league["league_id"], t), t))
                for t in ranked[:-1]:
                    rows[t]["resolved_by"] = criterion
                return ranked
            if criterion == "h2h_points":
                values = {t: sum(h2h[t][o]["points"] for o in group if o != t) for t in group}
            elif criterion == "h2h_diff":
                values = {t: _diff(t, mini, sport) for t in group}
            else:
                key = "diff" if criterion == "overall_diff" else criterion
                values = {t: rows[t][key] for t in group}
            if len(set(values.values())) > 1:
                partitions = [list(g) for _, g in groupby(sorted(group, key=values.get, reverse=True), key=values.get)]
                result = []
                for i, partition in enumerate(partitions):
                    part = resolve(partition)  # Restart from the first criterion.
                    if i < len(partitions)-1:
                        rows[part[-1]]["resolved_by"] = criterion
                    result.extend(part)
                return result
        raise AssertionError("draw_lots must terminate resolution")

    ranked = []
    for _, group in groupby(sorted(teams, key=lambda t: rows[t]["points"], reverse=True), key=lambda t: rows[t]["points"]):
        ranked.extend(resolve(list(group)))
    maximum = {t: rows[t]["points"] + points["win"] * remaining[t] for t in teams}
    for rank, t in enumerate(ranked, 1):
        row = rows[t]
        row["rank"] = rank
        if sum(maximum[o] >= row["points"] for o in teams if o != t) < spots:
            row["status"] = "clinched"
        elif sum(rows[o]["points"] > maximum[t] for o in teams if o != t) >= spots:
            row["status"] = "eliminated"
    return dict(league_id=league["league_id"], sport_id=league["sport_id"],
                qualification_spots=spots, table=[rows[t] for t in ranked], h2h=h2h)


def get_standings(league_id: str, source: StandingsSource) -> dict | None:
    league = source.get_league(league_id)
    if league is None:
        return None
    return calculate_standings(league, source.get_sport(league["sport_id"]),
                               [source.get_score_projection(f["match_id"]) for f in league["fixtures"]])
