"""Pydantic schemas for league registration — NaSCon '26 Platform (PDF §5.8)."""

from __future__ import annotations

from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class FixtureItemSchema(BaseModel):
    """Fixture item within league registration request."""

    model_config = ConfigDict(extra="ignore")

    match_id: str = Field(..., description="Unique match identifier")
    home: str = Field(..., description="Home team identifier")
    away: str = Field(..., description="Away team identifier")


class PointsConfigSchema(BaseModel):
    """Points system configuration."""

    model_config = ConfigDict(extra="ignore")

    win: int = Field(default=3, description="Points awarded for a win")
    draw: int = Field(default=1, description="Points awarded for a draw")
    loss: int = Field(default=0, description="Points awarded for a loss")


class QualificationConfigSchema(BaseModel):
    """Playoff qualification configuration."""

    model_config = ConfigDict(extra="ignore")

    spots: int = Field(..., ge=1, description="Number of teams qualifying for playoffs")


class LeagueCreateRequest(BaseModel):
    """Request schema for POST /audit/v1/leagues (PDF §5.8)."""

    model_config = ConfigDict(extra="ignore")

    league_id: str = Field(..., description="Unique league identifier")
    sport_id: str = Field(..., description="Referenced sport identifier")
    teams: list[str] = Field(..., min_length=2, max_length=40, description="Unique team identifiers (2-40)")
    fixtures: list[FixtureItemSchema] = Field(..., description="List of match fixtures")
    points: PointsConfigSchema | None = Field(default=None, description="Optional points configuration")
    tie_break_order: list[str] | None = Field(default=None, description="Optional tie-break criteria order")
    qualification: QualificationConfigSchema = Field(..., description="Qualification rules")
    lots_seed: int | None = Field(default=None, description="Optional drawing of lots random seed")


class LeagueCreateResponse(BaseModel):
    """Response returned upon successful league registration: HTTP 201 (PDF §5.8)."""

    model_config = ConfigDict(extra="ignore")

    league_id: str
    status: str = "created"
    team_count: int
    fixture_count: int
