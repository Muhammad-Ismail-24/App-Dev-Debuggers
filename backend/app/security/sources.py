"""Integration adapters: bind Sufiyan's read-only protocols (StandingsSource, AuthorizationSource)
and rate limiter to Ismail's repositories/database. No scoring or policy logic lives here."""
from __future__ import annotations

import logging

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import Club, League, RosterLeague, RosterPlayer, RosterRegistration, RosterSquad
from app.db.repositories import LeagueRepository, SportConfigRepository, UserRecord, UserRepository
from app.db.session import session_scope
from app.schemas.rbac import ROLES, Principal, Resource
from app.security.rate_limit import MemoryWindowLimiter
from app.services.scoring import get_score_projection

logger = logging.getLogger("app.security.sources")


class DbStandingsSource:
    """StandingsSource over the authoritative league config, sport config and event-log projections."""

    def get_league(self, league_id: str) -> dict | None:
        with session_scope() as session:
            league = LeagueRepository(session).get(league_id)
        if league is None:
            return None
        league = dict(league)
        league["qualification"] = {"spots": league.pop("qualification_spots")}
        return league

    def get_sport(self, sport_id: str) -> dict:
        with session_scope() as session:
            sport = SportConfigRepository(session).get(sport_id)
        if sport is None:
            raise HTTPException(404, detail=dict(code="SPORT_NOT_FOUND", message="Sport does not exist", details={"sport_id": sport_id}))
        return sport

    def get_score_projection(self, match_id: str) -> dict:
        with session_scope() as session:
            return get_score_projection(session, match_id)


def _principal(user: UserRecord) -> Principal:
    return Principal(
        user_id=user.user_id,
        role=user.role,  # type: ignore[arg-type]
        tenant_id=user.tenant_id,
        league_ids=frozenset([user.league_id]) if user.league_id else frozenset(),
        club_ids=frozenset([user.club_id]) if user.club_id else frozenset(),
        player_id=user.player_id,
    )


def _not_found(code: str, what: str, resource_id: str) -> HTTPException:
    return HTTPException(404, detail=dict(code=code, message=f"{what} does not exist", details={"id": resource_id}))


class DbAuthorizationSource:
    """AuthorizationSource over persisted users, leagues, clubs and roster players (never JWT claims)."""

    def get_principal(self, user_id: str) -> Principal | None:
        with session_scope() as session:
            user = UserRepository(session).get_by_id(user_id)
        return _principal(user) if user else None

    def get_resource(self, kind: str, resource_id: str) -> Resource:
        with session_scope() as session:
            if kind == "league":
                row = session.get(League, resource_id)
                if row is None:
                    raise _not_found("LEAGUE_NOT_FOUND", "League", resource_id)
                return Resource(id=row.league_id, tenant_id=row.tenant_id or "")
            if kind == "club":
                row = session.get(Club, resource_id)
                if row is None:
                    # Appendix B has no club-specific code; SQUAD_NOT_FOUND is the closest 404 in the catalogue.
                    raise _not_found("SQUAD_NOT_FOUND", "Club", resource_id)
                return Resource(id=row.club_id, tenant_id=row.tenant_id, club_id=row.club_id)
            if kind == "player":
                return self._player(session, resource_id)
        raise _not_found("NOT_FOUND", "Resource", resource_id)

    @staticmethod
    def _player(session: Session, player_id: str) -> Resource:
        player = session.get(RosterPlayer, player_id)
        if player is None:
            raise _not_found("PLAYER_NOT_FOUND", "Player", player_id)
        league = session.get(RosterLeague, player.league_id)
        registration = (
            session.query(RosterRegistration)
            .filter(RosterRegistration.player_id == player_id, RosterRegistration.league_id == player.league_id)
            .order_by(RosterRegistration.start_date.desc())
            .first()
        )
        squad = session.get(RosterSquad, registration.squad_id) if registration and registration.squad_id else None
        return Resource(id=player_id, tenant_id=league.tenant_id if league else "", club_id=squad.club_id if squad else None)

    def demo_principals(self) -> dict[str, Principal]:
        with session_scope() as session:
            repo = UserRepository(session)
            records = {role: repo.get_by_role(role) for role in ROLES}
        if any(rec is None for rec in records.values()):
            raise HTTPException(500, detail=dict(code="INTERNAL_ERROR", message="Demo accounts are not seeded", details={}))
        return {role: _principal(rec) for role, rec in records.items() if rec}

    def scenario_context(self) -> dict[str, str]:
        with session_scope() as session:
            return UserRepository(session).get_rbac_scenario_context()


class ResilientLimiter:
    """Redis rolling window (shared across workers) with an in-process fallback if Redis is unreachable."""

    def __init__(self, primary, fallback: MemoryWindowLimiter) -> None:
        self.primary, self.fallback, self._warned = primary, fallback, False

    async def check(self, client: str) -> int:
        try:
            return await self.primary.check(client)
        except Exception:  # noqa: BLE001 - never turn a limiter outage into a 500
            if not self._warned:
                logger.warning("Redis rate limiter unavailable; using in-process fallback")
                self._warned = True
            return await self.fallback.check(client)
