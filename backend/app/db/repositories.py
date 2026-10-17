"""Shared data-access repository layer — NaSCon '26 Multi-Sport Platform.

Provides pure data-access interfaces for SportConfig, League, MatchEvent, and User.
All repository classes accept a SQLAlchemy `Session` upon initialization and return
plain dictionaries or frozen dataclasses (never ORM entities), isolating callers
(such as Sufiyan's standings/RBAC services and Zaheen's mobile integration) from
SQLAlchemy ORM internals.

Planned Reusable Service Contracts (implemented in subsequent sprint modules):
------------------------------------------------------------------------------
1. `app.services.scoring.get_score_projection(session: Session, match_id: str) -> dict`:
   Recomputes and returns the complete score projection payload matching
   the GET /audit/v1/score/{match_id} contract.

2. `app.services.scoring.project_match(sport_config: dict, match: dict, events: list[dict]) -> dict`:
   Pure projection function reconstructing score, outcome, winner, period status,
   and cricket/esports details from the immutable event stream without DB access.

3. `app.services.scoring.ScoreService.append_event(session: Session, request: dict) -> tuple[int, dict]`:
   Validates state transitions, enforces idempotency, checks sport scoring constraints,
   signs the payload, persists to match_events, and returns (status_code, response_body).

4. `app.services.roster.RosterService.transfer(session: Session, request: dict) -> tuple[int, dict]`:
   Enforces ordered transfer validations (window, tenant, max-squad, position minimums,
   in-progress match deferrals) and persists immutable audit history, returning (status_code, response_body).

5. `app.services.offline_sync.get_current_version(session: Session, kind: str, resource_id: str) -> int`:
   Calculates current version for conflict detection: match version (event count) for matches,
   or player version (audit entry count) for roster players.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    Club,
    League,
    Match,
    MatchEvent,
    RosterLeague,
    RosterPlayer,
    Sport,
    Tenant,
    User,
)


# ===========================================================================
# 1. SportConfigRepository
# ===========================================================================


class SportConfigRepository:
    """Data access repository for arbitrary JSON-defined sport configurations."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, sport_id: str) -> dict[str, Any] | None:
        """Return full stored sport configuration dictionary including scoring_model.

        Returns None if sport_id does not exist.
        """
        row = self.session.query(Sport).filter(Sport.sport_id == sport_id).first()
        if row is None:
            return None

        cfg = dict(row.config) if isinstance(row.config, dict) else {}
        cfg.setdefault("sport_id", row.sport_id)
        cfg.setdefault("name", row.name)
        cfg["scoring_model"] = row.scoring_model
        return cfg

    def exists(self, sport_id: str) -> bool:
        """Return True if sport_id exists in the database, False otherwise."""
        return (
            self.session.query(Sport.sport_id)
            .filter(Sport.sport_id == sport_id)
            .first()
            is not None
        )

    def list_ids(self) -> list[str]:
        """Return sorted list of all registered sport identifiers."""
        rows = (
            self.session.query(Sport.sport_id)
            .order_by(Sport.sport_id.asc())
            .all()
        )
        return [r[0] for r in rows]


# ===========================================================================
# 2. LeagueRepository
# ===========================================================================


class LeagueRepository:
    """Data access repository for leagues, standings configurations, and fixtures."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, league_id: str) -> dict[str, Any] | None:
        """Return league configuration with fixtures and points rules.

        Keys:
          - league_id: str
          - sport_id: str
          - teams: list[str]
          - fixtures: list[dict] with {match_id, home, away}
          - points: dict with {win, draw, loss}
          - tie_break_order: list[str]
          - qualification_spots: int
          - lots_seed: int
        """
        row = self.session.query(League).filter(League.league_id == league_id).first()
        if row is None:
            return None

        matches = (
            self.session.query(Match)
            .filter(Match.league_id == league_id)
            .order_by(Match.created_at.asc(), Match.match_id.asc())
            .all()
        )

        fixtures = [
            {
                "match_id": m.match_id,
                "home": m.home_team_id,
                "away": m.away_team_id,
            }
            for m in matches
        ]

        return {
            "league_id": row.league_id,
            "sport_id": row.sport_id,
            "teams": list(row.teams or []),
            "fixtures": fixtures,
            "points": {
                "win": row.points_win,
                "draw": row.points_draw,
                "loss": row.points_loss,
            },
            "tie_break_order": list(row.tie_break_order or []),
            "qualification_spots": row.qualification_spots,
            "lots_seed": row.lots_seed,
        }

    def list_all(self) -> list[dict[str, Any]]:
        """Return all registered leagues with their fixtures and points rules."""
        leagues = (
            self.session.query(League)
            .order_by(League.league_id.asc())
            .all()
        )

        matches = (
            self.session.query(Match)
            .filter(Match.league_id.isnot(None))
            .order_by(Match.created_at.asc(), Match.match_id.asc())
            .all()
        )

        fixtures_by_league: dict[str, list[dict[str, str]]] = {}
        for m in matches:
            if m.league_id is not None:
                fixtures_by_league.setdefault(m.league_id, []).append(
                    {
                        "match_id": m.match_id,
                        "home": m.home_team_id,
                        "away": m.away_team_id,
                    }
                )

        return [
            {
                "league_id": row.league_id,
                "sport_id": row.sport_id,
                "teams": list(row.teams or []),
                "fixtures": fixtures_by_league.get(row.league_id, []),
                "points": {
                    "win": row.points_win,
                    "draw": row.points_draw,
                    "loss": row.points_loss,
                },
                "tie_break_order": list(row.tie_break_order or []),
                "qualification_spots": row.qualification_spots,
                "lots_seed": row.lots_seed,
            }
            for row in leagues
        ]


# ===========================================================================
# 3. MatchEventRepository
# ===========================================================================


class MatchEventRepository:
    """Data access repository for matches and immutable append-only event streams."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_match(self, match_id: str) -> dict[str, Any] | None:
        """Return match schedule details as a plain dictionary.

        Keys:
          - match_id: str
          - sport_id: str
          - league_id: str | None
          - home_team_id: str
          - away_team_id: str
          - scheduled_at: str | None (ISO 8601 UTC)
        """
        m = self.session.query(Match).filter(Match.match_id == match_id).first()
        if m is None:
            return None

        return {
            "match_id": m.match_id,
            "sport_id": m.sport_id,
            "league_id": m.league_id,
            "home_team_id": m.home_team_id,
            "away_team_id": m.away_team_id,
            "scheduled_at": (
                m.scheduled_at.strftime("%Y-%m-%dT%H:%M:%SZ")
                if m.scheduled_at is not None
                else None
            ),
        }

    def list(self, match_id: str) -> list[dict[str, Any]]:
        """Return complete immutable event log for match_id in sequence order.

        Each item contains:
          - sequence: int
          - event_id: str
          - type: str
          - payload: dict
          - signature: str
        """
        events = (
            self.session.query(MatchEvent)
            .filter(MatchEvent.match_id == match_id)
            .order_by(MatchEvent.sequence.asc())
            .all()
        )

        return [
            {
                "sequence": e.sequence,
                "event_id": e.event_id,
                "type": e.type,
                "payload": dict(e.payload) if isinstance(e.payload, dict) else e.payload,
                "signature": e.signature,
            }
            for e in events
        ]

    def list_matches_for_league(self, league_id: str) -> list[dict[str, Any]]:
        """Return all matches associated with a given league_id."""
        matches = (
            self.session.query(Match)
            .filter(Match.league_id == league_id)
            .order_by(Match.created_at.asc(), Match.match_id.asc())
            .all()
        )

        return [
            {
                "match_id": m.match_id,
                "sport_id": m.sport_id,
                "league_id": m.league_id,
                "home_team_id": m.home_team_id,
                "away_team_id": m.away_team_id,
                "scheduled_at": (
                    m.scheduled_at.strftime("%Y-%m-%dT%H:%M:%SZ")
                    if m.scheduled_at is not None
                    else None
                ),
            }
            for m in matches
        ]

    def count(self, match_id: str) -> int:
        """Return total count of events recorded for match_id (i.e. match_version)."""
        result = (
            self.session.query(func.count(MatchEvent.id))
            .filter(MatchEvent.match_id == match_id)
            .scalar()
        )
        return int(result or 0)


# ===========================================================================
# 4. UserRepository
# ===========================================================================


@dataclass(frozen=True)
class UserRecord:
    """Immutable representation of a platform user."""

    user_id: str
    email: str
    display_name: str | None
    role: str
    tenant_id: str | None
    club_id: str | None
    league_id: str | None
    player_id: str | None
    password_hash: str


class UserRepository:
    """Data access repository for user accounts and RBAC scenario context."""

    def __init__(self, session: Session) -> None:
        self.session = session

    @staticmethod
    def _to_record(user: User) -> UserRecord:
        return UserRecord(
            user_id=user.user_id,
            email=user.email,
            display_name=user.display_name,
            role=user.role,
            tenant_id=user.tenant_id,
            club_id=user.club_id,
            league_id=user.league_id,
            player_id=user.player_id,
            password_hash=user.password_hash,
        )

    def get_by_email(self, email: str) -> UserRecord | None:
        """Find user by email address."""
        u = self.session.query(User).filter(User.email == email).first()
        return self._to_record(u) if u else None

    def get_by_id(self, user_id: str) -> UserRecord | None:
        """Find user by user_id."""
        u = self.session.query(User).filter(User.user_id == user_id).first()
        return self._to_record(u) if u else None

    def list_demo_users(self) -> list[UserRecord]:
        """Return all seeded user records ordered by user_id."""
        users = self.session.query(User).order_by(User.user_id.asc()).all()
        return [self._to_record(u) for u in users]

    def get_by_role(self, role: str) -> UserRecord | None:
        """Find the first user having the specified role."""
        u = self.session.query(User).filter(User.role == role).first()
        return self._to_record(u) if u else None

    def get_rbac_scenario_context(self) -> dict[str, str]:
        """Return the PDF §5.13 RBAC scenario context object dynamically read from seeded rows.

        Context mapping:
          - tenant_id: "tenant-alpha"
          - foreign_tenant_id: "tenant-beta"
          - own_league_id: "league-alpha-1"
          - other_league_id: "league-alpha-2"
          - foreign_league_id: "league-beta-1"
          - own_club_id: "club-alpha-1"
          - other_club_id: "club-alpha-2"
          - foreign_club_id: "club-beta-1"
          - own_player_id: "player-alpha-1"
          - other_player_id: "player-alpha-2"
          - foreign_player_id: "player-beta-1"
        """
        # 1. Tenants (primary tenant derived from league organizer user)
        organizer = self.session.query(User).filter(User.role == "league_organizer").first()
        primary_tenant_id = (
            organizer.tenant_id
            if (organizer and organizer.tenant_id)
            else "tenant-alpha"
        )

        foreign_tenant_row = (
            self.session.query(Tenant)
            .filter(Tenant.tenant_id != primary_tenant_id)
            .order_by(Tenant.tenant_id.asc())
            .first()
        )
        foreign_tenant_id = (
            foreign_tenant_row.tenant_id
            if foreign_tenant_row
            else "tenant-beta"
        )

        # 2. Leagues
        own_league_id = (
            organizer.league_id
            if (organizer and organizer.league_id)
            else "league-alpha-1"
        )

        other_lg = (
            self.session.query(League)
            .filter(
                League.tenant_id == primary_tenant_id,
                League.league_id != own_league_id,
            )
            .order_by(League.league_id.asc())
            .first()
        )
        other_league_id = other_lg.league_id if other_lg else "league-alpha-2"

        foreign_lg = (
            self.session.query(League)
            .filter(League.tenant_id == foreign_tenant_id)
            .order_by(League.league_id.asc())
            .first()
        )
        foreign_league_id = foreign_lg.league_id if foreign_lg else "league-beta-1"

        # 3. Clubs
        manager = self.session.query(User).filter(User.role == "club_manager").first()
        own_club_id = (
            manager.club_id
            if (manager and manager.club_id)
            else "club-alpha-1"
        )

        other_cl = (
            self.session.query(Club)
            .filter(
                Club.tenant_id == primary_tenant_id,
                Club.club_id != own_club_id,
            )
            .order_by(Club.club_id.asc())
            .first()
        )
        other_club_id = other_cl.club_id if other_cl else "club-alpha-2"

        foreign_cl = (
            self.session.query(Club)
            .filter(Club.tenant_id == foreign_tenant_id)
            .order_by(Club.club_id.asc())
            .first()
        )
        foreign_club_id = foreign_cl.club_id if foreign_cl else "club-beta-1"

        # 4. Players
        player_user = self.session.query(User).filter(User.role == "player").first()
        own_player_id = (
            player_user.player_id
            if (player_user and player_user.player_id)
            else "player-alpha-1"
        )

        other_pl = (
            self.session.query(RosterPlayer)
            .join(RosterLeague, RosterPlayer.league_id == RosterLeague.league_id)
            .filter(
                RosterLeague.tenant_id == primary_tenant_id,
                RosterPlayer.player_id != own_player_id,
            )
            .order_by(RosterPlayer.player_id.asc())
            .first()
        )
        other_player_id = other_pl.player_id if other_pl else "player-alpha-2"

        foreign_pl = (
            self.session.query(RosterPlayer)
            .join(RosterLeague, RosterPlayer.league_id == RosterLeague.league_id)
            .filter(RosterLeague.tenant_id == foreign_tenant_id)
            .order_by(RosterPlayer.player_id.asc())
            .first()
        )
        foreign_player_id = foreign_pl.player_id if foreign_pl else "player-beta-1"

        return {
            "tenant_id": primary_tenant_id,
            "foreign_tenant_id": foreign_tenant_id,
            "own_league_id": own_league_id,
            "other_league_id": other_league_id,
            "foreign_league_id": foreign_league_id,
            "own_club_id": own_club_id,
            "other_club_id": other_club_id,
            "foreign_club_id": foreign_club_id,
            "own_player_id": own_player_id,
            "other_player_id": other_player_id,
            "foreign_player_id": foreign_player_id,
        }
