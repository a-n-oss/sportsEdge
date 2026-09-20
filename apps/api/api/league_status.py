from collections import defaultdict
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Game, Rating, Team
from engine.league_readiness import is_league_ready
from fetchers.espn import LEAGUE_MAP

UPCOMING_STATUSES = ("STATUS_SCHEDULED", "scheduled")


async def league_status_rows(session: AsyncSession) -> list[dict[str, str | bool]]:
    rating_stmt = select(Team.id, Team.league, Rating.elo_rating).join(Rating, Rating.team_id == Team.id)
    rating_rows = (await session.execute(rating_stmt)).all()

    ratings_by_league: dict[str, list[float]] = defaultdict(list)
    elo_by_team: dict[int, float] = {}
    for team_id, league, elo in rating_rows:
        ratings_by_league[league].append(elo)
        elo_by_team[team_id] = elo

    now = datetime.now(UTC)
    games_stmt = select(Game.league, Game.home_team_id, Game.away_team_id).where(
        Game.status.in_(UPCOMING_STATUSES),
        Game.date >= now,
    )
    pairs_by_league: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for league, home_id, away_id in (await session.execute(games_stmt)).all():
        home = elo_by_team.get(home_id)
        away = elo_by_team.get(away_id)
        if home is None or away is None:
            continue
        pairs_by_league[league].append((home, away))

    return [
        {
            "key": key,
            "ready": is_league_ready(
                ratings=ratings_by_league.get(key, []),
                upcoming_elo_pairs=pairs_by_league.get(key, []),
            ),
        }
        for key in LEAGUE_MAP
    ]
