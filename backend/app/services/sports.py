"""Sport configuration service — NaSCon '26 Platform (PDF §5.6).

Pure business logic and manual validation for arbitrary JSON-defined sports.
Never branches on a specific sport or event name.
"""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError, validation_error
from app.db.models import Sport
from app.db.repositories import SportConfigRepository

# ---------------------------------------------------------------------------
# Strict validation constants and regexes (PDF §5.6)
# ---------------------------------------------------------------------------

SPORT_ID_REGEX = re.compile(r"^[a-z0-9_-]{2,40}$")
SCORING_EVENT_KEY_REGEX = re.compile(r"^[a-z0-9_]{1,40}$")

VALID_SCORING_MODELS = frozenset({"event", "innings", "round"})

VALID_OVERTIME_POLICIES = frozenset(
    {"none", "extra_time", "shootout", "golden_score", "super_over"}
)

ALLOWED_TIE_BREAK_TOKENS = (
    "h2h_points",
    "h2h_diff",
    "overall_diff",
    "scored",
    "fair_play",
    "draw_lots",
)
ALLOWED_TIE_BREAK_SET = frozenset(ALLOWED_TIE_BREAK_TOKENS)
DEFAULT_TIE_BREAK_ORDER = list(ALLOWED_TIE_BREAK_TOKENS)


# ---------------------------------------------------------------------------
# Strict type-checking helpers (JSON strictness)
# ---------------------------------------------------------------------------


def is_strict_int(val: Any) -> bool:
    """Return True iff val is strictly an int and not a bool."""
    return type(val) is int


def is_strict_bool(val: Any) -> bool:
    """Return True iff val is strictly a bool."""
    return type(val) is bool


def is_strict_str(val: Any) -> bool:
    """Return True iff val is strictly a str."""
    return type(val) is str


# ---------------------------------------------------------------------------
# Manual Validation & Normalization
# ---------------------------------------------------------------------------


def validate_and_normalize_sport(data: Any) -> dict[str, Any]:
    """Manually validate sport payload with strict typing and normalize config.

    Raises:
        ApiError: 400 VALIDATION_ERROR with offending top-level field names in details.fields.
    """
    if not isinstance(data, dict):
        raise validation_error(["body"], message="Request body must be a JSON object.")

    bad_fields: list[str] = []

    def mark_invalid(field_name: str) -> None:
        if field_name not in bad_fields:
            bad_fields.append(field_name)

    # 1. sport_id: required string matching ^[a-z0-9_-]{2,40}$
    sport_id = data.get("sport_id")
    if not (is_strict_str(sport_id) and bool(SPORT_ID_REGEX.fullmatch(sport_id))):
        mark_invalid("sport_id")

    # 2. name: required string, 1-80 chars
    name = data.get("name")
    if not (is_strict_str(name) and 1 <= len(name) <= 80):
        mark_invalid("name")

    # 3. scoring_model: required, one of event, innings, round
    scoring_model = data.get("scoring_model")
    if not (is_strict_str(scoring_model) and scoring_model in VALID_SCORING_MODELS):
        mark_invalid("scoring_model")

    # 4. periods: required object based on scoring_model
    periods = data.get("periods")
    normalized_periods: dict[str, Any] = {}
    if not isinstance(periods, dict):
        mark_invalid("periods")
    else:
        if scoring_model == "event":
            count = periods.get("count")
            duration_minutes = periods.get("duration_minutes")
            if not (
                is_strict_int(count)
                and count >= 1
                and is_strict_int(duration_minutes)
                and duration_minutes >= 1
            ):
                mark_invalid("periods")
            else:
                normalized_periods = {
                    "count": count,
                    "duration_minutes": duration_minutes,
                }
        elif scoring_model == "innings":
            ipt = periods.get("innings_per_team")
            opi = periods.get("overs_per_innings")
            bpo = periods.get("balls_per_over")
            wpi = periods.get("wickets_per_innings")
            if not (
                is_strict_int(ipt)
                and ipt >= 1
                and is_strict_int(opi)
                and opi >= 1
                and is_strict_int(bpo)
                and bpo >= 1
                and is_strict_int(wpi)
                and wpi >= 1
            ):
                mark_invalid("periods")
            else:
                normalized_periods = {
                    "innings_per_team": ipt,
                    "overs_per_innings": opi,
                    "balls_per_over": bpo,
                    "wickets_per_innings": wpi,
                }
        elif scoring_model == "round":
            best_of = periods.get("best_of")
            if not (is_strict_int(best_of) and best_of >= 1 and best_of % 2 == 1):
                mark_invalid("periods")
            else:
                normalized_periods = {
                    "best_of": best_of,
                }
        else:
            # scoring_model was missing or invalid
            mark_invalid("periods")

    # 5. scoring_events: required object with >= 1 key, key ^[a-z0-9_]{1,40}$
    scoring_events = data.get("scoring_events")
    normalized_scoring_events: dict[str, Any] = {}
    if not isinstance(scoring_events, dict) or len(scoring_events) < 1:
        mark_invalid("scoring_events")
    else:
        scoring_events_valid = True
        for event_name, event_def in scoring_events.items():
            if not (
                is_strict_str(event_name)
                and bool(SCORING_EVENT_KEY_REGEX.fullmatch(event_name))
            ):
                scoring_events_valid = False
                break
            if not isinstance(event_def, dict):
                scoring_events_valid = False
                break

            if scoring_model == "event":
                points = event_def.get("points")
                if not (is_strict_int(points) and points >= 1):
                    scoring_events_valid = False
                    break
                normalized_scoring_events[event_name] = {"points": points}

            elif scoring_model == "innings":
                runs = event_def.get("runs")
                legal_ball = event_def.get("legal_ball")
                wicket = event_def.get("wicket")
                if not (
                    is_strict_int(runs)
                    and runs >= 0
                    and is_strict_bool(legal_ball)
                    and is_strict_bool(wicket)
                ):
                    scoring_events_valid = False
                    break
                normalized_scoring_events[event_name] = {
                    "runs": runs,
                    "legal_ball": legal_ball,
                    "wicket": wicket,
                }

            elif scoring_model == "round":
                rounds = event_def.get("rounds")
                if not (is_strict_int(rounds) and rounds >= 1):
                    scoring_events_valid = False
                    break
                normalized_scoring_events[event_name] = {"rounds": rounds}

            else:
                scoring_events_valid = False
                break

        if not scoring_events_valid:
            mark_invalid("scoring_events")

    # 6. draw_allowed: required boolean
    draw_allowed = data.get("draw_allowed")
    if not is_strict_bool(draw_allowed):
        mark_invalid("draw_allowed")

    # 7. overtime: required object { policy, optional duration_minutes }
    overtime = data.get("overtime")
    normalized_overtime: dict[str, Any] = {}
    if not isinstance(overtime, dict):
        mark_invalid("overtime")
    else:
        policy = overtime.get("policy")
        if not (is_strict_str(policy) and policy in VALID_OVERTIME_POLICIES):
            mark_invalid("overtime")
        else:
            normalized_overtime["policy"] = policy
            if "duration_minutes" in overtime:
                dm = overtime["duration_minutes"]
                if not (is_strict_int(dm) and dm >= 0):
                    mark_invalid("overtime")
                else:
                    normalized_overtime["duration_minutes"] = dm

    # 8. tie_break_order: optional array of unique items; default = full list
    normalized_tie_break_order: list[str] = list(DEFAULT_TIE_BREAK_ORDER)
    if "tie_break_order" in data and data["tie_break_order"] is not None:
        tbo = data["tie_break_order"]
        if not isinstance(tbo, list):
            mark_invalid("tie_break_order")
        else:
            tbo_valid = True
            seen_tbo: set[str] = set()
            for item in tbo:
                if not (is_strict_str(item) and item in ALLOWED_TIE_BREAK_SET):
                    tbo_valid = False
                    break
                if item in seen_tbo:
                    tbo_valid = False
                    break
                seen_tbo.add(item)
            if not tbo_valid:
                mark_invalid("tie_break_order")
            else:
                normalized_tie_break_order = list(tbo)
    else:
        normalized_tie_break_order = list(DEFAULT_TIE_BREAK_ORDER)

    # 9. roster: required object { min_squad_size, max_squad_size, required_positions }
    roster = data.get("roster")
    normalized_roster: dict[str, Any] = {}
    if not isinstance(roster, dict):
        mark_invalid("roster")
    else:
        min_squad_size = roster.get("min_squad_size")
        max_squad_size = roster.get("max_squad_size")
        req_positions = roster.get("required_positions")

        roster_valid = True
        if not (is_strict_int(min_squad_size) and min_squad_size >= 1):
            roster_valid = False
        if not (is_strict_int(max_squad_size) and max_squad_size >= 1):
            roster_valid = False
        if roster_valid and min_squad_size > max_squad_size:
            roster_valid = False

        if not isinstance(req_positions, dict):
            roster_valid = False
        else:
            norm_positions: dict[str, int] = {}
            for pos_name, min_cnt in req_positions.items():
                if not (
                    is_strict_str(pos_name)
                    and len(pos_name) >= 1
                    and is_strict_int(min_cnt)
                    and min_cnt >= 0
                ):
                    roster_valid = False
                    break
                norm_positions[pos_name] = min_cnt

        if not roster_valid:
            mark_invalid("roster")
        else:
            normalized_roster = {
                "min_squad_size": min_squad_size,
                "max_squad_size": max_squad_size,
                "required_positions": norm_positions,
            }

    # Raise on any problem
    if bad_fields:
        raise validation_error(bad_fields)

    # Return complete normalized configuration
    return {
        "sport_id": sport_id,
        "name": name,
        "scoring_model": scoring_model,
        "periods": normalized_periods,
        "scoring_events": normalized_scoring_events,
        "draw_allowed": draw_allowed,
        "overtime": normalized_overtime,
        "tie_break_order": normalized_tie_break_order,
        "roster": normalized_roster,
    }


# ---------------------------------------------------------------------------
# Service Actions
# ---------------------------------------------------------------------------


def create_sport(session: Session, payload: Any) -> dict[str, Any]:
    """Validate, persist, and return a newly registered sport (PDF §5.6).

    Order of checks:
      1. Schema 400 VALIDATION_ERROR first (with details.fields).
      2. Duplicate sport_id check -> 409 SPORT_EXISTS (details {"sport_id": ...}).
      3. Persist to `sports` table (is_seeded=False).
      4. Return 201 created response.
    """
    # 1. Validate schema manually
    config = validate_and_normalize_sport(payload)
    sport_id: str = config["sport_id"]

    # 2. Check for duplicate sport_id
    repo = SportConfigRepository(session)
    if repo.exists(sport_id):
        raise ApiError(
            status_code=409,
            code="SPORT_EXISTS",
            message=f"Sport '{sport_id}' already exists.",
            details={"sport_id": sport_id},
        )

    # 3. Store in sports (is_seeded false)
    sport = Sport(
        sport_id=sport_id,
        name=config["name"],
        scoring_model=config["scoring_model"],
        config=config,
        is_seeded=False,
    )
    session.add(sport)
    session.commit()
    session.refresh(sport)

    # 4. Return 201 response payload
    return {
        "sport_id": sport_id,
        "status": "created",
        "config": config,
    }


def get_sport_config(session: Session, sport_id: str) -> dict[str, Any] | None:
    """Retrieve sport configuration dict by sport_id, or None if not found."""
    return SportConfigRepository(session).get(sport_id)


def require_sport_config(session: Session, sport_id: str) -> dict[str, Any]:
    """Retrieve sport configuration dict, or raise 404 SPORT_NOT_FOUND if missing."""
    cfg = get_sport_config(session, sport_id)
    if cfg is None:
        raise ApiError(
            status_code=404,
            code="SPORT_NOT_FOUND",
            message=f"Sport '{sport_id}' not found.",
            details={"sport_id": sport_id},
        )
    return cfg
