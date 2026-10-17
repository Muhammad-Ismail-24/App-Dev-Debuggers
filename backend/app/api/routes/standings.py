from fastapi import APIRouter, HTTPException, Request

from app.services.standings import get_standings

router = APIRouter()


@router.get("/audit/v1/standings/{league_id}")
def standings(league_id: str, request: Request):
    result = get_standings(league_id, request.app.state.standings_source)
    if result is None:
        raise HTTPException(404, detail=dict(code="LEAGUE_NOT_FOUND", message="League does not exist",
                                            details={"league_id": league_id}))
    return result
