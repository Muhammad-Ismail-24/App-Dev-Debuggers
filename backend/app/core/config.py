"""Application runtime configuration and environment variables."""

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import lru_cache
from typing import List


@dataclass(frozen=True)
class Settings:
    DAY1_SALT: str
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@postgres:5432/nascon"
    REDIS_URL: str = "redis://redis:6379/0"
    RABBITMQ_URL: str = "amqp://guest:guest@rabbitmq:5672/"
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    JWT_SECRET: str = "insecure-jwt-secret-for-eval-change-in-prod"
    CORS_ORIGINS: str = "*"

    @property
    def cors_origins_list(self) -> List[str]:
        if not self.CORS_ORIGINS or self.CORS_ORIGINS.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    salt = os.getenv("DAY1_SALT")
    if not salt:
        raise RuntimeError("DAY1_SALT environment variable is required but not set")

    return Settings(
        DAY1_SALT=salt,
        DATABASE_URL=os.getenv(
            "DATABASE_URL",
            "postgresql+psycopg2://postgres:postgres@postgres:5432/nascon",
        ),
        REDIS_URL=os.getenv("REDIS_URL", "redis://redis:6379/0"),
        RABBITMQ_URL=os.getenv("RABBITMQ_URL", "amqp://guest:guest@rabbitmq:5672/"),
        MINIO_ENDPOINT=os.getenv("MINIO_ENDPOINT", "minio:9000"),
        MINIO_ACCESS_KEY=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        MINIO_SECRET_KEY=os.getenv("MINIO_SECRET_KEY", "minioadmin"),
        JWT_SECRET=os.getenv(
            "JWT_SECRET",
            "insecure-jwt-secret-for-eval-change-in-prod",
        ),
        CORS_ORIGINS=os.getenv("CORS_ORIGINS", "*"),
    )


def utc_now_iso() -> str:
    """Return current UTC timestamp in YYYY-MM-DDTHH:MM:SSZ format (no microseconds)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def today_utc_date_iso() -> str:
    """Return current UTC date in YYYY-MM-DD format."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")
