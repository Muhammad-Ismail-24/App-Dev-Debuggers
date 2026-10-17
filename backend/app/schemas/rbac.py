"""Trusted repository records, separate from untrusted bearer claims."""
from dataclasses import dataclass, field
from typing import Literal, Protocol

Role = Literal["super_admin", "league_organizer", "club_manager", "player", "viewer"]
ROLES = ("super_admin", "league_organizer", "club_manager", "player", "viewer")


@dataclass(frozen=True)
class Principal:
    user_id: str
    role: Role
    tenant_id: str | None
    league_ids: frozenset[str] = field(default_factory=frozenset)
    club_ids: frozenset[str] = field(default_factory=frozenset)
    player_id: str | None = None


@dataclass(frozen=True)
class Resource:
    id: str
    tenant_id: str
    club_id: str | None = None


class AuthorizationSource(Protocol):
    def get_principal(self, user_id: str) -> Principal | None:
        """Load an active user and current ownership from persistence."""
        ...

    def get_resource(self, kind: str, resource_id: str) -> Resource:
        """Resolve globally (not tenant-filtered); raise shared 404 if absent."""
        ...

    def demo_principals(self) -> dict[str, Principal]:
        """Five baseline accounts from the seeder, keyed by the five role names."""
        ...

    def scenario_context(self) -> dict[str, str]:
        """The exact section 5.13 context keys, derived from baseline seed data."""
        ...
