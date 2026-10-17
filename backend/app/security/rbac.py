"""Section 5.13 policy-as-code over trusted identity/resource records."""
import re
from fastapi import HTTPException

from app.schemas.rbac import Principal, Resource
from app.security.jwt import InvalidToken


def authenticate(request):
    """Validate the bearer before inspecting a probe's body or resource."""
    headers = request.headers.getlist("authorization")
    parts = headers[0].split() if len(headers) == 1 else []
    principal = None
    if len(parts) == 2 and parts[0].lower() == "bearer":
        try:
            subject = request.app.state.jwt_service.verify(parts[1])
            principal = request.app.state.authorization_source.get_principal(subject)
        except InvalidToken:
            pass
    if principal is None or principal.role not in {"super_admin", "league_organizer", "club_manager", "player", "viewer"}:
        raise HTTPException(401, detail=dict(code="UNAUTHENTICATED", message="A valid bearer token is required", details={}),
                            headers={"WWW-Authenticate": "Bearer"})
    return principal


PROBES = (
    ("POST", r"/audit/v1/rbac/tenants", "create_tenant", None),
    ("POST", r"/audit/v1/rbac/leagues/([^/]+)/fixtures", "manage_fixtures", "league"),
    ("POST", r"/audit/v1/rbac/clubs/([^/]+)/roster", "manage_roster", "club"),
    ("POST", r"/audit/v1/rbac/clubs/([^/]+)/products", "manage_products", "club"),
    ("PATCH", r"/audit/v1/rbac/players/([^/]+)", "edit_player", "player"),
    ("GET", r"/audit/v1/rbac/clubs/([^/]+)", "read_club", "club"),
    ("GET", r"/audit/v1/rbac/platform/config", "platform_config", None),
)


def authorize(request, action, kind=None, resource_id=None):
    principal = authenticate(request)
    resource = request.app.state.authorization_source.get_resource(kind, resource_id) if kind else None
    if not is_allowed(principal, action, resource):
        raise HTTPException(403, detail=dict(code="FORBIDDEN", message="Access denied", details={}))
    return {"authorized": True}


def authorize_probe(request):
    """Run a recognized probe's complete policy before reading its body."""
    for method, pattern, action, kind in PROBES:
        matched = re.fullmatch(pattern, request.url.path)
        if request.method == method and matched:
            return authorize(request, action, kind, matched.group(1) if kind else None)
    return None


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
