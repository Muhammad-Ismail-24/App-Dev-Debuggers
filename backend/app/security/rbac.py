"""Section 5.13 policy-as-code over trusted identity/resource records."""
from app.schemas.rbac import Principal, Resource


def is_allowed(principal: Principal, action: str, resource: Resource | None = None) -> bool:
    if action not in {"create_tenant", "manage_fixtures", "manage_roster", "manage_products",
                      "edit_player", "read_club", "platform_config"}:
        return False
    if principal.role == "super_admin":
        return True
    if resource is None or resource.tenant_id != principal.tenant_id:
        return False
    if action == "read_club":
        return principal.role in {"league_organizer", "club_manager", "player", "viewer"}
    if action == "manage_fixtures":
        return principal.role == "league_organizer" and resource.id in principal.league_ids
    if action in {"manage_roster", "manage_products"}:
        return principal.role == "club_manager" and resource.id in principal.club_ids
    if action == "edit_player":
        return ((principal.role == "player" and resource.id == principal.player_id)
                or (principal.role == "club_manager" and resource.club_id in principal.club_ids))
    return False
