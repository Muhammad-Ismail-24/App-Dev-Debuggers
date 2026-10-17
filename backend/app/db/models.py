"""SQLAlchemy ORM models — NaSCon '26 Multi-Sport League Platform.

Every table in this module (plural snake_case, as required by instructions.md §6.2):

  system_state              — singleton key/value store (seeded flag, reset_seed)
  tenants                   — multi-tenant organisations
  users                     — all five roles; nullable tenant/league/club/player links
  clubs                     — club profiles with venue, social handles, staff, history
  sports                    — arbitrary JSON-defined sport configurations
  leagues                   — fixture/standings configuration per sport per tenant
  matches                   — match schedule rows; status derived from event log
  match_events              — append-only immutable scoring event log (trigger-protected)
  pinned_products           — per-match pinned merchandise
  products                  — merchandise catalogue items
  product_variants          — size/color/price/stock variants
  discount_codes            — promotional discount codes
  scheduled_price_changes   — future price change schedule
  orders                    — checkout orders with full idempotency payload store
  order_items               — individual line items per order
  domain_event_outbox       — transactional outbox for async domain events
  roster_leagues            — roster configuration (window, squad size, positions)
  roster_squads             — a club's squad within a roster league
  roster_players            — player registry for a roster league
  roster_registrations      — current registration state per player
  roster_audit_entries      — immutable roster action history
  roster_requests           — idempotency store for roster API requests
  roster_matches_in_progress— matches blocking deferred transfers
  offline_sync_actions      — de-duplication store for offline sync actions
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ---------------------------------------------------------------------------
# Declarative base
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    """Shared declarative base; import this in session.py for create_all."""
    pass


# ---------------------------------------------------------------------------
# Utility: reusable created_at / updated_at defaults
# ---------------------------------------------------------------------------

def _now() -> datetime:
    return datetime.utcnow()


# ===========================================================================
# system_state
# ===========================================================================


class SystemState(Base):
    """Singleton key/value config store (e.g. seeded=true, reset_seed=42)."""

    __tablename__ = "system_state"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)


# ===========================================================================
# tenants
# ===========================================================================


class Tenant(Base):
    """Multi-tenant organisation.  Seed IDs: tenant-alpha, tenant-beta."""

    __tablename__ = "tenants"

    tenant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    primary_color: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    secondary_color: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # relationships (lazy by default — explicit joins in queries)
    users: Mapped[list["User"]] = relationship("User", back_populates="tenant", passive_deletes=True)
    clubs: Mapped[list["Club"]] = relationship("Club", back_populates="tenant", passive_deletes=True)


# ===========================================================================
# users
# ===========================================================================

_VALID_ROLES = ("super_admin", "league_organizer", "club_manager", "player", "viewer")


class User(Base):
    """Platform user — one of five roles."""

    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "role IN ('super_admin','league_organizer','club_manager','player','viewer')",
            name="ck_users_role",
        ),
    )

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional foreign-key links — kept nullable so super_admin has no tenant etc.
    tenant_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("tenants.tenant_id", ondelete="SET NULL"), nullable=True, index=True
    )
    league_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    club_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    player_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    tenant: Mapped[Optional[Tenant]] = relationship("Tenant", back_populates="users")


# ===========================================================================
# clubs
# ===========================================================================


class Club(Base):
    """Club profile including venue, social handles, staff, and history."""

    __tablename__ = "clubs"

    club_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    home_venue_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    # Venue coordinates stored as nullable floats; validated at service layer.
    venue_latitude: Mapped[Optional[float]] = mapped_column(nullable=True)
    venue_longitude: Mapped[Optional[float]] = mapped_column(nullable=True)
    # {"twitter": "...", "instagram": "...", ...}
    social_handles: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    # [{"role": "coach", "name": "..."}, ...]
    staff: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)
    # Arbitrary historical stats blob
    historical_stats: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    tenant: Mapped[Tenant] = relationship("Tenant", back_populates="clubs")


# ===========================================================================
# sports
# ===========================================================================


class Sport(Base):
    """Arbitrary JSON-defined sport configuration (no branches on sport name)."""

    __tablename__ = "sports"

    sport_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    # "points", "sets", "innings", etc. — free-form, driven by config JSONB
    scoring_model: Mapped[str] = mapped_column(String(64), nullable=False)
    # Full config as stored from POST /audit/v1/sports request body
    config: Mapped[Any] = mapped_column(JSONB, nullable=False)
    is_seeded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)


# ===========================================================================
# leagues
# ===========================================================================


class League(Base):
    """Fixture/standings configuration record per sport per tenant."""

    __tablename__ = "leagues"

    league_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    tenant_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("tenants.tenant_id", ondelete="SET NULL"), nullable=True, index=True
    )
    sport_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sports.sport_id", ondelete="RESTRICT"), nullable=False, index=True
    )
    # JSON list of team IDs in participation order
    teams: Mapped[Any] = mapped_column(JSONB, nullable=False, default=list)
    points_win: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    points_draw: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    points_loss: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # e.g. ["head_to_head", "goal_difference", "lots"]
    tie_break_order: Mapped[Any] = mapped_column(JSONB, nullable=False, default=list)
    qualification_spots: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lots_seed: Mapped[int] = mapped_column(Integer, nullable=False, default=42)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)


# ===========================================================================
# matches
# ===========================================================================


class Match(Base):
    """Match schedule row.  Match STATUS is NOT stored here — it is derived
    from the match_events event log by the scoring projection service."""

    __tablename__ = "matches"

    match_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    sport_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("sports.sport_id", ondelete="RESTRICT"), nullable=False, index=True
    )
    league_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("leagues.league_id", ondelete="SET NULL"), nullable=True, index=True
    )
    home_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    away_team_id: Mapped[str] = mapped_column(String(64), nullable=False)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)

    events: Mapped[list["MatchEvent"]] = relationship(
        "MatchEvent", back_populates="match", order_by="MatchEvent.sequence", passive_deletes=True
    )


# ===========================================================================
# match_events  (append-only — protected by DB trigger in session.py)
# ===========================================================================


class MatchEvent(Base):
    """Immutable event log entry.  UPDATE and DELETE are blocked by a Postgres
    trigger; TRUNCATE is intentionally allowed for POST /audit/v1/reset."""

    __tablename__ = "match_events"
    __table_args__ = (
        UniqueConstraint("match_id", "sequence", name="uq_match_events_match_seq"),
        UniqueConstraint("event_id", name="uq_match_events_event_id"),
        Index("ix_match_events_match_id", "match_id"),
        Index("ix_match_events_type", "type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(64), nullable=False)
    match_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("matches.match_id", ondelete="CASCADE"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    type: Mapped[str] = mapped_column(String(64), nullable=False)
    # Structured scoring payload (team, player, value, period, etc.)
    payload: Mapped[Any] = mapped_column(JSONB, nullable=False)
    # Full original POST body stored for idempotency comparison
    request_body: Mapped[Any] = mapped_column(JSONB, nullable=False)
    # HMAC-SHA256 64-char hex signature
    signature: Mapped[str] = mapped_column(String(64), nullable=False)
    # The 201 response body stored for idempotent re-delivery
    response: Mapped[Any] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)

    match: Mapped[Match] = relationship("Match", back_populates="events")


# ===========================================================================
# pinned_products
# ===========================================================================


class PinnedProduct(Base):
    """Match-scoped pinned merchandise (one pinned product per match at a time)."""

    __tablename__ = "pinned_products"

    match_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("matches.match_id", ondelete="CASCADE"), primary_key=True
    )
    product_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False
    )
    pinned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)


# ===========================================================================
# products / product_variants / discount_codes / scheduled_price_changes
# ===========================================================================


class Product(Base):
    """Merchandise catalogue item."""

    __tablename__ = "products"

    product_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("tenants.tenant_id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_digital: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    variants: Mapped[list["ProductVariant"]] = relationship(
        "ProductVariant", back_populates="product", passive_deletes=True
    )


class ProductVariant(Base):
    """Size/color/price/stock variant of a product."""

    __tablename__ = "product_variants"
    __table_args__ = (
        CheckConstraint("stock >= 0", name="ck_product_variants_stock_non_negative"),
        CheckConstraint("reserved >= 0", name="ck_product_variants_reserved_non_negative"),
        # reserved must never exceed stock
        CheckConstraint("reserved <= stock", name="ck_product_variants_reserved_lte_stock"),
        Index("ix_product_variants_product_id", "product_id"),
    )

    variant_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    product_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False
    )
    size: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    color: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Price in minor currency units (integer paisa)
    price_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="PKR")
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reserved: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    product: Mapped[Product] = relationship("Product", back_populates="variants")


class DiscountCode(Base):
    """Promotional discount code (e.g. WELCOME10 = 10 %)."""

    __tablename__ = "discount_codes"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Integer percentage: 10 means 10 %
    percent: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        # 0 ≤ percent ≤ 100
    )

    __table_args__ = (
        CheckConstraint("percent >= 0 AND percent <= 100", name="ck_discount_codes_percent_range"),
    )


class ScheduledPriceChange(Base):
    """Future price change for a product variant."""

    __tablename__ = "scheduled_price_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    variant_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("product_variants.variant_id", ondelete="CASCADE"), nullable=False, index=True
    )
    new_price_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)
    effective_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


# ===========================================================================
# orders / order_items
# ===========================================================================

_ORDER_STATUSES = "('pending','paid','packed','shipped','delivered','cancelled','refunded')"


class Order(Base):
    """Checkout order with full idempotency payload storage."""

    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(
            f"status IN {_ORDER_STATUSES}",
            name="ck_orders_status",
        ),
        CheckConstraint("subtotal_minor >= 0", name="ck_orders_subtotal_non_negative"),
        CheckConstraint("discount_minor >= 0", name="ck_orders_discount_non_negative"),
        CheckConstraint("total_minor >= 0", name="ck_orders_total_non_negative"),
        Index("ix_orders_customer_id", "customer_id"),
        Index("ix_orders_status", "status"),
    )

    order_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="PKR")
    subtotal_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    discount_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_minor: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    discount_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Full original request body for idempotency comparison
    request_body: Mapped[Any] = mapped_column(JSONB, nullable=False)
    # Stored 201 response for idempotent re-delivery
    response: Mapped[Any] = mapped_column(JSONB, nullable=False)
    # Payment gateway identifiers
    authorization_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    capture_id: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now, onupdate=_now)

    items: Mapped[list["OrderItem"]] = relationship(
        "OrderItem", back_populates="order", passive_deletes=True
    )


class OrderItem(Base):
    """Individual line item within an order."""

    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False, index=True
    )
    variant_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("product_variants.variant_id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    # Price at time of order (snapshot, variant price may change later)
    unit_price_minor: Mapped[int] = mapped_column(BigInteger, nullable=False)

    order: Mapped[Order] = relationship("Order", back_populates="items")

    __table_args__ = (
        CheckConstraint("quantity > 0", name="ck_order_items_quantity_positive"),
    )


# ===========================================================================
# domain_event_outbox
# ===========================================================================


class DomainEventOutbox(Base):
    """Transactional outbox for reliable async domain event publishing."""

    __tablename__ = "domain_event_outbox"
    __table_args__ = (
        Index("ix_domain_event_outbox_published", "published"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[Any] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


# ===========================================================================
# Roster tables
# ===========================================================================


class RosterLeague(Base):
    """Roster configuration: transfer window, squad constraints, positions.

    Distinct from the `leagues` table which drives fixture/standings;
    a RosterLeague record governs player registration rules.
    """

    __tablename__ = "roster_leagues"

    league_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    sport_id: Mapped[str] = mapped_column(String(64), nullable=False)
    window_open: Mapped[date] = mapped_column(Date, nullable=False)
    window_close: Mapped[date] = mapped_column(Date, nullable=False)
    max_squad_size: Mapped[int] = mapped_column(Integer, nullable=False)
    # e.g. {"goalkeeper": 1, "defender": 4, ...}
    required_positions: Mapped[Any] = mapped_column(JSONB, nullable=False, default=dict)

    __table_args__ = (
        CheckConstraint("max_squad_size > 0", name="ck_roster_leagues_max_squad_positive"),
        CheckConstraint("window_close >= window_open", name="ck_roster_leagues_window_order"),
    )


class RosterSquad(Base):
    """A club's squad within a given roster league."""

    __tablename__ = "roster_squads"
    __table_args__ = (
        UniqueConstraint("league_id", "club_id", name="uq_roster_squads_league_club"),
        Index("ix_roster_squads_league_id", "league_id"),
    )

    squad_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    league_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("roster_leagues.league_id", ondelete="CASCADE"), nullable=False
    )
    club_id: Mapped[str] = mapped_column(String(64), nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)


class RosterPlayer(Base):
    """Player registry entry for a roster league."""

    __tablename__ = "roster_players"
    __table_args__ = (
        Index("ix_roster_players_league_id", "league_id"),
    )

    player_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    league_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("roster_leagues.league_id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    position: Mapped[str] = mapped_column(String(64), nullable=False)


_REGISTRATION_TYPES = "('initial','transfer','loan','release')"


class RosterRegistration(Base):
    """Current registration state for a player in a league.

    player_id is the PK because each player has exactly one current
    registration state per league; history is stored in roster_audit_entries.
    """

    __tablename__ = "roster_registrations"
    __table_args__ = (
        CheckConstraint(
            f"registration_type IN {_REGISTRATION_TYPES}",
            name="ck_roster_registrations_type",
        ),
        Index("ix_roster_registrations_league_id", "league_id"),
        Index("ix_roster_registrations_squad_id", "squad_id"),
    )

    player_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("roster_players.player_id", ondelete="CASCADE"), primary_key=True
    )
    league_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("roster_leagues.league_id", ondelete="CASCADE"), nullable=False
    )
    squad_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("roster_squads.squad_id", ondelete="SET NULL"), nullable=True
    )
    # For loaned players: the squad they will return to after loan ends
    parent_squad_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    registration_type: Mapped[str] = mapped_column(String(32), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    loan_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    # e.g. "starter", "substitute", "reserve"
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    # e.g. "active", "loaned_out", "released", "deferred"
    state: Mapped[str] = mapped_column(String(32), nullable=False)


_AUDIT_ACTIONS = "('transfer','loan','release','loan_return')"


class RosterAuditEntry(Base):
    """Immutable audit history for roster actions.  Never updated after insert."""

    __tablename__ = "roster_audit_entries"
    __table_args__ = (
        CheckConstraint(f"action IN {_AUDIT_ACTIONS}", name="ck_roster_audit_action"),
        Index("ix_roster_audit_entries_player_id", "player_id"),
        Index("ix_roster_audit_entries_league_id", "league_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Human-readable audit reference like "au-0001"
    audit_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    player_id: Mapped[str] = mapped_column(String(64), nullable=False)
    league_id: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    from_squad_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    to_squad_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    effective_date: Mapped[date] = mapped_column(Date, nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    who: Mapped[str] = mapped_column(String(64), nullable=False)
    when_ts: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
    # Reason / notes
    why: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Correlates to the originating roster_requests.request_id
    request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    # Set when the move was deferred because a match is in progress
    blocking_match_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class RosterRequest(Base):
    """Idempotency store for roster API requests (request_id → stored response)."""

    __tablename__ = "roster_requests"

    request_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    request_body: Mapped[Any] = mapped_column(JSONB, nullable=False)
    status_code: Mapped[int] = mapped_column(Integer, nullable=False)
    response: Mapped[Any] = mapped_column(JSONB, nullable=False)


class RosterMatchInProgress(Base):
    """Tracks ongoing matches that block deferred roster transfers."""

    __tablename__ = "roster_matches_in_progress"
    __table_args__ = (
        UniqueConstraint("league_id", "match_id", name="uq_roster_mip_league_match"),
        Index("ix_roster_mip_league_id", "league_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    league_id: Mapped[str] = mapped_column(String(64), nullable=False)
    match_id: Mapped[str] = mapped_column(String(64), nullable=False)
    home_squad_id: Mapped[str] = mapped_column(String(64), nullable=False)
    away_squad_id: Mapped[str] = mapped_column(String(64), nullable=False)


# ===========================================================================
# offline_sync_actions
# ===========================================================================


class OfflineSyncAction(Base):
    """De-duplication store for offline sync actions.

    Composite PK (device_id, action_id) ensures each action is processed
    at most once per device regardless of how many times the client retries.
    """

    __tablename__ = "offline_sync_actions"
    __table_args__ = (
        Index("ix_offline_sync_actions_device_id", "device_id"),
    )

    device_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    action_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Stored per-action result as returned by /audit/v1/offline-sync
    result: Mapped[Any] = mapped_column(JSONB, nullable=False)
    processed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_now)
