"""Pydantic schemas for roster endpoints — NaSCon '26 Platform (PDF §5.11).

These are used ONLY as `response_model` annotations on the FastAPI routes.
All *request* validation is performed manually inside the service layer so that
the exact 8-step rule ordering required by the PDF can be enforced precisely.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------


class RosterSetupResponse(BaseModel):
    """Response for POST /audit/v1/roster/setup — HTTP 201."""

    model_config = ConfigDict(extra="ignore")

    league_id: str
    status: str  # always "configured"
    squad_counts: dict[str, int]


# ---------------------------------------------------------------------------
# Shared sub-schemas
# ---------------------------------------------------------------------------


class AuditEntrySchema(BaseModel):
    """Immutable audit entry as returned on the wire (PDF §5.11).

    DB column `when_ts` maps to wire key `when`.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    audit_id: str
    action: str
    player_id: str
    league_id: str
    from_squad_id: str | None
    to_squad_id: str | None
    effective_date: str
    state: str
    who: str
    when: str
    why: str | None


class RegistrationSchema(BaseModel):
    """Snapshot of a player's current registration (null for released players)."""

    model_config = ConfigDict(extra="ignore")

    player_id: str
    league_id: str
    squad_id: str | None
    parent_squad_id: str | None
    registration_type: str
    start_date: str
    loan_end_date: str | None
    role: str


# ---------------------------------------------------------------------------
# Transfer
# ---------------------------------------------------------------------------


class TransferResponse(BaseModel):
    """Response for POST /audit/v1/roster/transfer — HTTP 201 (200 on replay)."""

    model_config = ConfigDict(extra="ignore")

    request_id: str
    status: str  # always "accepted"
    state: str
    blocking_match_id: str | None
    registration: RegistrationSchema | None
    audit_entry: AuditEntrySchema


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------


class PlayerHistoryResponse(BaseModel):
    """Response for GET /audit/v1/roster/history/{player_id} — HTTP 200."""

    model_config = ConfigDict(extra="ignore")

    player_id: str
    as_of: str
    league_id: str
    current_squad_id: str | None
    parent_squad_id: str | None
    history: list[AuditEntrySchema]
