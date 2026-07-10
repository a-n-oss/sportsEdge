import logging
from datetime import datetime, timezone
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
    data = await fetch_scoreboard(league, date)

    teams_to_upsert = []
    games_to_upsert = []

    for event in data.get("events", []):
        game_id = int(event["id"])
        game_date_str = event["date"]
        game_date = datetime.strptime(game_date_str, "%Y-%m-%dT%H:%MZ").replace(tzinfo=timezone.utc)

        status_name = event.get("status", {}).get("type", {}).get("name", "STATUS_UNKNOWN")

        competition = event["competitions"][0]
        home_competitor = next((c for c in competition["competitors"] if c["homeAway"] == "home"), None)
        away_competitor = next((c for c in competition["competitors"] if c["homeAway"] == "away"), None)

        if not home_competitor or not away_competitor:
            continue

        home_team = home_competitor["team"]
        away_team = away_competitor["team"]

        teams_to_upsert.append(
            {
                "id": int(home_team["id"]),
                "league": league,
                "name": home_team.get("name", ""),
                "abbreviation": home_team.get("abbreviation", ""),
            }
        )
        teams_to_upsert.append(
            {
                "id": int(away_team["id"]),
                "league": league,
                "name": away_team.get("name", ""),
                "abbreviation": away_team.get("abbreviation", ""),
            }
        )

        home_score = int(home_competitor["score"]) if "score" in home_competitor and home_competitor["score"] else None
        away_score = int(away_competitor["score"]) if "score" in away_competitor and away_competitor["score"] else None

        games_to_upsert.append(
            {
                "id": game_id,
                "league": league,
                "date": game_date,
                "home_team_id": int(home_team["id"]),
                "away_team_id": int(away_team["id"]),
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
                "status": game_stmt.excluded.status,
                "home_score": game_stmt.excluded.home_score,
                "away_score": game_stmt.excluded.away_score,
                "date": game_stmt.excluded.date,
            },
        )
        await session.execute(game_stmt)

    fetch_run = FetchRun(timestamp=datetime.now(timezone.utc), league=league, status="success")
    session.add(fetch_run)

    await session.commit()
