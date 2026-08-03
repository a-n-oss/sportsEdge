import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Game, Team

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


def namespaced_team_id(league: str, espn_team_id: int) -> int:
    """Return a stable PK for an ESPN team that is unique across leagues."""
    try:
        offset = LEAGUE_ID_OFFSET[league.lower()]
    except KeyError as exc:
        raise ValueError(f"Unsupported league: {league}") from exc
    return offset + espn_team_id


async def fetch_scoreboard(league: str, date: str | None = None) -> dict[str, Any]:
    sport, espn_league = LEAGUE_MAP[league.lower()]
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}/scoreboard"
    params = {}
    if date:
        params["dates"] = date

    async with get_client() as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        return response.json()


async def sync_games(league: str, session: AsyncSession, date: str | None = None) -> None:
    league_key = league.lower()
    data = await fetch_scoreboard(league_key, date)

    teams_to_upsert = []
    games_to_upsert = []

    for event in data.get("events", []):
        game_id = int(event["id"])
        game_date_str = event["date"]
        game_date = datetime.strptime(game_date_str, "%Y-%m-%dT%H:%MZ").replace(tzinfo=UTC)

        status_name = event.get("status", {}).get("type", {}).get("name", "STATUS_UNKNOWN")

        competition = event["competitions"][0]
        home_competitor = next((c for c in competition["competitors"] if c["homeAway"] == "home"), None)
        away_competitor = next((c for c in competition["competitors"] if c["homeAway"] == "away"), None)

        if not home_competitor or not away_competitor:
            continue

        home_team = home_competitor["team"]
        away_team = away_competitor["team"]
        home_team_id = namespaced_team_id(league_key, int(home_team["id"]))
        away_team_id = namespaced_team_id(league_key, int(away_team["id"]))

        teams_to_upsert.append(
            {
                "id": home_team_id,
                "league": league_key,
                "name": home_team.get("name", ""),
                "abbreviation": home_team.get("abbreviation", ""),
            }
        )
        teams_to_upsert.append(
            {
                "id": away_team_id,
                "league": league_key,
                "name": away_team.get("name", ""),
                "abbreviation": away_team.get("abbreviation", ""),
            }
        )

        home_score = int(home_competitor["score"]) if "score" in home_competitor and home_competitor["score"] else None
        away_score = int(away_competitor["score"]) if "score" in away_competitor and away_competitor["score"] else None

        games_to_upsert.append(
            {
                "id": game_id,
                "league": league_key,
                "date": game_date,
                "home_team_id": home_team_id,
                "away_team_id": away_team_id,
                "home_score": home_score,
                "away_score": away_score,
                "status": status_name,
            }
        )

    if teams_to_upsert:
        # De-duplicate teams
        unique_teams = {t["id"]: t for t in teams_to_upsert}.values()

        team_stmt = insert(Team).values(list(unique_teams))
        team_stmt = team_stmt.on_conflict_do_update(
            index_elements=["id"],
            set_={
                "league": team_stmt.excluded.league,
                "name": team_stmt.excluded.name,
                "abbreviation": team_stmt.excluded.abbreviation,
            },
        )
        await session.execute(team_stmt)

    if games_to_upsert:
        game_stmt = insert(Game).values(games_to_upsert)
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

    fetch_run = FetchRun(timestamp=datetime.now(UTC), league=league_key, status="success")
    session.add(fetch_run)

    await session.commit()

    # Run the Elo and Prediction pipeline
    from engine.process import run_elo_pipeline

    await run_elo_pipeline(session, league_key)
