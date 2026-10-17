"""Database session layer — SQLAlchemy 2.x sync (psycopg2).

Public surface
--------------
engine              : SQLAlchemy Engine (pool_size=20, max_overflow=30, pool_pre_ping=True)
SessionLocal        : sessionmaker factory bound to the engine
get_session()       : FastAPI dependency — yields a Session, auto-closes
session_scope()     : context-manager — commit on success, rollback + close on error
wait_for_database() : startup retry loop (default 90 s) until Postgres is reachable
init_db()           : create all tables, then install the append-only trigger on match_events
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger("app.db.session")

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

def _build_engine():
    settings = get_settings()
    return create_engine(
        settings.DATABASE_URL,
        pool_size=20,
        max_overflow=30,
        pool_pre_ping=True,
        echo=False,
        future=True,
    )


engine = _build_engine()

# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)

# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


def get_session() -> Generator[Session, None, None]:
    """Yield a database session for use in FastAPI route dependencies.

    Closes the session on exit regardless of success or failure.
    The caller (or a service layer) is responsible for commit/rollback.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Context manager for service / script usage
# ---------------------------------------------------------------------------


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Provide a transactional scope around a block of code.

    Commits on clean exit; rolls back and re-raises on any exception;
    always closes the session.

    Usage::

        with session_scope() as db:
            db.add(some_model)
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Startup helpers
# ---------------------------------------------------------------------------


def wait_for_database(max_seconds: int = 90) -> None:
    """Block until the Postgres server is reachable, retrying every second.

    Raises RuntimeError if the database is still unreachable after *max_seconds*.
    Called once during the FastAPI lifespan startup hook.
    """
    deadline = time.monotonic() + max_seconds
    last_error: Exception | None = None

    while time.monotonic() < deadline:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database is reachable.")
            return
        except OperationalError as exc:
            last_error = exc
            remaining = int(deadline - time.monotonic())
            logger.warning(
                "Database not ready yet (%s remaining s); retrying in 1 s…",
                remaining,
            )
            time.sleep(1)

    raise RuntimeError(
        f"Database did not become available within {max_seconds} s. "
        f"Last error: {last_error}"
    )


# ---------------------------------------------------------------------------
# Append-only trigger on match_events
# ---------------------------------------------------------------------------

_TRIGGER_FUNCTION_SQL = """\
CREATE OR REPLACE FUNCTION enforce_match_events_append_only()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION
        'match_events is append-only: UPDATE and DELETE are forbidden. '
        'Use a compensation event instead.'
        USING ERRCODE = 'restrict_violation';
END;
$$;
"""

_DROP_TRIGGER_SQL = """\
DROP TRIGGER IF EXISTS trg_match_events_append_only ON match_events;
"""

_CREATE_TRIGGER_SQL = """\
CREATE TRIGGER trg_match_events_append_only
BEFORE UPDATE OR DELETE ON match_events
FOR EACH ROW EXECUTE FUNCTION enforce_match_events_append_only();
"""


def _install_append_only_trigger(conn) -> None:
    """Idempotently install the append-only trigger on match_events.

    The trigger fires BEFORE UPDATE or DELETE (per-row), raising an exception
    so those operations can never silently succeed.  TRUNCATE is intentionally
    NOT covered, so that POST /audit/v1/reset can wipe the table for a clean
    re-seed.

    Safe to call multiple times: uses CREATE OR REPLACE for the function and
    DROP TRIGGER IF EXISTS before re-creating the trigger.
    """
    conn.execute(text(_TRIGGER_FUNCTION_SQL))
    conn.execute(text(_DROP_TRIGGER_SQL))
    conn.execute(text(_CREATE_TRIGGER_SQL))
    logger.info("Append-only trigger installed on match_events.")


# ---------------------------------------------------------------------------
# init_db
# ---------------------------------------------------------------------------


def init_db() -> None:
    """Create all ORM-mapped tables and install DB-level constraints.

    Steps:
    1. Import models so metadata is populated (import is idempotent).
    2. Run Base.metadata.create_all — skips existing tables (checkfirst=True default).
    3. Install the append-only trigger on match_events inside a transaction.

    No Alembic migrations; schema changes require a DROP + recreate (dev only).
    """
    # Import here to avoid circular imports at module load time.
    from app.db.models import Base  # noqa: PLC0415

    Base.metadata.create_all(bind=engine)
    logger.info("All ORM tables created / verified.")

    with engine.begin() as conn:
        _install_append_only_trigger(conn)
