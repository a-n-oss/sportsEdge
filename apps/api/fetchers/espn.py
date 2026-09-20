import logging
from collections.abc import Awaitable, Callable, Iterator
from datetime import UTC, date, datetime, timedelta
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Game, Team
from engine.process import run_elo_pipeline

from .client import get_client

logger = logging.getLogger(__name__)

LEAGUE_MAP = {
    "nfl": ("football", "nfl"),
    "nba": ("basketball", "nba"),
    "mlb": ("baseball", "mlb"),
    "nhl": ("hockey", "nhl"),
    "epl": ("soccer", "eng.1"),
}

# ESPN team IDs are only unique within a sport/league. Namespace them so
# MLB #14 (Blue Jays) and NBA #14 (e.g. Raptors/etc.) do not collide as PKs.
LEAGUE_ID_OFFSET = {
    "nfl": 1_000_000,
    "nba": 2_000_000,
    "mlb": 3_000_000,
    "nhl": 4_000_000,
    "epl": 5_000_000,
}

# start_month, start_day, end_month, end_day, spans_calendar_year
_SEASON_CALENDAR = {
    "nba": (10, 1, 6, 30, True),
    "nhl": (10, 1, 6, 30, True),
    "nfl": (9, 1, 2, 15, True),
    "mlb": (3, 20, 11, 5, False),
    "epl": (8, 1, 5, 31, True),
}


def namespaced_team_id(league: str, espn_team_id: int) -> int:
    """Return a stable PK for an ESPN team that is unique across leagues."""
    try:
        offset = LEAGUE_ID_OFFSET[league.lower()]
    except KeyError as exc:
        raise ValueError(f"Unsupported league: {league}") from exc
    return offset + espn_team_id


def _season_bounds(league: str, as_of: date) -> tuple[date, date]:
    try:
        start_m, start_d, end_m, end_d, spans = _SEASON_CALENDAR[league]
    except KeyError as exc:
        raise ValueError(f"Unsupported league: {league}") from exc

    if spans:
        in_new_season = as_of.month > start_m or (as_of.month == start_m and as_of.day >= start_d)
        if in_new_season:
            return date(as_of.year, start_m, start_d), date(as_of.year + 1, end_m, end_d)
        return date(as_of.year - 1, start_m, start_d), date(as_of.year, end_m, end_d)

    before_open = as_of.month < start_m or (as_of.month == start_m and as_of.day < start_d)
    if before_open:
        return date(as_of.year - 1, start_m, start_d), date(as_of.year - 1, end_m, end_d)
    return date(as_of.year, start_m, start_d), date(as_of.year, end_m, end_d)


def current_season_window(league: str, as_of: date | None = None) -> tuple[date, date]:
    """Inclusive current-season window, clipped so `end` is never in the future."""
    as_of = as_of or datetime.now(UTC).date()
    start, season_end = _season_bounds(league.lower(), as_of)
    return start, min(season_end, as_of)


MAX_BACKFILL_DAYS = 400


def resolve_backfill_window(
    league: str,
    from_date: date | None,
    to_date: date | None,
    as_of: date | None = None,
) -> tuple[date, date]:
    """Resolve an admin backfill window: custom ISO range or the current season."""
    if from_date is None and to_date is None:
        return current_season_window(league, as_of)
    if from_date is None or to_date is None:
        raise ValueError("both from and to are required when specifying a custom range")
    if from_date > to_date:
        raise ValueError("from must be on or before to")
    span = (to_date - from_date).days + 1
    if span > MAX_BACKFILL_DAYS:
        raise ValueError(f"range cannot exceed {MAX_BACKFILL_DAYS} days")
    return from_date, to_date


def iter_dates(start: date, end: date) -> Iterator[date]:
    if start > end:
        raise ValueError("start must be on or before end")
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


async def fetch_teams(league: str) -> dict[str, Any]:
    sport, espn_league = LEAGUE_MAP[league.lower()]
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}/teams"
    async with get_client() as client:
        response = await client.get(url, params={"limit": 1000})
        response.raise_for_status()
        return response.json()


def parse_espn_teams(league: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    league_key = league.lower()
    teams: list[dict[str, Any]] = []
    for sport in payload.get("sports", []):
        for lg in sport.get("leagues", []):
            for entry in lg.get("teams", []):
                team = entry.get("team", entry)
                espn_id = team.get("id")
                if not espn_id:
                    continue
                teams.append(
                    {
                        "id": namespaced_team_id(league_key, int(espn_id)),
                        "league": league_key,
                        "name": team.get("name") or team.get("displayName") or "",
                        "abbreviation": team.get("abbreviation") or "",
                    }
                )
    return teams


async def upsert_teams(session: AsyncSession, teams: list[dict[str, Any]]) -> None:
    if not teams:
        return
    unique_teams = list({t["id"]: t for t in teams}.values())
    team_stmt = insert(Team).values(unique_teams)
    team_stmt = team_stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "league": team_stmt.excluded.league,
            "name": team_stmt.excluded.name,
            "abbreviation": team_stmt.excluded.abbreviation,
        },
    )
    await session.execute(team_stmt)


async def upsert_games(session: AsyncSession, games: list[dict[str, Any]]) -> None:
    if not games:
        return
    game_stmt = insert(Game).values(games)
    game_stmt = game_stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "league": game_stmt.excluded.league,
            "status": game_stmt.excluded.status,
            "home_score": game_stmt.excluded.home_score,
            "away_score": game_stmt.excluded.away_score,
            "date": game_stmt.excluded.date,
            "home_team_id": game_stmt.excluded.home_team_id,
            "away_team_id": game_stmt.excluded.away_team_id,
        },
    )
    await session.execute(game_stmt)


async def sync_league_teams(league: str, session: AsyncSession) -> int:
    """Upsert the full ESPN team list for a league. Returns the number of teams written."""
    league_key = league.lower()
    payload = await fetch_teams(league_key)
    teams = parse_espn_teams(league_key, payload)
    await upsert_teams(session, teams)
    await session.commit()
    return len(teams)


async def fetch_scoreboard(league: str, board_date: str | None = None) -> dict[str, Any]:
    sport, espn_league = LEAGUE_MAP[league.lower()]
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}/scoreboard"
    params = {}
    if board_date:
        params["dates"] = board_date

    async with get_client() as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


def _competitor_score(competitor: dict[str, Any]) -> int | None:
    raw = competitor.get("score")
    if raw in (None, ""):
        return None
    return int(raw)


def _team_row(league_key: str, team: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": namespaced_team_id(league_key, int(team["id"])),
        "league": league_key,
        "name": team.get("name", ""),
        "abbreviation": team.get("abbreviation", ""),
    }


def _parse_scoreboard_event(
    league_key: str, event: dict[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, Any]] | None:
    # TODO(#1): Game PKs still use raw ESPN event IDs. Unlike team IDs, event IDs
    # are ~9-digit values near the PostgreSQL INTEGER ceiling, so LEAGUE_ID_OFFSET
    # cannot safely namespace them without a BIGINT migration and a data reset of
    # games/predictions/rating_history. Deferred from the historical-backfill PR.
    game_id = int(event["id"])
    game_date = datetime.strptime(event["date"], "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC)
    status_name = event.get("status", {}).get("type", {}).get("name", "STATUS_UNKNOWN")

    competition = event["competitions"][0]
    home_competitor = next((c for c in competition["competitors"] if c["homeAway"] == "home"), None)
    away_competitor = next((c for c in competition["competitors"] if c["homeAway"] == "away"), None)
    if not home_competitor or not away_competitor:
        return None

    home_row = _team_row(league_key, home_competitor["team"])
    away_row = _team_row(league_key, away_competitor["team"])
    game = {
        "id": game_id,
        "league": league_key,
        "date": game_date,
        "home_team_id": home_row["id"],
        "away_team_id": away_row["id"],
        "home_score": _competitor_score(home_competitor),
        "away_score": _competitor_score(away_competitor),
        "status": status_name,
    }
    return [home_row, away_row], game


def parse_scoreboard(league: str, payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    league_key = league.lower()
    teams: list[dict[str, Any]] = []
    games: list[dict[str, Any]] = []
    for event in payload.get("events", []):
        parsed = _parse_scoreboard_event(league_key, event)
        if parsed is None:
            continue
        event_teams, game = parsed
        teams.extend(event_teams)
        games.append(game)
    return teams, games


async def ingest_scoreboard(league: str, session: AsyncSession, board_date: str | None = None) -> int:
    data = await fetch_scoreboard(league, board_date)
    teams, games = parse_scoreboard(league, data)
    await upsert_teams(session, teams)
    await upsert_games(session, games)
    return len(games)


async def _record_fetch_run(session: AsyncSession, league: str, status: str) -> None:
    session.add(FetchRun(timestamp=datetime.now(UTC), league=league, status=status))
    await session.commit()


async def _run_audited[T](session: AsyncSession, league: str, work: Callable[[], Awaitable[T]]) -> T:
    try:
        result = await work()
        await _record_fetch_run(session, league, "success")
        return result
    except Exception:
        logger.exception("ESPN sync failed for %s", league)
        await session.rollback()
        await _record_fetch_run(session, league, "error")
        raise


async def sync_games(league: str, session: AsyncSession, board_date: str | None = None) -> None:
    league_key = league.lower()

    async def work() -> None:
        await sync_league_teams(league_key, session)
        await ingest_scoreboard(league_key, session, board_date)
        await session.commit()
        await run_elo_pipeline(session, league_key)

    await _run_audited(session, league_key, work)


async def backfill_games(league: str, session: AsyncSession, start: date, end: date) -> dict[str, Any]:
    """Sync roster + each day's scoreboard from start through end (inclusive), then Elo."""
    league_key = league.lower()
    days = list(iter_dates(start, end))

    async def work() -> dict[str, Any]:
        await sync_league_teams(league_key, session)
        for day in days:
            await ingest_scoreboard(league_key, session, day.strftime("%Y%m%d"))
            await session.commit()
        await run_elo_pipeline(session, league_key)
        return {
            "league": league_key,
            "from": start.isoformat(),
            "to": end.isoformat(),
            "days": len(days),
            "status": "success",
        }

    return await _run_audited(session, league_key, work)
