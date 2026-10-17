"""Event-sourced match score projection.

The projection is rebuilt from the immutable event log on every read.  No
mutable score counters are maintained.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.db.repositories import MatchEventRepository, SportConfigRepository


def _compensation_index(events: list[dict[str, Any]]) -> dict[str, str]:
    """Return target event_id -> compensation event_id in one linear pass."""
    compensated: dict[str, str] = {}
    for event in events:
        if event.get("type") == "compensation":
            target = event.get("payload", {}).get("compensates")
            if isinstance(target, str):
                compensated[target] = event["event_id"]
    return compensated


def _is_active(event: dict[str, Any], compensated: dict[str, str]) -> bool:
    event_id = event["event_id"]
    return event.get("type") != "compensation" and event_id not in compensated


def derive_status(events: list[dict[str, Any]]) -> str:
    """Derive match status from active lifecycle events."""
    compensated = _compensation_index(events)
    active_types = {
        event["type"]
        for event in events
        if _is_active(event, compensated)
    }
    if "match_end" in active_types:
        return "completed"
    if "match_start" in active_types:
        return "in_progress"
    return "upcoming"


def _team_total_details(
    sport_config: dict[str, Any],
    events: list[dict[str, Any]],
    team_id: str,
) -> dict[str, int]:
    compensated = _compensation_index(events)
    scoring_model = sport_config["scoring_model"]
    scoring_events = sport_config.get("scoring_events", {})
    score = 0
    balls = 0
    wickets = 0
    rounds = 0

    for event in events:
        if not _is_active(event, compensated):
            continue
        payload = event.get("payload", {})
        if payload.get("team_id") != team_id or event["type"] != "score":
            continue
        definition = scoring_events.get(payload.get("event_type"), {})
        if scoring_model == "event":
            score += definition.get("points", 0)
        elif scoring_model == "innings":
            score += definition.get("runs", 0)
            balls += int(definition.get("legal_ball", False))
            wickets += int(definition.get("wicket", False))
        elif scoring_model == "round":
            score += definition.get("rounds", 0)
            rounds += definition.get("rounds", 0)

    return {
        "score": score,
        "balls": balls,
        "wickets": wickets,
        "rounds": rounds,
    }


def team_totals(
    sport_config: dict[str, Any],
    events: list[dict[str, Any]],
    team_id: str,
) -> dict[str, int]:
    """Return active score totals for one team."""
    return _team_total_details(sport_config, events, team_id)


def _fair_play(
    events: list[dict[str, Any]],
    team_id: str,
) -> int:
    compensated = _compensation_index(events)
    return sum(
        event.get("payload", {}).get("points", 0)
        for event in events
        if _is_active(event, compensated)
        and event.get("type") == "discipline"
        and event.get("payload", {}).get("team_id") == team_id
    )


def _tiebreak_winner(
    events: list[dict[str, Any]],
    home_team_id: str,
    away_team_id: str,
) -> str | None:
    compensated = _compensation_index(events)
    winner: str | None = None
    for event in events:
        if not _is_active(event, compensated):
            continue
        if event.get("type") != "tiebreak_winner":
            continue
        team_id = event.get("payload", {}).get("team_id")
        if team_id in {home_team_id, away_team_id}:
            winner = team_id
    return winner


def _event_projection(
    event: dict[str, Any],
    compensated: dict[str, str],
) -> dict[str, Any]:
    event_id = event["event_id"]
    return {
        "sequence": event["sequence"],
        "event_id": event_id,
        "type": event["type"],
        "payload": event["payload"],
        "signature": event["signature"],
        "compensated": event_id in compensated or event["type"] == "compensation",
        "compensated_by": (
            compensated.get(event_id)
            if event["type"] != "compensation"
            else None
        ),
    }


def project_match(
    sport_config: dict[str, Any],
    match: dict[str, Any],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the complete score endpoint response from an event log."""
    ordered_events = sorted(events, key=lambda event: event["sequence"])
    compensated = _compensation_index(ordered_events)
    status = derive_status(ordered_events)
    home_team_id = match["home_team_id"]
    away_team_id = match["away_team_id"]
    home_totals = _team_total_details(sport_config, ordered_events, home_team_id)
    away_totals = _team_total_details(sport_config, ordered_events, away_team_id)
    tiebreak_winner = _tiebreak_winner(
        ordered_events,
        home_team_id,
        away_team_id,
    )

    winner_team_id: str | None = None
    outcome = "pending"
    if home_totals["score"] > away_totals["score"]:
        winner_team_id = home_team_id
    elif away_totals["score"] > home_totals["score"]:
        winner_team_id = away_team_id
    elif tiebreak_winner is not None:
        winner_team_id = tiebreak_winner

    if status == "completed":
        if winner_team_id == home_team_id:
            outcome = "home_win"
        elif winner_team_id == away_team_id:
            outcome = "away_win"
        elif sport_config.get("draw_allowed"):
            outcome = "draw"
        else:
            outcome = "undecided"

    periods = sport_config.get("periods", {})
    is_innings = sport_config.get("scoring_model") == "innings"
    balls_per_over = periods.get("balls_per_over", 1)

    def team_body(team_id: str, totals: dict[str, int]) -> dict[str, Any]:
        balls = totals["balls"] if is_innings else None
        wickets = totals["wickets"] if is_innings else None
        overs = (
            f"{balls // balls_per_over}.{balls % balls_per_over}"
            if is_innings
            else None
        )
        return {
            "team_id": team_id,
            "score": totals["score"],
            "wickets": wickets,
            "balls": balls,
            "overs": overs,
            "fair_play": _fair_play(ordered_events, team_id),
        }

    return {
        "match_id": match["match_id"],
        "sport_id": match["sport_id"],
        "league_id": match["league_id"],
        "status": status,
        "outcome": outcome,
        "winner_team_id": winner_team_id,
        "tiebreak_winner_team_id": tiebreak_winner,
        "home": team_body(home_team_id, home_totals),
        "away": team_body(away_team_id, away_totals),
        "version": len(ordered_events),
        "events": [
            _event_projection(event, compensated)
            for event in ordered_events
        ],
    }


def get_score_projection(session: Session, match_id: str) -> dict[str, Any]:
    """Load match/config/event rows and return the rebuilt score projection."""
    match_repository = MatchEventRepository(session)
    match = match_repository.get_match(match_id)
    if match is None:
        raise ApiError(
            status_code=404,
            code="MATCH_NOT_FOUND",
            message="Match not found.",
        )

    sport_config = SportConfigRepository(session).get(match["sport_id"])
    if sport_config is None:
        raise ApiError(
            status_code=404,
            code="SPORT_NOT_FOUND",
            message="Sport not found.",
        )
    return project_match(sport_config, match, match_repository.list(match_id))
