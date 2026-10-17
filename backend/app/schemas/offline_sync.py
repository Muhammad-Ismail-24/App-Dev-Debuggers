"""Pydantic schemas for offline sync endpoint — PDF §5.14."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class SyncActionItem(BaseModel):
    """A single queued action in the sync envelope."""

    model_config = ConfigDict(extra="forbid")

    action_id: str
    type: Literal["score_event", "roster_transfer"]
    queued_at: str
    base_version: int = Field(ge=0)
    payload: dict[str, Any]


class OfflineSyncRequest(BaseModel):
    """Request envelope for POST /audit/v1/offline-sync (PDF §5.14)."""

    model_config = ConfigDict(extra="forbid")

    device_id: str
    actions: list[SyncActionItem] = Field(min_length=1, max_length=100)


class SyncActionResult(BaseModel):
    """Result of processing one offline sync action."""

    model_config = ConfigDict(extra="ignore")

    action_id: str
    status: Literal["applied", "rejected", "duplicate"]
    resolution: Literal["appended", "rebased_append", "server_wins", "skipped_duplicate"]
    error_code: str | None = None
    processed_order: int
    server_version: int
    signature: str | None = None


class SyncSummary(BaseModel):
    """Summary counts for the sync batch."""

    model_config = ConfigDict(extra="ignore")

    applied: int
    rejected: int
    duplicate: int


class OfflineSyncResponse(BaseModel):
    """Response body for POST /audit/v1/offline-sync — HTTP 200."""

    model_config = ConfigDict(extra="ignore")

    device_id: str
    results: list[SyncActionResult]
    summary: SyncSummary
