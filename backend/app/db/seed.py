"""Baseline deterministic seed and reset implementation — NaSCon '26 Platform.

Implements baseline seeding and POST /audit/v1/reset (PDF §5.4, §5.5, §5.6, §8.3).
Every seed function is kept small, separate, and unit-testable.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import (
    Base,
    Club,
    DiscountCode,
    League,
    Product,
    ProductVariant,
    RosterLeague,
    RosterPlayer,
    RosterRegistration,
    RosterSquad,
    Sport,
    SystemState,
    Tenant,
    User,
)

logger = logging.getLogger("app.db.seed")

# ---------------------------------------------------------------------------
# Password hashing helpers (PBKDF2-HMAC-SHA256)
# ---------------------------------------------------------------------------

_PBKDF2_ITERATIONS: int = 100_000
_SEED_PASSWORD_SALT: bytes = b"nascon26_eval_salt"


def hash_password(password: str, salt: bytes | None = None) -> str:
    """Hash password using PBKDF2-HMAC-SHA256 with 100,000 iterations.

    Deterministic when salt is constant, satisfying:
    'Must be repeatable and leave identical state every time.'
    """
    if salt is None:
        salt = _SEED_PASSWORD_SALT
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${derived.hex()}"


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify plain password against PBKDF2-HMAC-SHA256 hash in constant time."""
    try:
        algo, iterations_str, salt_hex, derived_hex = password_hash.split("$")
        if algo != "pbkdf2_sha256":
            return False
        iterations = int(iterations_str)
        salt = bytes.fromhex(salt_hex)
        computed = hashlib.pbkdf2_hmac(
            "sha256", plain_password.encode("utf-8"), salt, iterations
        )
        return hmac.compare_digest(computed.hex(), derived_hex)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Seed state query
# ---------------------------------------------------------------------------


def is_seeded(session: Session) -> bool:
    """Return True if system_state has seeded=True."""
    try:
        row = session.query(SystemState).filter(SystemState.key == "seeded").first()
        return bool(row and row.value is True)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# 1. Sports Seeding (PDF §5.5, §5.6)
# ---------------------------------------------------------------------------

_SEEDED_SPORTS_CONFIGS: list[dict[str, Any]] = [
    {
        "sport_id": "football",
        "name": "Football",
        "scoring_model": "event",
        "periods": {
            "count": 2,
            "duration_minutes": 45,
        },
        "scoring_events": {
            "goal": {"points": 1},
        },
        "draw_allowed": True,
        "overtime": {
            "policy": "none",
        },
        "tie_break_order": [
            "h2h_points",
            "h2h_diff",
            "overall_diff",
            "scored",
            "fair_play",
            "draw_lots",
        ],
        "roster": {
            "min_squad_size": 11,
            "max_squad_size": 25,
            "required_positions": {"gk": 1},
        },
    },
    {
        "sport_id": "basketball",
        "name": "Basketball",
        "scoring_model": "event",
        "periods": {
            "count": 4,
            "duration_minutes": 12,
        },
        "scoring_events": {
            "free_throw": {"points": 1},
            "two_pointer": {"points": 2},
            "three_pointer": {"points": 3},
        },
        "draw_allowed": False,
        "overtime": {
            "policy": "extra_time",
            "duration_minutes": 5,
        },
        "tie_break_order": [
            "h2h_points",
            "h2h_diff",
            "overall_diff",
            "scored",
            "fair_play",
            "draw_lots",
        ],
        "roster": {
            "min_squad_size": 5,
            "max_squad_size": 15,
            "required_positions": {},
        },
    },
    {
        "sport_id": "cricket",
        "name": "Cricket",
        "scoring_model": "innings",
        "periods": {
            "innings_per_team": 1,
            "overs_per_innings": 20,
            "balls_per_over": 6,
            "wickets_per_innings": 10,
        },
        "scoring_events": {
            "dot_ball": {"runs": 0, "legal_ball": True, "wicket": False},
            "single": {"runs": 1, "legal_ball": True, "wicket": False},
            "two": {"runs": 2, "legal_ball": True, "wicket": False},
            "four": {"runs": 4, "legal_ball": True, "wicket": False},
            "six": {"runs": 6, "legal_ball": True, "wicket": False},
            "wide": {"runs": 1, "legal_ball": False, "wicket": False},
            "no_ball": {"runs": 1, "legal_ball": False, "wicket": False},
            "wicket": {"runs": 0, "legal_ball": True, "wicket": True},
        },
        "draw_allowed": True,
        "overtime": {
            "policy": "super_over",
        },
        "tie_break_order": [
            "h2h_points",
            "h2h_diff",
            "overall_diff",
            "scored",
            "fair_play",
            "draw_lots",
        ],
        "roster": {
            "min_squad_size": 11,
            "max_squad_size": 18,
            "required_positions": {"wicketkeeper": 1},
        },
    },
    {
        "sport_id": "esports",
        "name": "Esports",
        "scoring_model": "round",
        "periods": {
            "best_of": 3,
        },
        "scoring_events": {
            "round_win": {"rounds": 1},
        },
        "draw_allowed": False,
        "overtime": {
            "policy": "none",
        },
        "tie_break_order": [
            "h2h_points",
            "h2h_diff",
            "overall_diff",
            "scored",
            "fair_play",
            "draw_lots",
        ],
        "roster": {
            "min_squad_size": 5,
            "max_squad_size": 8,
            "required_positions": {},
        },
    },
]


def seed_sports(session: Session) -> list[str]:
    """Seed the 4 baseline sports with identical schema to POST /audit/v1/sports."""
    sport_ids: list[str] = []
    for cfg in _SEEDED_SPORTS_CONFIGS:
        sport = Sport(
            sport_id=cfg["sport_id"],
            name=cfg["name"],
            scoring_model=cfg["scoring_model"],
            config=cfg,
            is_seeded=True,
        )
        session.add(sport)
        sport_ids.append(cfg["sport_id"])
    return sport_ids


# ---------------------------------------------------------------------------
# 2. Tenants Seeding (PDF §5.5)
# ---------------------------------------------------------------------------


def seed_tenants(session: Session) -> list[str]:
    """Seed baseline tenants: tenant-alpha and tenant-beta."""
    tenants = [
        Tenant(
            tenant_id="tenant-alpha",
            name="Alpha Sports",
            logo_url="https://assets.nascon.test/tenants/alpha/logo.png",
            primary_color="#FF4500",
            secondary_color="#1E90FF",
        ),
        Tenant(
            tenant_id="tenant-beta",
            name="Beta Athletics",
            logo_url="https://assets.nascon.test/tenants/beta/logo.png",
            primary_color="#2E8B57",
            secondary_color="#FFD700",
        ),
    ]
    session.add_all(tenants)
    return [t.tenant_id for t in tenants]


# ---------------------------------------------------------------------------
# 3. Store Seeding (PDF §5.5)
# ---------------------------------------------------------------------------

DEFAULT_STORE_STOCK: dict[str, int] = {
    "var-jersey-001-M": 1,
    "var-jersey-001-L": 5,
}


def seed_store(session: Session, stock: dict[str, int] | None = None) -> dict[str, int]:
    """Seed product, variants, and discount code.

    Ignores unknown variant IDs in stock input.
    Returns effective stock dictionary for known variants.
    """
    effective_stock = dict(DEFAULT_STORE_STOCK)
    if stock is not None:
        for vid in DEFAULT_STORE_STOCK:
            if vid in stock:
                effective_stock[vid] = stock[vid]

    product = Product(
        product_id="prod-jersey-001",
        tenant_id="tenant-alpha",
        name="Alpha Official Jersey",
        category="apparel",
        description="Official match day jersey",
        is_digital=False,
    )
    session.add(product)

    variants = [
        ProductVariant(
            variant_id="var-jersey-001-M",
            product_id="prod-jersey-001",
            size="M",
            color="Red",
            price_minor=450000,
            currency="PKR",
            stock=effective_stock["var-jersey-001-M"],
            reserved=0,
        ),
        ProductVariant(
            variant_id="var-jersey-001-L",
            product_id="prod-jersey-001",
            size="L",
            color="Red",
            price_minor=450000,
            currency="PKR",
            stock=effective_stock["var-jersey-001-L"],
            reserved=0,
        ),
    ]
    session.add_all(variants)

    discount = DiscountCode(
        code="WELCOME10",
        percent=10,
    )
    session.add(discount)

    return effective_stock


# ---------------------------------------------------------------------------
# 4. RBAC Scenario Seeding (PDF §5.5, §5.13)
# ---------------------------------------------------------------------------


def seed_scenario(session: Session, seed: int = 42) -> None:
    """Seed leagues, clubs, and players bound to the RBAC scenario."""
    tie_break = [
        "h2h_points",
        "h2h_diff",
        "overall_diff",
        "scored",
        "fair_play",
        "draw_lots",
    ]

    leagues = [
        League(
            league_id="league-alpha-1",
            display_name="Alpha League 1",
            tenant_id="tenant-alpha",
            sport_id="football",
            teams=[],
            points_win=3,
            points_draw=1,
            points_loss=0,
            tie_break_order=tie_break,
            qualification_spots=0,
            lots_seed=seed,
        ),
        League(
            league_id="league-alpha-2",
            display_name="Alpha League 2",
            tenant_id="tenant-alpha",
            sport_id="football",
            teams=[],
            points_win=3,
            points_draw=1,
            points_loss=0,
            tie_break_order=tie_break,
            qualification_spots=0,
            lots_seed=seed,
        ),
        League(
            league_id="league-beta-1",
            display_name="Beta League 1",
            tenant_id="tenant-beta",
            sport_id="football",
            teams=[],
            points_win=3,
            points_draw=1,
            points_loss=0,
            tie_break_order=tie_break,
            qualification_spots=0,
            lots_seed=seed,
        ),
    ]
    session.add_all(leagues)

    clubs = [
        Club(
            club_id="club-alpha-1",
            tenant_id="tenant-alpha",
            name="Alpha Club 1",
            home_venue_name="Alpha Arena 1",
            venue_latitude=33.7294,
            venue_longitude=73.0931,
            social_handles={"twitter": "@alphaclub1", "instagram": "@alphaclub1"},
            staff={"coach": "Coach Alpha 1", "manager": "Manager Alpha 1", "physio": "Physio Alpha 1"},
            historical_stats={},
        ),
        Club(
            club_id="club-alpha-2",
            tenant_id="tenant-alpha",
            name="Alpha Club 2",
            home_venue_name="Alpha Arena 2",
            venue_latitude=33.7295,
            venue_longitude=73.0932,
            social_handles={"twitter": "@alphaclub2", "instagram": "@alphaclub2"},
            staff={"coach": "Coach Alpha 2", "manager": "Manager Alpha 2", "physio": "Physio Alpha 2"},
            historical_stats={},
        ),
        Club(
            club_id="club-beta-1",
            tenant_id="tenant-beta",
            name="Beta Club 1",
            home_venue_name="Beta Arena 1",
            venue_latitude=31.5204,
            venue_longitude=74.3587,
            social_handles={"twitter": "@betaclub1", "instagram": "@betaclub1"},
            staff={"coach": "Coach Beta 1", "manager": "Manager Beta 1", "physio": "Physio Beta 1"},
            historical_stats={},
        ),
    ]
    session.add_all(clubs)

    # Roster infrastructure (foreign-key support for player entries)
    roster_leagues = [
        RosterLeague(
            league_id="league-alpha-1",
            tenant_id="tenant-alpha",
            sport_id="football",
            window_open=date(2026, 1, 1),
            window_close=date(2026, 12, 31),
            max_squad_size=25,
            required_positions={"gk": 1},
        ),
        RosterLeague(
            league_id="league-alpha-2",
            tenant_id="tenant-alpha",
            sport_id="football",
            window_open=date(2026, 1, 1),
            window_close=date(2026, 12, 31),
            max_squad_size=25,
            required_positions={"gk": 1},
        ),
        RosterLeague(
            league_id="league-beta-1",
            tenant_id="tenant-beta",
            sport_id="football",
            window_open=date(2026, 1, 1),
            window_close=date(2026, 12, 31),
            max_squad_size=25,
            required_positions={"gk": 1},
        ),
    ]
    session.add_all(roster_leagues)

    roster_squads = [
        RosterSquad(
            squad_id="squad-alpha-1",
            league_id="league-alpha-1",
            club_id="club-alpha-1",
            tenant_id="tenant-alpha",
            name="Alpha Club 1 Squad",
        ),
        RosterSquad(
            squad_id="squad-alpha-2",
            league_id="league-alpha-2",
            club_id="club-alpha-2",
            tenant_id="tenant-alpha",
            name="Alpha Club 2 Squad",
        ),
        RosterSquad(
            squad_id="squad-beta-1",
            league_id="league-beta-1",
            club_id="club-beta-1",
            tenant_id="tenant-beta",
            name="Beta Club 1 Squad",
        ),
    ]
    session.add_all(roster_squads)

    roster_players = [
        RosterPlayer(
            player_id="player-alpha-1",
            league_id="league-alpha-1",
            name="Player Alpha 1",
            position="gk",
        ),
        RosterPlayer(
            player_id="player-alpha-2",
            league_id="league-alpha-2",
            name="Player Alpha 2",
            position="forward",
        ),
        RosterPlayer(
            player_id="player-beta-1",
            league_id="league-beta-1",
            name="Player Beta 1",
            position="forward",
        ),
    ]
    session.add_all(roster_players)

    roster_registrations = [
        RosterRegistration(
            player_id="player-alpha-1",
            league_id="league-alpha-1",
            squad_id="squad-alpha-1",
            registration_type="initial",
            start_date=date(2026, 1, 1),
            role="starter",
            state="active",
        ),
        RosterRegistration(
            player_id="player-alpha-2",
            league_id="league-alpha-2",
            squad_id="squad-alpha-2",
            registration_type="initial",
            start_date=date(2026, 1, 1),
            role="starter",
            state="active",
        ),
        RosterRegistration(
            player_id="player-beta-1",
            league_id="league-beta-1",
            squad_id="squad-beta-1",
            registration_type="initial",
            start_date=date(2026, 1, 1),
            role="starter",
            state="active",
        ),
    ]
    session.add_all(roster_registrations)


# ---------------------------------------------------------------------------
# 5. Users Seeding (PDF §5.5, §8.3)
# ---------------------------------------------------------------------------


def seed_users(session: Session) -> None:
    """Seed the 5 demo accounts bound to the scenario."""
    hashed_pwd = hash_password("Nascon@26")

    demo_users = [
        User(
            user_id="usr-admin",
            email="admin@nascon.test",
            display_name="Super Admin",
            role="super_admin",
            password_hash=hashed_pwd,
            tenant_id=None,
            league_id=None,
            club_id=None,
            player_id=None,
        ),
        User(
            user_id="usr-organizer",
            email="organizer@nascon.test",
            display_name="League Organizer",
            role="league_organizer",
            password_hash=hashed_pwd,
            tenant_id="tenant-alpha",
            league_id="league-alpha-1",
            club_id=None,
            player_id=None,
        ),
        User(
            user_id="usr-manager",
            email="manager@nascon.test",
            display_name="Club Manager",
            role="club_manager",
            password_hash=hashed_pwd,
            tenant_id="tenant-alpha",
            league_id=None,
            club_id="club-alpha-1",
            player_id=None,
        ),
        User(
            user_id="usr-player",
            email="player@nascon.test",
            display_name="Player Alpha 1",
            role="player",
            password_hash=hashed_pwd,
            tenant_id="tenant-alpha",
            league_id=None,
            club_id=None,
            player_id="player-alpha-1",
        ),
        User(
            user_id="usr-viewer",
            email="viewer@nascon.test",
            display_name="Viewer Alpha",
            role="viewer",
            password_hash=hashed_pwd,
            tenant_id="tenant-alpha",
            league_id=None,
            club_id=None,
            player_id=None,
        ),
    ]
    session.add_all(demo_users)


# ---------------------------------------------------------------------------
# 6. Full Reset and Seeding Orchestrator
# ---------------------------------------------------------------------------

_ADVISORY_LOCK_ID: int = 20261017


def reset_all(
    session: Session,
    seed: int = 42,
    stock: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Wipe ALL state and deterministically reconstruct baseline data.

    Serialized with a Postgres advisory lock to ensure concurrent resets
    safely queue and complete in order.
    """
    is_postgres = bool(session.bind and session.bind.dialect.name == "postgresql")

    if is_postgres:
        session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_id);"),
            {"lock_id": _ADVISORY_LOCK_ID},
        )
        session.execute(
            text(
                """
                TRUNCATE TABLE
                    offline_sync_actions,
                    roster_matches_in_progress,
                    roster_requests,
                    roster_audit_entries,
                    roster_registrations,
                    roster_players,
                    roster_squads,
                    roster_leagues,
                    domain_event_outbox,
                    order_items,
                    orders,
                    scheduled_price_changes,
                    discount_codes,
                    product_variants,
                    products,
                    pinned_products,
                    match_events,
                    matches,
                    leagues,
                    sports,
                    clubs,
                    users,
                    tenants,
                    system_state
                RESTART IDENTITY CASCADE;
                """
            )
        )
    else:
        for table in reversed(Base.metadata.sorted_tables):
            session.execute(table.delete())

    sports = seed_sports(session)
    tenants = seed_tenants(session)
    effective_stock = seed_store(session, stock)
    seed_scenario(session, seed)
    seed_users(session)

    session.add_all(
        [
            SystemState(key="seeded", value=True),
            SystemState(key="seed", value=seed),
            SystemState(key="reset_seed", value=seed),
        ]
    )

    session.flush()
    session.commit()

    return {
        "status": "reset_complete",
        "seed": seed,
        "sports": sports,
        "tenants": tenants,
        "stock": effective_stock,
    }


def seed_all(
    session: Session,
    seed: int = 42,
    stock: dict[str, int] | None = None,
) -> dict[str, Any]:
    """Run baseline deterministic seeding (delegates to reset_all)."""
    return reset_all(session=session, seed=seed, stock=stock)
