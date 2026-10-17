from fastapi import APIRouter

from app.api.routes import health, leagues, reset, sports

api_router = APIRouter()

# ------------------------------------------------------------------------------
# Route modules in the order of instructions.md §6.4 endpoint table.
# Uncomment each line as the respective route module is created:
# ------------------------------------------------------------------------------
api_router.include_router(health.router)
api_router.include_router(reset.router)
api_router.include_router(sports.router)
# api_router.include_router(fixtures.router)
api_router.include_router(leagues.router)
# api_router.include_router(events.router)
# api_router.include_router(standings.router)
# api_router.include_router(roster.router)
# api_router.include_router(checkout.router)
# api_router.include_router(inventory.router)
# api_router.include_router(rbac.router)
# api_router.include_router(ping.router)
# api_router.include_router(offline_sync.router)
