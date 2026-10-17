"""League management service — NaSCon '26 Platform (PDF §5.8).

Pure business logic and manual validation for league registration and fixtures.
Never branches on a specific sport or event name.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ID_PATTERN, ApiError, validation_error
from app.db.models import League, Match, Sport, SystemState
from app.db.repositories import LeagueRepository
from app.services.sports import ALLOWED_TIE_BREAK_SET, DEFAULT_TIE_BREAK_ORDER

# ---------------------------------------------------------------------------
# Strict type-checking helpers (JSON strictness)
# ---------------------------------------------------------------------------


def is_strict_int(val: Any) -> bool:
    """Return True iff val is strictly an int and not a bool."""
    return type(val) is int


def is_strict_str(val: Any) -> bool:
    """Return True iff val is strictly a str."""
    return type(val) is str


def is_valid_id(val: Any) -> bool:
    """Return True iff val is a valid identifier (1-64 chars of [A-Za-z0-9_.:-])."""
    return is_strict_str(val) and bool(ID_PATTERN.fullmatch(val))


# ---------------------------------------------------------------------------
# Manual Validation & Normalization
# ---------------------------------------------------------------------------


def validate_and_normalize_league(data: Any) -> dict[str, Any]:
    """Manually validate league registration payload with strict typing.

    Raises:
        ApiError: 400 VALIDATION_ERROR with offending field names in details.fields.
    """
    if not isinstance(data, dict):
        raise validation_error(["body"], message="Request body must be a JSON object.")

    bad_fields: list[str] = []

    def mark_invalid(field_name: str) -> None:
        if field_name not in bad_fields:
            bad_fields.append(field_name)

    # 1. league_id: required identifier string
    league_id = data.get("league_id")
    if not is_valid_id(league_id):
        mark_invalid("league_id")

    # 2. sport_id: required identifier string
    sport_id = data.get("sport_id")
    if not is_valid_id(sport_id):
        mark_invalid("sport_id")

    # 3. teams: required list of unique identifier strings, count 2-40
    teams = data.get("teams")
    valid_teams_list: list[str] = []
    teams_valid = True
    if not isinstance(teams, list):
        teams_valid = False
    elif not (2 <= len(teams) <= 40):
        teams_valid = False
    else:
        seen_teams: set[str] = set()
        for t in teams:
            if not is_valid_id(t):
                teams_valid = False
                break
            if t in seen_teams:
                teams_valid = False
                break
            seen_teams.add(t)
            valid_teams_list.append(t)

    if not teams_valid:
        mark_invalid("teams")

    valid_teams_set = set(valid_teams_list) if teams_valid else None

    # 4. fixtures: required list of fixture objects
    fixtures = data.get("fixtures")
    normalized_fixtures: list[dict[str, str]] = []
    fixtures_valid = True
    if not isinstance(fixtures, list):
        fixtures_valid = False
    else:
        for f in fixtures:
            if not isinstance(f, dict):
                fixtures_valid = False
                break
            m_id = f.get("match_id")
            home = f.get("home")
            away = f.get("away")
            if not (is_valid_id(m_id) and is_valid_id(home) and is_valid_id(away)):
                fixtures_valid = False
                break
            if home == away:
                fixtures_valid = False
                break
            if valid_teams_set is not None:
                if home not in valid_teams_set or away not in valid_teams_set:
                    fixtures_valid = False
                    break
            normalized_fixtures.append(
                {
                    "match_id": m_id,
                    "home": home,
                    "away": away,
                }
            )

    if not fixtures_valid:
        mark_invalid("fixtures")

    # 5. qualification: required object with spots: int in 1..number of teams
    qualification = data.get("qualification")
    spots_val: int | None = None
    if not isinstance(qualification, dict):
        mark_invalid("qualification.spots")
    else:
        spots = qualification.get("spots")
        if not is_strict_int(spots):
            mark_invalid("qualification.spots")
        else:
            max_spots = (
                len(valid_teams_list)
                if teams_valid
                else (len(teams) if isinstance(teams, list) and len(teams) > 0 else 40)
            )
            if spots < 1 or spots > max_spots:
                mark_invalid("qualification.spots")
            else:
                spots_val = spots

    # 6. points: optional dict with int fields win/draw/loss (defaults: win 3, draw 1, loss 0)
    normalized_points = {"win": 3, "draw": 1, "loss": 0}
    if "points" in data and data["points"] is not None:
        points = data["points"]
        if not isinstance(points, dict):
            mark_invalid("points")
        else:
            pts_valid = True
            for k in ("win", "draw", "loss"):
                if k in points:
                    val = points[k]
                    if not is_strict_int(val):
                        pts_valid = False
                        break
                    normalized_points[k] = val
            if not pts_valid:
                mark_invalid("points")

    # 7. tie_break_order: optional list of unique tokens from ALLOWED_TIE_BREAK_SET
    normalized_tie_break_order: list[str] | None = None
    if "tie_break_order" in data and data["tie_break_order"] is not None:
        tbo = data["tie_break_order"]
        if not isinstance(tbo, list):
            mark_invalid("tie_break_order")
        else:
            tbo_valid = True
            seen_tbo: set[str] = set()
            for token in tbo:
                if not (is_strict_str(token) and token in ALLOWED_TIE_BREAK_SET):
                    tbo_valid = False
                    break
                if token in seen_tbo:
                    tbo_valid = False
                    break
                seen_tbo.add(token)
            if not tbo_valid:
                mark_invalid("tie_break_order")
            else:
                normalized_tie_break_order = list(tbo)

    # 8. lots_seed: optional int
    normalized_lots_seed: int | None = None
    if "lots_seed" in data and data["lots_seed"] is not None:
        ls = data["lots_seed"]
        if not is_strict_int(ls):
            mark_invalid("lots_seed")
        else:
            normalized_lots_seed = ls

    if bad_fields:
        raise validation_error(bad_fields)

    return {
        "league_id": league_id,
        "sport_id": sport_id,
        "teams": valid_teams_list,
        "fixtures": normalized_fixtures,
        "points": normalized_points,
        "tie_break_order": normalized_tie_break_order,
        "qualification_spots": spots_val,
        "lots_seed": normalized_lots_seed,
    }


# ---------------------------------------------------------------------------
# Service Actions
# ---------------------------------------------------------------------------


def create_league(session: Session, payload: Any) -> dict[str, Any]:
    """Register a new league with fixtures and standings configuration (PDF §5.8).

    Validation order (PDF §5.2 / §5.8):
      1. Malformed / schema validation -> 400 VALIDATION_ERROR (details.fields)
      2. Sport missing -> 404 SPORT_NOT_FOUND (details {"sport_id": ...})
      3. Conflict checks:
         - league_id already used -> 409 LEAGUE_EXISTS (details {"league_id": ...})
         - any fixture match_id already used in DB or duplicated inside request -> 409 MATCH_EXISTS (details {"match_id": ...})
         First failing step wins.
      4. Single atomic transaction: insert League and Matches. Each match has status 'upcoming'
         and empty event log.
      5. Response 201: {"league_id": ..., "status": "created", "team_count": ..., "fixture_count": ...}
    """
    # 1. Schema validation (400)
    norm = validate_and_normalize_league(payload)
    league_id: str = norm["league_id"]
    sport_id: str = norm["sport_id"]
    teams: list[str] = norm["teams"]
    fixtures: list[dict[str, str]] = norm["fixtures"]
    points: dict[str, int] = norm["points"]
    tie_break_order: list[str] | None = norm["tie_break_order"]
    qualification_spots: int = norm["qualification_spots"]
    lots_seed: int | None = norm["lots_seed"]

    # 2. Sport missing check (404 SPORT_NOT_FOUND)
    sport_row = session.query(Sport).filter(Sport.sport_id == sport_id).first()
    if sport_row is None:
        raise ApiError(
            status_code=404,
            code="SPORT_NOT_FOUND",
            message=f"Sport '{sport_id}' not found.",
            details={"sport_id": sport_id},
        )

    # 3. Conflict checks
    # 3a. league_id already exists -> 409 LEAGUE_EXISTS
    existing_league = (
        session.query(League.league_id)
        .filter(League.league_id == league_id)
        .first()
    )
    if existing_league is not None:
        raise ApiError(
            status_code=409,
            code="LEAGUE_EXISTS",
            message=f"League '{league_id}' already exists.",
            details={"league_id": league_id},
        )

    # 3b. Fixture match_id duplicate check (in request or already in DB) -> 409 MATCH_EXISTS
    seen_match_ids: set[str] = set()
    for f in fixtures:
        m_id = f["match_id"]
        if m_id in seen_match_ids:
            raise ApiError(
                status_code=409,
                code="MATCH_EXISTS",
                message=f"Match '{m_id}' is duplicated inside the request fixtures.",
                details={"match_id": m_id},
            )
        seen_match_ids.add(m_id)

        existing_match = (
            session.query(Match.match_id)
            .filter(Match.match_id == m_id)
            .first()
        )
        if existing_match is not None:
            raise ApiError(
                status_code=409,
                code="MATCH_EXISTS",
                message=f"Match '{m_id}' already exists.",
                details={"match_id": m_id},
            )

    # Default tie_break_order from sport if not provided in request
    if tie_break_order is None:
        sport_cfg = sport_row.config if isinstance(sport_row.config, dict) else {}
        cfg_tbo = sport_cfg.get("tie_break_order")
        if isinstance(cfg_tbo, list) and len(cfg_tbo) > 0:
            tie_break_order = list(cfg_tbo)
        else:
            tie_break_order = list(DEFAULT_TIE_BREAK_ORDER)

    # Default lots_seed from system_state if not provided in request (fallback 42)
    if lots_seed is None:
        state_row = session.query(SystemState).filter(SystemState.key == "reset_seed").first()
        if not state_row:
            state_row = session.query(SystemState).filter(SystemState.key == "seed").first()
        if state_row and isinstance(state_row.value, int):
            lots_seed = state_row.value
        else:
            lots_seed = 42

    # 4. Insert League and Matches in ONE transaction
    league = League(
        league_id=league_id,
        display_name=None,
        tenant_id=None,
        sport_id=sport_id,
        teams=teams,
        points_win=points["win"],
        points_draw=points["draw"],
        points_loss=points["loss"],
        tie_break_order=tie_break_order,
        qualification_spots=qualification_spots,
        lots_seed=lots_seed,
    )
    session.add(league)

    for f in fixtures:
        match = Match(
            match_id=f["match_id"],
            sport_id=sport_id,
            league_id=league_id,
            home_team_id=f["home"],
            away_team_id=f["away"],
            scheduled_at=None,
        )
        session.add(match)

    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        err_msg = str(exc.orig) if hasattr(exc, "orig") and exc.orig else str(exc)
        err_lower = err_msg.lower()
        if "leagues" in err_lower or "league_id" in err_lower:
            raise ApiError(
                status_code=409,
                code="LEAGUE_EXISTS",
                message=f"League '{league_id}' already exists.",
                details={"league_id": league_id},
            )
        elif "matches" in err_lower or "match_id" in err_lower:
            conflicting_m_id = fixtures[0]["match_id"] if fixtures else ""
            for f in fixtures:
                if f["match_id"] in err_msg:
                    conflicting_m_id = f["match_id"]
                    break
            raise ApiError(
                status_code=409,
                code="MATCH_EXISTS",
                message=f"Match '{conflicting_m_id}' already exists.",
                details={"match_id": conflicting_m_id},
            )
        else:
            if session.query(League.league_id).filter(League.league_id == league_id).first():
                raise ApiError(
                    status_code=409,
                    code="LEAGUE_EXISTS",
                    message=f"League '{league_id}' already exists.",
                    details={"league_id": league_id},
                )
            conflicting_m_id = fixtures[0]["match_id"] if fixtures else ""
            raise ApiError(
                status_code=409,
                code="MATCH_EXISTS",
                message=f"Match '{conflicting_m_id}' already exists.",
                details={"match_id": conflicting_m_id},
            )

    # 5. Return 201 Response
    return {
        "league_id": league_id,
        "status": "created",
        "team_count": len(teams),
        "fixture_count": len(fixtures),
    }


def get_league(session: Session, league_id: str) -> dict[str, Any] | None:
    """Retrieve league configuration dict by league_id, or None if not found."""
    return LeagueRepository(session).get(league_id)


def require_league(session: Session, league_id: str) -> dict[str, Any]:
    """Retrieve league configuration dict, or raise 404 LEAGUE_NOT_FOUND if missing."""
    lg = get_league(session, league_id)
    if lg is None:
        raise ApiError(
            status_code=404,
            code="LEAGUE_NOT_FOUND",
            message=f"League '{league_id}' not found.",
            details={"league_id": league_id},
        )
    return lg
