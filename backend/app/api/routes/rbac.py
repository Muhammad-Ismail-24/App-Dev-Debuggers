from fastapi import APIRouter, Request

from app.schemas.rbac import ROLES
from app.security.rbac import authorize

router = APIRouter()


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
