"""Read-only adapter contract. Ismail implements these over his repositories."""
from typing import Protocol


class StandingsSource(Protocol):
    def get_league(self, league_id: str) -> dict | None:
        """Section 5.8 config, with defaults (including reset lots_seed) resolved."""
        ...

    def get_sport(self, sport_id: str) -> dict:
        """Section 5.6 config."""
        ...

    def get_score_projection(self, match_id: str) -> dict:
        """Fresh section 5.9 projection rebuilt by the authoritative scorer."""
        ...
