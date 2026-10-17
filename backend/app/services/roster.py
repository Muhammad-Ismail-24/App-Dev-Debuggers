"""Roster management service — NaSCon '26 Platform (PDF §5.11).

Public surface
--------------
roster_service          : module-level RosterService singleton
RosterService.transfer  : validate + apply a transfer/loan/release; raises ApiError;
                          does NOT commit (caller or offline-sync can wrap in savepoint).

Standalone helpers (also used by offline-sync)
----------------------------------------------
apply_due_loan_returns  : auto-return expired loans; idempotent; never duplicates the entry
get_squad_count         : live count for a squad (loan-counting rules apply)
get_audit_count         : total audit entries for a player (version for offline-sync)
setup_roster            : configure / fully replace a league's roster state
get_player_history      : history response dict for GET history endpoint

All rules are pure, unit-testable functions; HTTP handlers are thin plain `def`.
No sport-name or position-name hard-coding anywhere in logic.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, validation_error
from app.db.models import (
    RosterAuditEntry,
    RosterLeague,
    RosterMatchInProgress,
    RosterPlayer,
    RosterRegistration,
    RosterRequest,
    RosterSquad,
    Sport,
)
from app.workers.publisher import publish_domain_event

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_VALID_ROLES: frozenset[str] = frozenset({"captain", "vice_captain", "starter", "substitute"})
_VALID_ACTIONS: frozenset[str] = frozenset({"transfer", "loan", "release"})
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")


# ---------------------------------------------------------------------------
# Small pure helpers
# ---------------------------------------------------------------------------


def _is_valid_id(v: Any) -> bool:
    return isinstance(v, str) and bool(_ID_RE.fullmatch(v))


def _is_valid_date_str(v: Any) -> bool:
    if not isinstance(v, str) or not _DATE_RE.fullmatch(v):
        return False
    try:
        date.fromisoformat(v)
        return True
    except ValueError:
        return False


def _parse_date(s: str) -> date:
    return date.fromisoformat(s)


def _server_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _fmt_audit_id(n: int) -> str:
    """Format a per-league sequential audit counter as 'au-NNNN'."""
    return f"au-{n:04d}"


# ---------------------------------------------------------------------------
# Helpers: squad count / audit count
# ---------------------------------------------------------------------------


def get_squad_count(session: Session, league_id: str, squad_id: str) -> int:
    """Return the number of players whose *current* squad in the league is squad_id.

    Rules (PDF §5.11):
    - A loaned-in player counts for the BORROWER (their current squad_id field).
    - A released player (squad_id IS NULL) counts nowhere.
    Simply count roster_registrations WHERE league_id=? AND squad_id=?.
    """
    result = session.execute(
        select(func.count())
        .select_from(RosterRegistration)
        .where(
            RosterRegistration.league_id == league_id,
            RosterRegistration.squad_id == squad_id,
        )
    ).scalar()
    return result or 0


def get_audit_count(session: Session, player_id: str) -> int:
    """Return total audit entries for *player_id* (used as version by offline-sync)."""
    result = session.execute(
        select(func.count())
        .select_from(RosterAuditEntry)
        .where(RosterAuditEntry.player_id == player_id)
    ).scalar()
    return result or 0


# ---------------------------------------------------------------------------
# Audit ID counter (per-league, restarts on setup)
# ---------------------------------------------------------------------------


def _next_audit_id(session: Session, league_id: str) -> str:
    """Return the next formatted audit_id for the league.

    Counts existing entries for this league to derive the next sequence number.
    This count is correct inside a transaction because new entries are flushed
    before _next_audit_id is called again.
    """
    current_count = session.execute(
        select(func.count())
        .select_from(RosterAuditEntry)
        .where(RosterAuditEntry.league_id == league_id)
    ).scalar() or 0
    return _fmt_audit_id(current_count + 1)


# ---------------------------------------------------------------------------
# Loan auto-return
# ---------------------------------------------------------------------------


def apply_due_loan_returns(
    session: Session,
    player_id: str,
    as_of_date: date,
) -> None:
    """Write exactly ONE 'loan_return' audit entry if the loan has expired by *as_of_date*.

    A loan lasts from effective_date through loan_end_date INCLUSIVE.
    Return condition: as_of_date >= loan_end_date + 1 day.

    Locking: SELECT … FOR UPDATE on the registration row prevents duplicate writes
    under concurrent requests for the same player.  Never commits — caller holds
    the transaction.
    """
    # Lock the registration row for this player
    reg = session.execute(
        select(RosterRegistration)
        .where(RosterRegistration.player_id == player_id)
        .with_for_update()
    ).scalar_one_or_none()

    if reg is None:
        return
    if reg.registration_type != "loan" or reg.loan_end_date is None:
        return

    # Loan return date = day after loan_end_date
    return_date: date = reg.loan_end_date + timedelta(days=1)
    if as_of_date < return_date:
        return  # loan still active

    # Idempotency: check if the loan_return entry already exists for this return_date
    existing = session.execute(
        select(RosterAuditEntry).where(
            RosterAuditEntry.player_id == player_id,
            RosterAuditEntry.action == "loan_return",
            RosterAuditEntry.effective_date == return_date,
        )
    ).scalar_one_or_none()
    if existing is not None:
        return  # already written; don't duplicate

    borrower_id = reg.squad_id
    lender_id = reg.parent_squad_id
    audit_id = _next_audit_id(session, reg.league_id)
    now = _server_utc_now()

    entry = RosterAuditEntry(
        audit_id=audit_id,
        player_id=player_id,
        league_id=reg.league_id,
        action="loan_return",
        from_squad_id=borrower_id,
        to_squad_id=lender_id,
        effective_date=return_date,
        state="active",
        who="system",
        when_ts=now,
        why="Loan ended; automatic return",
        request_id=None,
        blocking_match_id=None,
    )
    session.add(entry)

    # Update registration back to lender
    reg.squad_id = lender_id
    reg.parent_squad_id = None
    reg.registration_type = "initial"
    reg.role = "substitute"
    reg.start_date = return_date
    reg.loan_end_date = None
    reg.state = "active"


# ---------------------------------------------------------------------------
# Setup validation
# ---------------------------------------------------------------------------


def _validate_setup_body(data: Any) -> None:
    """Validate the POST /audit/v1/roster/setup body strictly.

    Raises 400 VALIDATION_ERROR (details.fields) on any failure.
    Collects ALL bad field paths before raising so the caller sees them all.
    """
    if not isinstance(data, dict):
        raise validation_error(["body"], message="Request body must be a JSON object.")

    bad: list[str] = []

    def mark(f: str) -> None:
        if f not in bad:
            bad.append(f)

    # ---- league sub-object ----
    league = data.get("league")
    if not isinstance(league, dict):
        bad.append("league")
        raise validation_error(bad)  # can't proceed without league

    if not _is_valid_id(league.get("league_id")):
        mark("league.league_id")
    if not _is_valid_id(league.get("tenant_id")):
        mark("league.tenant_id")
    if not _is_valid_id(league.get("sport_id")):
        mark("league.sport_id")

    tw = league.get("transfer_window")
    window_open: date | None = None
    window_close: date | None = None
    if not isinstance(tw, dict):
        mark("league.transfer_window")
    else:
        if not _is_valid_date_str(tw.get("open")):
            mark("league.transfer_window.open")
        else:
            window_open = _parse_date(tw["open"])

        if not _is_valid_date_str(tw.get("close")):
            mark("league.transfer_window.close")
        else:
            window_close = _parse_date(tw["close"])

        if window_open and window_close and window_close < window_open:
            mark("league.transfer_window.close")

    msz = league.get("max_squad_size")
    if msz is not None:
        if not (isinstance(msz, int) and not isinstance(msz, bool) and msz > 0):
            mark("league.max_squad_size")

    rp = league.get("required_positions")
    if rp is not None:
        if not isinstance(rp, dict):
            mark("league.required_positions")
        else:
            for k, v in rp.items():
                if not (
                    isinstance(k, str)
                    and isinstance(v, int)
                    and not isinstance(v, bool)
                    and v >= 0
                ):
                    mark("league.required_positions")
                    break

    # ---- squads list ----
    squads_raw = data.get("squads")
    valid_squad_ids: set[str] = set()
    if not isinstance(squads_raw, list) or len(squads_raw) == 0:
        mark("squads")
    else:
        seen_sq: set[str] = set()
        for i, sq in enumerate(squads_raw):
            if not isinstance(sq, dict):
                mark("squads")
                break
            sq_id = sq.get("squad_id")
            if not _is_valid_id(sq_id):
                mark(f"squads[{i}].squad_id")
            elif sq_id in seen_sq:
                mark(f"squads[{i}].squad_id")
            else:
                seen_sq.add(sq_id)
                valid_squad_ids.add(sq_id)
            if not _is_valid_id(sq.get("club_id")):
                mark(f"squads[{i}].club_id")
            if not _is_valid_id(sq.get("tenant_id")):
                mark(f"squads[{i}].tenant_id")
            nm = sq.get("name")
            if not (isinstance(nm, str) and nm.strip()):
                mark(f"squads[{i}].name")

    # ---- players list ----
    players_raw = data.get("players")
    if not isinstance(players_raw, list) or len(players_raw) == 0:
        mark("players")
    else:
        seen_pl: set[str] = set()
        for i, pl in enumerate(players_raw):
            if not isinstance(pl, dict):
                mark("players")
                break
            pl_id = pl.get("player_id")
            if not _is_valid_id(pl_id):
                mark(f"players[{i}].player_id")
            elif pl_id in seen_pl:
                mark(f"players[{i}].player_id")
            else:
                seen_pl.add(pl_id)
            nm = pl.get("name")
            if not (isinstance(nm, str) and nm.strip()):
                mark(f"players[{i}].name")
            pos = pl.get("position")
            if not (isinstance(pos, str) and pos.strip()):
                mark(f"players[{i}].position")
            pl_sq = pl.get("squad_id")
            if not _is_valid_id(pl_sq) or (valid_squad_ids and pl_sq not in valid_squad_ids):
                mark(f"players[{i}].squad_id")
            if pl.get("role") not in _VALID_ROLES:
                mark(f"players[{i}].role")

    # ---- matches_in_progress (optional) ----
    mip_raw = data.get("matches_in_progress")
    if mip_raw is not None:
        if not isinstance(mip_raw, list):
            mark("matches_in_progress")
        else:
            seen_mip: set[str] = set()
            for i, m in enumerate(mip_raw):
                if not isinstance(m, dict):
                    mark(f"matches_in_progress[{i}]")
                    break
                m_id = m.get("match_id")
                if not _is_valid_id(m_id):
                    mark(f"matches_in_progress[{i}].match_id")
                elif m_id in seen_mip:
                    mark(f"matches_in_progress[{i}].match_id")
                else:
                    seen_mip.add(m_id)
                if not _is_valid_id(m.get("home_squad_id")):
                    mark(f"matches_in_progress[{i}].home_squad_id")
                if not _is_valid_id(m.get("away_squad_id")):
                    mark(f"matches_in_progress[{i}].away_squad_id")

    if bad:
        raise validation_error(bad)


def _get_sport_roster_defaults(sport: Sport) -> tuple[int, dict[str, int]]:
    """Extract default max_squad_size and required_positions from a Sport's config JSONB."""
    cfg: dict = sport.config if isinstance(sport.config, dict) else {}
    roster_cfg: dict = cfg.get("roster", {}) if isinstance(cfg.get("roster"), dict) else {}

    max_sq = roster_cfg.get("max_squad_size", 25)
    if not (isinstance(max_sq, int) and not isinstance(max_sq, bool) and max_sq > 0):
        max_sq = 25

    req_pos: dict = roster_cfg.get("required_positions", {})
    if not isinstance(req_pos, dict):
        req_pos = {}
    req_pos = {
        k: v
        for k, v in req_pos.items()
        if isinstance(k, str)
        and isinstance(v, int)
        and not isinstance(v, bool)
        and v >= 0
    }
    return max_sq, req_pos


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


def setup_roster(session: Session, payload: Any) -> dict[str, Any]:
    """POST /audit/v1/roster/setup — validate, then atomically replace roster state.

    Validation order:
      1. Schema/dates → 400 VALIDATION_ERROR
      2. Sport exists → 404 SPORT_NOT_FOUND

    Then: in ONE transaction, delete all old state for this league_id, re-insert
    everything from the payload, and give each player an initial registration
    in their declared squad.  The per-league audit counter restarts from 1.

    Returns the 201 body dict.  Caller commits.
    """
    # 1. Schema validation
    _validate_setup_body(payload)

    league_data: dict = payload["league"]
    league_id: str = league_data["league_id"]
    tenant_id: str = league_data["tenant_id"]
    sport_id: str = league_data["sport_id"]
    tw = league_data["transfer_window"]
    window_open: date = _parse_date(tw["open"])
    window_close: date = _parse_date(tw["close"])

    squads_raw: list[dict] = payload["squads"]
    players_raw: list[dict] = payload["players"]
    mip_raw: list[dict] = payload.get("matches_in_progress") or []

    # 2. Sport existence
    sport = session.execute(
        select(Sport).where(Sport.sport_id == sport_id)
    ).scalar_one_or_none()
    if sport is None:
        raise ApiError(
            status_code=404,
            code="SPORT_NOT_FOUND",
            message=f"Sport '{sport_id}' not found.",
            details={"sport_id": sport_id},
        )

    # Resolve max_squad_size and required_positions
    default_max, default_req = _get_sport_roster_defaults(sport)
    msz_raw = league_data.get("max_squad_size")
    max_squad_size: int = (
        msz_raw
        if (isinstance(msz_raw, int) and not isinstance(msz_raw, bool) and msz_raw > 0)
        else default_max
    )
    rp_raw = league_data.get("required_positions")
    required_positions: dict[str, int] = (
        {
            k: v
            for k, v in rp_raw.items()
            if isinstance(k, str)
            and isinstance(v, int)
            and not isinstance(v, bool)
        }
        if isinstance(rp_raw, dict)
        else default_req
    )

    # ---- Wipe existing state for this league (FK-safe deletion order) ----
    # 1. Audit entries (references roster_leagues via league_id column, no FK constraint)
    #    But first delete RosterRequests whose request_id appears in audit entries
    #    for this league, to keep the idempotency table clean.
    linked_req_ids = session.execute(
        select(RosterAuditEntry.request_id)
        .where(
            RosterAuditEntry.league_id == league_id,
            RosterAuditEntry.request_id.isnot(None),
        )
    ).scalars().all()
    if linked_req_ids:
        session.query(RosterRequest).filter(
            RosterRequest.request_id.in_(linked_req_ids)
        ).delete(synchronize_session=False)

    session.query(RosterAuditEntry).filter(
        RosterAuditEntry.league_id == league_id
    ).delete(synchronize_session=False)

    session.query(RosterMatchInProgress).filter(
        RosterMatchInProgress.league_id == league_id
    ).delete(synchronize_session=False)

    session.query(RosterRegistration).filter(
        RosterRegistration.league_id == league_id
    ).delete(synchronize_session=False)

    session.query(RosterPlayer).filter(
        RosterPlayer.league_id == league_id
    ).delete(synchronize_session=False)

    session.query(RosterSquad).filter(
        RosterSquad.league_id == league_id
    ).delete(synchronize_session=False)

    session.query(RosterLeague).filter(
        RosterLeague.league_id == league_id
    ).delete(synchronize_session=False)

    # ---- Insert new league config ----
    rl = RosterLeague(
        league_id=league_id,
        tenant_id=tenant_id,
        sport_id=sport_id,
        window_open=window_open,
        window_close=window_close,
        max_squad_size=max_squad_size,
        required_positions=required_positions,
    )
    session.add(rl)
    session.flush()

    # ---- Insert squads ----
    for sq in squads_raw:
        session.add(
            RosterSquad(
                squad_id=sq["squad_id"],
                league_id=league_id,
                club_id=sq["club_id"],
                tenant_id=sq["tenant_id"],
                name=sq["name"],
            )
        )
    session.flush()

    # ---- Insert players + initial registrations ----
    today: date = _server_utc_now().date()
    squad_counts: dict[str, int] = {sq["squad_id"]: 0 for sq in squads_raw}

    for pl in players_raw:
        session.add(
            RosterPlayer(
                player_id=pl["player_id"],
                league_id=league_id,
                name=pl["name"],
                position=pl["position"],
            )
        )
        sq_id: str = pl["squad_id"]
        session.add(
            RosterRegistration(
                player_id=pl["player_id"],
                league_id=league_id,
                squad_id=sq_id,
                parent_squad_id=None,
                registration_type="initial",
                start_date=today,
                loan_end_date=None,
                role=pl["role"],
                state="active",
            )
        )
        squad_counts[sq_id] = squad_counts.get(sq_id, 0) + 1

    # ---- Insert matches in progress ----
    for m in mip_raw:
        session.add(
            RosterMatchInProgress(
                league_id=league_id,
                match_id=m["match_id"],
                home_squad_id=m["home_squad_id"],
                away_squad_id=m["away_squad_id"],
            )
        )

    session.flush()

    # All squads (including those with 0 players) appear in squad_counts
    response_counts: dict[str, int] = {
        sq["squad_id"]: squad_counts.get(sq["squad_id"], 0)
        for sq in squads_raw
    }
    return {
        "league_id": league_id,
        "status": "configured",
        "squad_counts": response_counts,
    }


# ---------------------------------------------------------------------------
# Transfer validation helpers
# ---------------------------------------------------------------------------


def _validate_transfer_body(data: Any) -> dict[str, Any]:
    """Validate POST /audit/v1/roster/transfer body strictly (Rule 1).

    Returns a normalised dict on success; raises 400 VALIDATION_ERROR on failure.
    """
    if not isinstance(data, dict):
        raise validation_error(["body"], message="Request body must be a JSON object.")

    bad: list[str] = []

    def mark(f: str) -> None:
        if f not in bad:
            bad.append(f)

    request_id = data.get("request_id")
    if not _is_valid_id(request_id):
        mark("request_id")

    league_id = data.get("league_id")
    if not _is_valid_id(league_id):
        mark("league_id")

    player_id = data.get("player_id")
    if not _is_valid_id(player_id):
        mark("player_id")

    action_type = data.get("type")
    if action_type not in _VALID_ACTIONS:
        mark("type")

    from_squad_id = data.get("from_squad_id")
    if not _is_valid_id(from_squad_id):
        mark("from_squad_id")

    to_squad_id = data.get("to_squad_id")
    is_release = action_type == "release"
    if is_release:
        # to_squad_id must be absent or explicitly null
        if to_squad_id is not None:
            mark("to_squad_id")
    else:
        # transfer / loan: to_squad_id is required
        if not _is_valid_id(to_squad_id):
            mark("to_squad_id")

    effective_date_str = data.get("effective_date")
    effective_date: date | None = None
    if not _is_valid_date_str(effective_date_str):
        mark("effective_date")
    else:
        effective_date = _parse_date(effective_date_str)

    loan_end_date_str = data.get("loan_end_date")
    loan_end_date: date | None = None
    is_loan = action_type == "loan"
    if is_loan:
        if not _is_valid_date_str(loan_end_date_str):
            mark("loan_end_date")
        else:
            loan_end_date = _parse_date(loan_end_date_str)
            if effective_date is not None and loan_end_date <= effective_date:
                mark("loan_end_date")
    else:
        # non-loan: loan_end_date must be absent or null
        if loan_end_date_str is not None:
            mark("loan_end_date")

    reason = data.get("reason")
    if not (isinstance(reason, str) and reason.strip()):
        mark("reason")

    requested_by = data.get("requested_by")
    if not _is_valid_id(requested_by):
        mark("requested_by")

    if bad:
        raise validation_error(bad)

    return {
        "request_id": request_id,
        "league_id": league_id,
        "player_id": player_id,
        "type": action_type,
        "from_squad_id": from_squad_id,
        "to_squad_id": to_squad_id,
        "effective_date": effective_date,
        "loan_end_date": loan_end_date,
        "reason": reason,
        "requested_by": requested_by,
    }


# ---------------------------------------------------------------------------
# Wire serialisation helpers
# ---------------------------------------------------------------------------


def _audit_entry_to_dict(entry: RosterAuditEntry) -> dict[str, Any]:
    """Serialise a RosterAuditEntry to the exact wire format.

    DB column `when_ts` is exposed on the wire as `when` (PDF §5.11).
    """
    return {
        "audit_id": entry.audit_id,
        "action": entry.action,
        "player_id": entry.player_id,
        "league_id": entry.league_id,
        "from_squad_id": entry.from_squad_id,
        "to_squad_id": entry.to_squad_id,
        "effective_date": entry.effective_date.isoformat() if entry.effective_date else None,
        "state": entry.state,
        "who": entry.who,
        "when": (
            entry.when_ts.strftime("%Y-%m-%dT%H:%M:%SZ")
            if entry.when_ts
            else None
        ),
        "why": entry.why,
    }


def _registration_to_dict(reg: RosterRegistration) -> dict[str, Any]:
    """Serialise a RosterRegistration to the wire format."""
    return {
        "player_id": reg.player_id,
        "league_id": reg.league_id,
        "squad_id": reg.squad_id,
        "parent_squad_id": reg.parent_squad_id,
        "registration_type": reg.registration_type,
        "start_date": reg.start_date.isoformat() if reg.start_date else None,
        "loan_end_date": reg.loan_end_date.isoformat() if reg.loan_end_date else None,
        "role": reg.role,
    }


# ---------------------------------------------------------------------------
# RosterService
# ---------------------------------------------------------------------------


class RosterService:
    """Business logic for roster operations (PDF §5.11).

    `transfer` does NOT commit — the caller commits so that offline-sync can
    wrap this call in a savepoint and roll back per-action without losing the
    outer transaction.
    """

    def transfer(self, session: Session, request: dict) -> tuple[int, dict]:
        """Validate and apply a roster transfer / loan / release.

        Returns (http_status_code, response_body_dict).
        Raises ApiError on any business-rule violation.
        Does NOT commit the session.

        Validation order (PDF §5.11 Part B — first failure wins):
          1. Schema/dates          → 400 VALIDATION_ERROR
          2. Existence             → 404 {LEAGUE,PLAYER,SQUAD}_NOT_FOUND
          3. Cross-tenant          → 409 CROSS_TENANT_TRANSFER
          4. Player in from_squad  → 409 NOT_IN_SQUAD
          5. Transfer window       → 409 TRANSFER_WINDOW_CLOSED  (release exempt)
          6. Not on loan           → 409 PLAYER_ON_LOAN
          7. Squad capacity        → 409 SQUAD_FULL
          8. Min-position on src   → 409 MIN_POSITION_VIOLATION

        Idempotency: identical request_id+body → 200 with stored response;
                     same request_id, different body → 409 DUPLICATE_REQUEST_ID.
        """
        # ── Rule 1: schema ────────────────────────────────────────────────
        norm = _validate_transfer_body(request)

        request_id: str = norm["request_id"]
        league_id: str = norm["league_id"]
        player_id: str = norm["player_id"]
        action_type: str = norm["type"]
        from_squad_id: str = norm["from_squad_id"]
        to_squad_id: str | None = norm["to_squad_id"]
        effective_date: date = norm["effective_date"]
        loan_end_date: date | None = norm["loan_end_date"]
        reason: str = norm["reason"]
        requested_by: str = norm["requested_by"]

        # ── Idempotency check (before any row locks) ───────────────────────
        existing_req = session.execute(
            select(RosterRequest).where(RosterRequest.request_id == request_id)
        ).scalar_one_or_none()

        if existing_req is not None:
            if existing_req.request_body != request:
                raise ApiError(
                    status_code=409,
                    code="DUPLICATE_REQUEST_ID",
                    message=f"request_id '{request_id}' was already used with a different body.",
                    details={"request_id": request_id},
                )
            # Identical replay → return stored response
            return existing_req.status_code, existing_req.response

        # ── Rule 2: existence ─────────────────────────────────────────────
        rl = session.execute(
            select(RosterLeague).where(RosterLeague.league_id == league_id)
        ).scalar_one_or_none()
        if rl is None:
            raise ApiError(
                status_code=404,
                code="LEAGUE_NOT_FOUND",
                message=f"Roster league '{league_id}' not found.",
                details={"league_id": league_id},
            )

        player = session.execute(
            select(RosterPlayer).where(
                RosterPlayer.player_id == player_id,
                RosterPlayer.league_id == league_id,
            )
        ).scalar_one_or_none()
        if player is None:
            raise ApiError(
                status_code=404,
                code="PLAYER_NOT_FOUND",
                message=f"Player '{player_id}' not found in league '{league_id}'.",
                details={"player_id": player_id},
            )

        from_squad = session.execute(
            select(RosterSquad).where(
                RosterSquad.squad_id == from_squad_id,
                RosterSquad.league_id == league_id,
            )
        ).scalar_one_or_none()
        if from_squad is None:
            raise ApiError(
                status_code=404,
                code="SQUAD_NOT_FOUND",
                message=f"Squad '{from_squad_id}' not found in league '{league_id}'.",
                details={"squad_id": from_squad_id},
            )

        to_squad: RosterSquad | None = None
        if to_squad_id is not None:
            to_squad = session.execute(
                select(RosterSquad).where(
                    RosterSquad.squad_id == to_squad_id,
                    RosterSquad.league_id == league_id,
                )
            ).scalar_one_or_none()
            if to_squad is None:
                raise ApiError(
                    status_code=404,
                    code="SQUAD_NOT_FOUND",
                    message=f"Squad '{to_squad_id}' not found in league '{league_id}'.",
                    details={"squad_id": to_squad_id},
                )

        # ── Rule 3: cross-tenant ──────────────────────────────────────────
        league_tenant: str = rl.tenant_id
        if from_squad.tenant_id != league_tenant:
            raise ApiError(
                status_code=409,
                code="CROSS_TENANT_TRANSFER",
                message="Transfer crosses tenant boundaries (from_squad).",
                details={"from_squad_id": from_squad_id, "league_tenant_id": league_tenant},
            )
        if to_squad is not None and to_squad.tenant_id != league_tenant:
            raise ApiError(
                status_code=409,
                code="CROSS_TENANT_TRANSFER",
                message="Transfer crosses tenant boundaries (to_squad).",
                details={"to_squad_id": to_squad_id, "league_tenant_id": league_tenant},
            )

        # ── Rule 4: player must be in from_squad (lock row) ───────────────
        reg = session.execute(
            select(RosterRegistration)
            .where(RosterRegistration.player_id == player_id)
            .with_for_update()
        ).scalar_one_or_none()

        if reg is None or reg.squad_id != from_squad_id:
            raise ApiError(
                status_code=409,
                code="NOT_IN_SQUAD",
                message=f"Player '{player_id}' is not currently in squad '{from_squad_id}'.",
                details={"player_id": player_id, "from_squad_id": from_squad_id},
            )

        # ── Rule 5: transfer window (release is always allowed) ───────────
        if action_type != "release":
            if not (rl.window_open <= effective_date <= rl.window_close):
                raise ApiError(
                    status_code=409,
                    code="TRANSFER_WINDOW_CLOSED",
                    message="The transfer window is not open on the requested effective date.",
                    details={
                        "effective_date": effective_date.isoformat(),
                        "window_open": rl.window_open.isoformat(),
                        "window_close": rl.window_close.isoformat(),
                    },
                )

        # ── Rule 6: not on loan — first auto-return any expired loan ──────
        apply_due_loan_returns(session, player_id, effective_date)
        session.flush()
        # Re-fetch with lock after possible mutation
        reg = session.execute(
            select(RosterRegistration)
            .where(RosterRegistration.player_id == player_id)
            .with_for_update()
        ).scalar_one_or_none()

        if reg is not None and reg.registration_type == "loan":
            raise ApiError(
                status_code=409,
                code="PLAYER_ON_LOAN",
                message=f"Player '{player_id}' is currently on loan and cannot be moved.",
                details={"player_id": player_id},
            )

        # ── Rule 7: destination squad capacity (transfer/loan only) ───────
        if action_type != "release" and to_squad_id is not None:
            dest_count = get_squad_count(session, league_id, to_squad_id)
            if dest_count + 1 > rl.max_squad_size:
                raise ApiError(
                    status_code=409,
                    code="SQUAD_FULL",
                    message=(
                        f"Squad '{to_squad_id}' is at maximum capacity "
                        f"({rl.max_squad_size})."
                    ),
                    details={"squad_id": to_squad_id, "max_squad_size": rl.max_squad_size},
                )

        # ── Rule 8: minimum position on source squad ───────────────────────
        if action_type != "release":
            req_positions: dict = (
                rl.required_positions
                if isinstance(rl.required_positions, dict)
                else {}
            )
            player_position: str = player.position
            required_count: int = req_positions.get(player_position, 0)
            if required_count > 0:
                remaining = session.execute(
                    select(func.count())
                    .select_from(RosterRegistration)
                    .join(
                        RosterPlayer,
                        RosterPlayer.player_id == RosterRegistration.player_id,
                    )
                    .where(
                        RosterRegistration.league_id == league_id,
                        RosterRegistration.squad_id == from_squad_id,
                        RosterPlayer.position == player_position,
                        RosterRegistration.player_id != player_id,
                    )
                ).scalar() or 0
                if remaining < required_count:
                    raise ApiError(
                        status_code=409,
                        code="MIN_POSITION_VIOLATION",
                        message=(
                            f"Moving '{player_id}' would leave squad '{from_squad_id}' "
                            f"with fewer than the required {required_count} player(s) "
                            f"at position '{player_position}'."
                        ),
                        details={
                            "position": player_position,
                            "required": required_count,
                            "remaining_after_move": remaining,
                        },
                    )

        # ── All rules passed: determine deferred vs active ─────────────────
        now: datetime = _server_utc_now()

        # Find first matching in-progress match (by insertion order)
        blocking_match_id: str | None = None
        mip_rows = (
            session.execute(
                select(RosterMatchInProgress)
                .where(RosterMatchInProgress.league_id == league_id)
                .order_by(RosterMatchInProgress.id)
            )
            .scalars()
            .all()
        )
        for mip in mip_rows:
            if mip.home_squad_id == from_squad_id or mip.away_squad_id == from_squad_id:
                blocking_match_id = mip.match_id
                break

        transfer_state: str = (
            "deferred_until_match_end" if blocking_match_id else "active"
        )

        # ── Apply effects ─────────────────────────────────────────────────
        audit_id = _next_audit_id(session, league_id)

        if action_type == "transfer":
            reg.squad_id = to_squad_id
            reg.parent_squad_id = None
            reg.registration_type = "transfer"
            reg.start_date = effective_date
            reg.loan_end_date = None
            reg.role = "substitute"
            reg.state = transfer_state

        elif action_type == "loan":
            reg.squad_id = to_squad_id
            reg.parent_squad_id = from_squad_id
            reg.registration_type = "loan"
            reg.start_date = effective_date
            reg.loan_end_date = loan_end_date
            reg.role = "substitute"
            reg.state = transfer_state

        elif action_type == "release":
            reg.squad_id = None
            reg.parent_squad_id = None
            reg.registration_type = "release"
            reg.start_date = effective_date
            reg.loan_end_date = None
            reg.state = transfer_state

        # ── Append immutable audit entry ───────────────────────────────────
        entry = RosterAuditEntry(
            audit_id=audit_id,
            player_id=player_id,
            league_id=league_id,
            action=action_type,
            from_squad_id=from_squad_id,
            to_squad_id=to_squad_id,
            effective_date=effective_date,
            state=transfer_state,
            who=requested_by,
            when_ts=now,
            why=reason,
            request_id=request_id,
            blocking_match_id=blocking_match_id,
        )
        session.add(entry)
        session.flush()

        # ── Publish domain event (same transaction, transactional outbox) ──
        publish_domain_event(
            session,
            "roster.changed",
            {
                "player_id": player_id,
                "league_id": league_id,
                "action": action_type,
            },
        )

        # ── Build response body ────────────────────────────────────────────
        reg_dict: dict[str, Any] | None = (
            None if action_type == "release" else _registration_to_dict(reg)
        )
        audit_dict: dict[str, Any] = _audit_entry_to_dict(entry)

        body: dict[str, Any] = {
            "request_id": request_id,
            "status": "accepted",
            "state": transfer_state,
            "blocking_match_id": blocking_match_id,
            "registration": reg_dict,
            "audit_entry": audit_dict,
        }

        # ── Store for idempotency ──────────────────────────────────────────
        http_status = 201
        session.add(
            RosterRequest(
                request_id=request_id,
                request_body=request,
                status_code=http_status,
                response=body,
            )
        )

        return http_status, body


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


def get_player_history(
    session: Session,
    player_id: str,
    as_of_str: str | None,
) -> dict[str, Any]:
    """GET /audit/v1/roster/history/{player_id}?as_of=YYYY-MM-DD.

    Raises:
      400 VALIDATION_ERROR  — bad as_of format
      404 PLAYER_NOT_FOUND  — unknown player_id
    Returns the history response dict (does not commit).
    """
    # Resolve as_of date
    if as_of_str is None:
        as_of: date = _server_utc_now().date()
    else:
        if not _is_valid_date_str(as_of_str):
            raise validation_error(
                ["as_of"],
                message="Parameter 'as_of' must be a date in YYYY-MM-DD format.",
            )
        as_of = _parse_date(as_of_str)

    # Player must exist (search by player_id across any league)
    player = session.execute(
        select(RosterPlayer).where(RosterPlayer.player_id == player_id)
    ).scalar_one_or_none()
    if player is None:
        raise ApiError(
            status_code=404,
            code="PLAYER_NOT_FOUND",
            message=f"Player '{player_id}' not found.",
            details={"player_id": player_id},
        )

    league_id: str = player.league_id

    # Auto-return any expired loan before computing current state
    apply_due_loan_returns(session, player_id, as_of)
    session.flush()

    # Fetch current registration
    reg = session.execute(
        select(RosterRegistration).where(RosterRegistration.player_id == player_id)
    ).scalar_one_or_none()

    current_squad_id: str | None = reg.squad_id if reg else None
    parent_squad_id: str | None = (
        reg.parent_squad_id
        if (reg is not None and reg.registration_type == "loan")
        else None
    )

    # Fetch full audit history oldest-first
    entries = (
        session.execute(
            select(RosterAuditEntry)
            .where(RosterAuditEntry.player_id == player_id)
            .order_by(RosterAuditEntry.id)
        )
        .scalars()
        .all()
    )

    return {
        "player_id": player_id,
        "as_of": as_of.isoformat(),
        "league_id": league_id,
        "current_squad_id": current_squad_id,
        "parent_squad_id": parent_squad_id,
        "history": [_audit_entry_to_dict(e) for e in entries],
    }


# ---------------------------------------------------------------------------
# Module singleton
# ---------------------------------------------------------------------------

roster_service = RosterService()
