import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings

logger = logging.getLogger("app.main")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    logger.info("Starting NaSCon '26 Backend API...")
    logger.info(
        "Configured services: DB=%s, REDIS=%s, RABBITMQ=%s, MINIO=%s",
        settings.DATABASE_URL,
        settings.REDIS_URL,
        settings.RABBITMQ_URL,
        settings.MINIO_ENDPOINT,
    )
    # NOTE: Never log or print DAY1_SALT

    # --------------------------------------------------------------------------
    # HOOK: Later steps will add database wait, table creation, and baseline
    # deterministic seeding here during startup.
    # --------------------------------------------------------------------------

    yield

    logger.info("Shutting down NaSCon '26 Backend API...")


app = FastAPI(
    title="NaSCon '26 Multi-Sport League Platform",
    lifespan=lifespan,
)

settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
