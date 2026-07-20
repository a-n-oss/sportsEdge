from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.deps import verify_admin
from db.models import Game, RatingHistory, Team
from db.session import get_db
from fetchers.espn import LEAGUE_MAP, sync_games

router = APIRouter(prefix="/api/v1", tags=["v1"])


@router.get("/leagues")
async def get_leagues():
    return list(LEAGUE_MAP.keys())


@router.get("/games")
async def get_games(db: AsyncSession = Depends(get_db)):  # noqa: B008
    stmt = (
        select(Game)
        .options(
            selectinload(Game.home_team),
            selectinload(Game.away_team),
            selectinload(Game.prediction),
        )
        .order_by(Game.date.desc())
        .limit(100)
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/teams")
async def get_teams(db: AsyncSession = Depends(get_db)):  # noqa: B008
    result = await db.execute(select(Team).order_by(Team.name))
    return result.scalars().all()


@router.get("/teams/{team_id}")
async def get_team(team_id: int, db: AsyncSession = Depends(get_db)):  # noqa: B008
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.get("/teams/{team_id}/rating-history")
async def get_team_rating_history(team_id: int, db: AsyncSession = Depends(get_db)):  # noqa: B008
    stmt = select(RatingHistory).where(RatingHistory.team_id == team_id).order_by(RatingHistory.date.asc())
    result = await db.execute(stmt)
    history = result.scalars().all()
    if not history:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Rating history not found")
    return history


@router.get("/accuracy")
async def get_accuracy():
    # Placeholder for actual accuracy calculation logic
    # In a real scenario, this would query games with predictions and calculate the brier score
    return {
        "brier_score": 0.21,
        "calibration": [
            {"predicted": 0.1, "actual": 0.12},
            {"predicted": 0.5, "actual": 0.48},
            {"predicted": 0.9, "actual": 0.89},
        ],
    }


@router.post("/admin/refresh")
async def admin_refresh(
    admin_token: str = Depends(verify_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    # Trigger fetch for all leagues
    for league in LEAGUE_MAP.keys():
        await sync_games(league, db)
    return {"status": "refresh_completed"}
