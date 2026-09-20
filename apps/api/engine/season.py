from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Rating, RatingHistory, Team
from engine.elo import EloEngine
from fetchers.espn import current_season_start

REGRESSION_STATUS_PREFIX = "season_regression:"


def regression_run_status(season_start: date) -> str:
    return f"{REGRESSION_STATUS_PREFIX}{season_start.isoformat()}"


async def apply_season_regression(
    session: AsyncSession,
    league: str,
    *,
    as_of: date | None = None,
    now: datetime | None = None,
) -> dict[str, object]:
    """Regress current Elo 25% toward 1500 for one league season.

    Trigger this explicitly via ``POST /api/v1/admin/regress-season``. It is
    not called from ESPN sync. A FetchRun whose status is
    ``season_regression:<season-start>`` makes the call idempotent for that
    season window.
    """
    league_key = league.lower()
    season_start = current_season_start(league_key, as_of)
    marker = regression_run_status(season_start)
    existing = (
        (await session.execute(select(FetchRun).where(FetchRun.league == league_key, FetchRun.status == marker)))
        .scalars()
        .first()
    )
    if existing is not None:
        return {
            "status": "season_regression_already_applied",
            "league": league_key,
            "season_start": season_start.isoformat(),
            "teams_updated": 0,
        }

    moment = now or datetime.now(UTC)
    ratings = (await session.execute(select(Rating).join(Team).where(Team.league == league_key))).scalars().all()
    for rating in ratings:
        rating.elo_rating = EloEngine.regress_rating(rating.elo_rating)
        rating.last_updated = moment
        session.add(
            RatingHistory(
                team_id=rating.team_id,
                game_id=None,
                elo_rating=rating.elo_rating,
                date=moment,
            )
        )

    session.add(FetchRun(timestamp=moment, league=league_key, status=marker))
    await session.commit()
    return {
        "status": "season_regression_applied",
        "league": league_key,
        "season_start": season_start.isoformat(),
        "teams_updated": len(ratings),
    }
