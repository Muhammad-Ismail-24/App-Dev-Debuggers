from typing import Any
from pydantic import BaseModel, ConfigDict


class EventResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    event_id: str
    match_id: str
    type: str
    sequence: int
    match_version: int
    signature: str


class ScoreResponse(BaseModel):
    model_config = ConfigDict(extra="allow")
    match_id: str
    sport_id: str
    league_id: str | None
    status: str
    outcome: str
    winner_team_id: str | None
    tiebreak_winner_team_id: str | None
    home: dict[str, Any]
    away: dict[str, Any]
    version: int
    events: list[dict[str, Any]]
