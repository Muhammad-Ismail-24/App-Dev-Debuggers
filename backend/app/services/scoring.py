"""Event-sourced match score projection.

The projection is rebuilt from the immutable event log on every read.  No
mutable score counters are maintained.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Callable

from sqlalchemy.exc import IntegrityError
from sqlalchemy import func

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.db.models import League, Match, MatchEvent
from app.db.repositories import MatchEventRepository, SportConfigRepository
from app.core.signing import canonical_json_equal, sign_record

logger = logging.getLogger(__name__)
_listeners: list[Callable[[str, str], Any]] = []


def register_match_listener(fn: Callable[[str, str], Any]) -> None:
    if fn not in _listeners:
        _listeners.append(fn)


def notify_match_changed(match_id: str, event_type: str) -> None:
    for fn in tuple(_listeners):
        try:
            fn(match_id, event_type)
        except Exception:
            logger.exception("match listener failed")


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
        "compensated": event_id in compensated,
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


def _bad(fields: list[str]) -> ApiError:
    return ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {"fields": fields})


_EVENT_TYPES = {
    "match_init": {"sport_id", "home_team_id", "away_team_id"},
    "match_start": set(),
    "score": {"team_id", "event_type"},
    "discipline": {"team_id", "points"},
    "tiebreak_winner": {"team_id"},
    "match_end": set(),
    "compensation": {"compensates", "reason"},
}


def _validate_request(request: Any) -> dict[str, Any]:
    if not isinstance(request, dict):
        raise _bad(["body"])
    fields: list[str] = []
    for name in ("event_id", "match_id", "type", "payload"):
        if name not in request:
            fields.append(name)
    if not isinstance(request.get("event_id"), str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", str(request.get("event_id", ""))):
        fields.append("event_id")
    if not isinstance(request.get("match_id"), str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", str(request.get("match_id", ""))):
        fields.append("match_id")
    typ = request.get("type")
    if not isinstance(typ, str) or typ not in _EVENT_TYPES:
        fields.append("type")
    payload = request.get("payload")
    if not isinstance(payload, dict):
        fields.append("payload")
    else:
        expected = _EVENT_TYPES.get(typ, set())
        optional = {"league_id"} if typ == "match_init" else set()
        fields.extend(["payload." + k for k in sorted(expected - set(payload) - optional)])  # unknown keys are ignored (PDF 5.2)
        for key in expected & set(payload):
            value = payload[key]
            if key in {"sport_id", "home_team_id", "away_team_id", "league_id", "team_id", "event_type", "compensates"}:
                if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", value):
                    fields.append("payload." + key)
            elif key == "reason" and not isinstance(value, str):
                fields.append("payload.reason")
            elif key == "points" and (isinstance(value, bool) or not isinstance(value, int)):
                fields.append("payload.points")
    if fields:
        raise _bad(fields)
    return request


class ScoreService:
    def append_event(self, session: Session, request: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        request = _validate_request(request)
        event_id, match_id, typ, payload = (request["event_id"], request["match_id"], request["type"], request["payload"])
        prior = session.query(MatchEvent).filter(MatchEvent.event_id == event_id).first()
        if prior is not None:
            if canonical_json_equal(prior.request_body, request):
                return 200, dict(prior.response)
            raise ApiError(409, "DUPLICATE_EVENT_ID", "Event ID already exists.")

        match = session.query(Match).filter(Match.match_id == match_id).with_for_update().first()
        sport = None
        if typ == "match_init":
            sport = SportConfigRepository(session).get(payload["sport_id"])
            if sport is None:
                raise ApiError(404, "SPORT_NOT_FOUND", "Sport not found.")
            if payload.get("league_id") is not None and session.query(League).filter(League.league_id == payload["league_id"]).first() is None:
                raise ApiError(404, "LEAGUE_NOT_FOUND", "League not found.")
            if match is not None:
                raise ApiError(409, "MATCH_EXISTS", "Match already exists.")
            if payload["home_team_id"] == payload["away_team_id"]:
                raise _bad(["payload.home_team_id", "payload.away_team_id"])
            match = Match(match_id=match_id, sport_id=payload["sport_id"], league_id=payload.get("league_id"),
                          home_team_id=payload["home_team_id"], away_team_id=payload["away_team_id"])
            session.add(match)
            session.flush()
            events: list[dict[str, Any]] = []
        else:
            if match is None:
                raise ApiError(404, "MATCH_NOT_FOUND", "Match not found.")
            sport = SportConfigRepository(session).get(match.sport_id)
            events = MatchEventRepository(session).list(match_id)

        if typ != "match_init":
            if typ in {"score", "discipline", "tiebreak_winner"} and payload["team_id"] not in {match.home_team_id, match.away_team_id}:  # type: ignore[union-attr]
                raise ApiError(400, "VALIDATION_ERROR", "Team is not part of the match.", {"fields": ["payload.team_id"]})
            if typ == "score" and payload["event_type"] not in sport.get("scoring_events", {}):  # type: ignore[union-attr]
                raise ApiError(400, "UNKNOWN_EVENT_TYPE", "Unknown scoring event type.")
            status = derive_status(events)
            if typ == "match_start" and status != "upcoming":
                raise ApiError(409, "ILLEGAL_TRANSITION", "Match cannot start from its current status.")
            if typ == "match_end":
                if status != "in_progress":
                    raise ApiError(409, "ILLEGAL_TRANSITION", "Match cannot end from its current status.")
                h = team_totals(sport, events, match.home_team_id)  # type: ignore[union-attr]
                a = team_totals(sport, events, match.away_team_id)  # type: ignore[union-attr]
                if h["score"] == a["score"] and not sport.get("draw_allowed") and _tiebreak_winner(events, match.home_team_id, match.away_team_id) is None:  # type: ignore[union-attr]
                    raise ApiError(409, "TIE_NOT_ALLOWED", "A tied match requires a tiebreak winner.")
            if typ in {"score", "discipline", "tiebreak_winner"} and status != "in_progress":
                raise ApiError(409, "MATCH_NOT_IN_PROGRESS", "Match is not in progress.")
            if typ == "score":
                definition = sport.get("scoring_events", {}).get(payload["event_type"])  # type: ignore[union-attr]
                totals = team_totals(sport, events, payload["team_id"])  # type: ignore[arg-type]
                periods = sport.get("periods", {})
                if sport.get("scoring_model") == "innings" and (
                    totals["balls"] >= periods.get("innings_per_team", 1) * periods.get("overs_per_innings", 0) * periods.get("balls_per_over", 0)
                    or totals["wickets"] >= periods.get("innings_per_team", 1) * periods.get("wickets_per_innings", 0)
                ):
                    raise ApiError(409, "INNINGS_COMPLETE", "The innings is complete.")
                if sport.get("scoring_model") == "round" and any(
                    team_totals(sport, events, team_id)["rounds"]
                    >= (periods.get("best_of", 1) + 1) // 2
                    for team_id in (match.home_team_id, match.away_team_id)
                ):
                    raise ApiError(409, "SERIES_ALREADY_DECIDED", "The series is already decided.")
            if typ == "compensation":
                target_row = session.query(MatchEvent).filter(MatchEvent.event_id == payload["compensates"]).first()
                target = next((e for e in events if e["event_id"] == payload["compensates"]), None)
                if target_row is not None and target_row.match_id != match_id:
                    raise ApiError(409, "INVALID_COMPENSATION", "Event cannot be compensated.")
                if target is None:
                    raise ApiError(404, "EVENT_NOT_FOUND", "Event not found.")
                if target["type"] not in {"score", "discipline", "tiebreak_winner"} or payload["compensates"] in _compensation_index(events):
                    raise ApiError(409, "INVALID_COMPENSATION", "Event cannot be compensated.")

        sequence = len(events) + 1
        signature = sign_record(event_id, payload)
        response = {"event_id": event_id, "match_id": match_id, "type": typ, "sequence": sequence,
                    "match_version": sequence, "signature": signature}
        session.add(MatchEvent(event_id=event_id, match_id=match_id, sequence=sequence, type=typ,
                               payload=payload, request_body=request, response=response, signature=signature))
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
            prior = session.query(MatchEvent).filter(MatchEvent.event_id == event_id).first()
            if prior and canonical_json_equal(prior.request_body, request):
                return 200, dict(prior.response)
            raise ApiError(409, "DUPLICATE_EVENT_ID", "Event ID already exists.")
        return 201, response


score_service = ScoreService()
