from fastapi import APIRouter, HTTPException, Request

from app.schemas.rbac import ROLES
from app.security.jwt import InvalidToken
from app.security.rbac import is_allowed

router = APIRouter()


def authenticate(request):
    headers = request.headers.getlist("authorization")
    parts = headers[0].split() if len(headers) == 1 else []
    principal = None
    if len(parts) == 2 and parts[0].lower() == "bearer":
        try:
            subject = request.app.state.jwt_service.verify(parts[1])
            principal = request.app.state.authorization_source.get_principal(subject)
        except InvalidToken:
            pass
    if principal is None or principal.role not in ROLES:
        raise HTTPException(401, detail=dict(code="UNAUTHENTICATED", message="A valid bearer token is required", details={}),
                            headers={"WWW-Authenticate": "Bearer"})
    return principal


def authorize(request, action, kind=None, resource_id=None):
    principal = authenticate(request)  # Before resource lookup or body parsing.
    resource = request.app.state.authorization_source.get_resource(kind, resource_id) if kind else None
    if not is_allowed(principal, action, resource):
        raise HTTPException(403, detail=dict(code="FORBIDDEN", message="Access denied", details={}))
    return {"authorized": True}


@router.post("/audit/v1/rbac-matrix")
def rbac_matrix(request: Request):
    source = request.app.state.authorization_source
    principals = source.demo_principals()
    return dict(tokens={role: request.app.state.jwt_service.issue(principals[role].user_id) for role in ROLES},
                context=source.scenario_context())


@router.post("/audit/v1/rbac/tenants")
def tenants(request: Request):
    return authorize(request, "create_tenant")


@router.post("/audit/v1/rbac/leagues/{league_id}/fixtures")
def fixtures(league_id: str, request: Request):
    return authorize(request, "manage_fixtures", "league", league_id)


@router.post("/audit/v1/rbac/clubs/{club_id}/roster")
def roster(club_id: str, request: Request):
    return authorize(request, "manage_roster", "club", club_id)


@router.post("/audit/v1/rbac/clubs/{club_id}/products")
def products(club_id: str, request: Request):
    return authorize(request, "manage_products", "club", club_id)


@router.patch("/audit/v1/rbac/players/{player_id}")
def player(player_id: str, request: Request):
    return authorize(request, "edit_player", "player", player_id)


@router.get("/audit/v1/rbac/clubs/{club_id}")
def club(club_id: str, request: Request):
    return authorize(request, "read_club", "club", club_id)


@router.get("/audit/v1/rbac/platform/config")
def platform(request: Request):
    return authorize(request, "platform_config")
