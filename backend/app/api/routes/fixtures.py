"""Include router and install the shared section 5.2 exception handlers in main."""
from fastapi import APIRouter, HTTPException

from app.schemas.fixtures import FixturesRequest
from app.services.fixtures import InvalidResult, NoValidPairing, generate_fixtures

router = APIRouter()


@router.post("/audit/v1/fixtures")
def fixtures(request: FixturesRequest):
    try:
        return generate_fixtures(request)
    except NoValidPairing as exc:
        raise HTTPException(409, detail=dict(code="NO_VALID_PAIRING", message=str(exc),
                                            details={"round": exc.round_number})) from exc
    except InvalidResult as exc:
        raise HTTPException(400, detail=dict(code="VALIDATION_ERROR", message=str(exc),
                                            details={"fields": ["params.results"]})) from exc
