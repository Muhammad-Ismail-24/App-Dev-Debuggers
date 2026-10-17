"""Pydantic schemas for sport configurations — NaSCon '26 Platform (PDF §5.6)."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, ConfigDict, Field


class EventPeriodsSchema(BaseModel):
    """Period structure for 'event' scoring model."""

    model_config = ConfigDict(extra="ignore")

    count: int = Field(..., ge=1, description="Number of periods (e.g. 2 halves, 4 quarters)")
    duration_minutes: int = Field(..., ge=1, description="Duration of each period in minutes")


class InningsPeriodsSchema(BaseModel):
    """Period structure for 'innings' scoring model."""

    model_config = ConfigDict(extra="ignore")

    innings_per_team: int = Field(..., ge=1)
    overs_per_innings: int = Field(..., ge=1)
    balls_per_over: int = Field(..., ge=1)
    wickets_per_innings: int = Field(..., ge=1)


class RoundPeriodsSchema(BaseModel):
    """Period structure for 'round' scoring model."""

    model_config = ConfigDict(extra="ignore")

    best_of: int = Field(..., ge=1, description="Odd integer >= 1 (e.g. 3, 5)")


class EventScoringEventSchema(BaseModel):
    """Scoring event item definition for 'event' scoring model."""

    model_config = ConfigDict(extra="ignore")

    points: int = Field(..., ge=1)


class InningsScoringEventSchema(BaseModel):
    """Scoring event item definition for 'innings' scoring model."""

    model_config = ConfigDict(extra="ignore")

    runs: int = Field(..., ge=0)
    legal_ball: bool
    wicket: bool


class RoundScoringEventSchema(BaseModel):
    """Scoring event item definition for 'round' scoring model."""

    model_config = ConfigDict(extra="ignore")

    rounds: int = Field(..., ge=1)


class OvertimeConfigSchema(BaseModel):
    """Overtime configuration options."""

    model_config = ConfigDict(extra="ignore")

    policy: Literal["none", "extra_time", "shootout", "golden_score", "super_over"]
    duration_minutes: int | None = Field(default=None, ge=0)


class RosterConfigSchema(BaseModel):
    """Roster constraints."""

    model_config = ConfigDict(extra="ignore")

    min_squad_size: int = Field(..., ge=1)
    max_squad_size: int = Field(..., ge=1)
    required_positions: dict[str, int] = Field(default_factory=dict)


class SportCreateResponse(BaseModel):
    """Response returned upon successful creation: HTTP 201 (PDF §5.6)."""

    model_config = ConfigDict(extra="ignore")

    sport_id: str
    status: str = "created"
    config: dict[str, Any]
