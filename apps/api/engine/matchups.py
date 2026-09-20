from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any


def matchup_calendar_day(value: datetime | str) -> str:
    if isinstance(value, datetime):
        stamp = value if value.tzinfo else value.replace(tzinfo=UTC)
        return stamp.astimezone(UTC).date().isoformat()
    return value[:10]


def game_calendar_day(game: dict[str, Any]) -> str:
    value = game["date"]
    if isinstance(value, datetime):
        return matchup_calendar_day(value)
    return matchup_calendar_day(str(value))


def matchup_pair_key(league: str, day: str, home_team_id: int, away_team_id: int) -> str:
    low = min(home_team_id, away_team_id)
    high = max(home_team_id, away_team_id)
    return f"{league}:{day}:{low}:{high}"


def dedupe_mirror_matchups(games: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop A@B / B@A mirrors on the same slate; keep same-orientation rematches."""
    kept_by_pair: dict[str, list[tuple[int, int]]] = {}
    out: list[dict[str, Any]] = []
    for game in games:
        home = int(game["home_team_id"])
        away = int(game["away_team_id"])
        day = game_calendar_day(game)
        key = matchup_pair_key(str(game["league"]), day, home, away)
        kept = kept_by_pair.setdefault(key, [])
        if any(prior_home == away and prior_away == home for prior_home, prior_away in kept):
            continue
        kept.append((home, away))
        out.append(game)
    return out
