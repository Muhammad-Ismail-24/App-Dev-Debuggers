"""Strict, unknown-field-tolerant request types for Part I section 5.7."""
from math import ceil, log2
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Identifier = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.:-]+$")]


class ContractModel(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore")


class Withdrawal(ContractModel):
    team_id: Identifier
    after_round: int = Field(ge=0)


class RoundRobinParams(ContractModel):
    legs: int = Field(default=1, ge=1, le=2)
    withdrawals: list[Withdrawal] = Field(default_factory=list)
    withdrawal_policy: Literal["void_all", "forfeit_remaining"] = "forfeit_remaining"


class HistoricalMatch(ContractModel):
    home: Identifier
    away: Identifier
    result: Literal["home", "away", "draw"]


class HistoricalRound(ContractModel):
    round: int = Field(ge=1)
    bye: Identifier | None = None
    matches: list[HistoricalMatch]


class SwissParams(ContractModel):
    total_rounds: int = Field(default=1, ge=1)
    round: int = Field(default=1, ge=1)
    history: list[HistoricalRound] = Field(default_factory=list)


class Result(ContractModel):
    match_id: Identifier
    winner: Identifier


class EliminationParams(ContractModel):
    third_place_match: bool = False
    bracket_reset: bool = True
    results: list[Result] = Field(default_factory=list)


class FixturesRequest(ContractModel):
    format: Literal["round_robin", "swiss", "single_elim", "double_elim"]
    teams: list[Identifier]
    params: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_format(self):
        n = len(self.teams)
        lower, upper = {"round_robin": (2, 40), "swiss": (2, 64),
                        "single_elim": (2, 128), "double_elim": (3, 128)}[self.format]
        if not lower <= n <= upper or len(set(self.teams)) != n:
            raise ValueError("teams: count outside format limits or duplicate identifiers")
        if self.format == "round_robin":
            p = RoundRobinParams.model_validate(self.params)
            count = (n if n % 2 else n - 1) * p.legs
            if any(w.team_id not in self.teams or w.after_round > count for w in p.withdrawals):
                raise ValueError("params.withdrawals: unknown team or round outside schedule")
        elif self.format == "swiss":
            p = SwissParams.model_validate({"total_rounds": ceil(log2(n)), **self.params})
            if not p.round <= p.total_rounds <= n - 1:
                raise ValueError("params.round/total_rounds: outside permitted range")
            if sorted(h.round for h in p.history) != list(range(1, p.round)):
                raise ValueError("params.history: must contain exactly all preceding rounds")
            for h in p.history:
                participants = [t for m in h.matches for t in (m.home, m.away)]
                if h.bye is not None:
                    participants.append(h.bye)
                if len(participants) != n or set(participants) != set(self.teams):
                    raise ValueError("params.history: each team must appear exactly once per round")
                if bool(n % 2) != (h.bye is not None):
                    raise ValueError("params.history.bye: inconsistent with team count")
        else:
            p = EliminationParams.model_validate(self.params)
            if len({r.match_id for r in p.results}) != len(p.results):
                raise ValueError("params.results: duplicate match result")
        self.params = p.model_dump()
        return self
