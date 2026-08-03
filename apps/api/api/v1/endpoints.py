from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.deps import verify_admin
from db.models import FetchRun, Game, Rating, RatingHistory, Team
from db.session import get_db
from fetchers.espn import LEAGUE_MAP, sync_games

router = APIRouter(prefix="/api/v1", tags=["v1"])


@router.get("/leagues")
async def get_leagues():
    return list(LEAGUE_MAP.keys())


@router.get("/games")
async def get_games(
    league: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    stmt = (
        select(Game)
        .options(
            selectinload(Game.home_team),
            selectinload(Game.away_team),
            selectinload(Game.prediction),
        )
        .order_by(Game.date.desc())
        .limit(limit)
    )
    if league:
        stmt = stmt.where(Game.league == league.lower())
    if status:
        stmt = stmt.where(Game.status == status)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/games/{game_id}")
async def get_game(game_id: int, db: AsyncSession = Depends(get_db)):  # noqa: B008
    stmt = (
        select(Game)
        .options(
            selectinload(Game.home_team),
            selectinload(Game.away_team),
            selectinload(Game.prediction),
        )
        .where(Game.id == game_id)
    )
    result = await db.execute(stmt)
    game = result.scalar_one_or_none()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return game


@router.get("/teams")
async def get_teams(
    league: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    stmt = select(Team).order_by(Team.name)
    if league:
        stmt = stmt.where(Team.league == league.lower())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/teams/{team_id}")
async def get_team(team_id: int, db: AsyncSession = Depends(get_db)):  # noqa: B008
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.get("/teams/{team_id}/rating-history")
async def get_team_rating_history(team_id: int, db: AsyncSession = Depends(get_db)):  # noqa: B008
    stmt = select(RatingHistory).where(RatingHistory.team_id == team_id).order_by(RatingHistory.date.asc())
    result = await db.execute(stmt)
    history = result.scalars().all()
    if not history:
        raise HTTPException(status_code=404, detail="Rating history not found")
    return history


@router.get("/leagues/{league}/standings")
async def get_league_standings(league: str, db: AsyncSession = Depends(get_db)):  # noqa: B008
    league_key = league.lower()
    if league_key not in LEAGUE_MAP:
        raise HTTPException(status_code=404, detail="League not found")

    # Prefer current Rating rows; fall back to latest RatingHistory per team
    rating_stmt = (
        select(Team, Rating.elo_rating, Rating.last_updated)
        .join(Rating, Rating.team_id == Team.id)
        .where(Team.league == league_key)
        .order_by(Rating.elo_rating.desc())
    )
    rating_result = await db.execute(rating_stmt)
    rows = rating_result.all()

    standings: list[dict] = []
    if rows:
        for rank, (team, elo, last_updated) in enumerate(rows, start=1):
            standings.append(
                {
                    "rank": rank,
                    "team_id": team.id,
                    "league": team.league,
                    "name": team.name,
                    "abbreviation": team.abbreviation,
                    "elo_rating": elo,
                    "last_updated": last_updated.isoformat() if last_updated else None,
                    "trend": None,
                }
            )
        return standings

    # Fallback: latest history point per team
    history_stmt = (
        select(RatingHistory)
        .join(Team, Team.id == RatingHistory.team_id)
        .where(Team.league == league_key)
        .order_by(RatingHistory.team_id, RatingHistory.date.desc())
    )
    history_result = await db.execute(history_stmt)
    latest_by_team: dict[int, RatingHistory] = {}
    for rh in history_result.scalars().all():
        if rh.team_id not in latest_by_team:
            latest_by_team[rh.team_id] = rh

    if not latest_by_team:
        return []

    team_ids = list(latest_by_team.keys())
    teams_result = await db.execute(select(Team).where(Team.id.in_(team_ids)))
    teams = {t.id: t for t in teams_result.scalars().all()}

    ordered = sorted(latest_by_team.values(), key=lambda r: r.elo_rating, reverse=True)
    for rank, rh in enumerate(ordered, start=1):
        team = teams[rh.team_id]
        standings.append(
            {
                "rank": rank,
                "team_id": team.id,
                "league": team.league,
                "name": team.name,
                "abbreviation": team.abbreviation,
                "elo_rating": rh.elo_rating,
                "last_updated": rh.date.isoformat() if rh.date else None,
                "trend": None,
            }
        )
    return standings


@router.get("/meta/last-refresh")
async def get_last_refresh(db: AsyncSession = Depends(get_db)):  # noqa: B008
    stmt = select(FetchRun).order_by(FetchRun.timestamp.desc()).limit(1)
    result = await db.execute(stmt)
    run = result.scalar_one_or_none()
    if not run:
        return {"timestamp": None, "league": None, "status": None}
    return {
        "timestamp": run.timestamp.isoformat() if run.timestamp else None,
        "league": run.league,
        "status": run.status,
    }


def _compute_accuracy(games: list[Game]) -> dict:
    """Brier score + calibration from completed games with predictions."""
    scored: list[tuple[float, float]] = []  # (predicted_home, actual_home)

    for game in games:
        pred = game.prediction
        if not pred or game.home_score is None or game.away_score is None:
            continue
        if game.home_score == game.away_score:
            # Treat draws as 0.5 for home outcome in calibration/Brier
            actual = 0.5
        else:
            actual = 1.0 if game.home_score > game.away_score else 0.0
        scored.append((pred.home_win_prob, actual))

    if not scored:
        return {"brier_score": 0.25, "calibration": [], "sample_size": 0}

    brier = sum((p - a) ** 2 for p, a in scored) / len(scored)

    # Calibration bins by predicted probability
    bins: dict[float, list[float]] = defaultdict(list)
    for predicted, actual in scored:
        # Round to nearest 0.1 bin center
        bin_key = round(predicted * 10) / 10
        bin_key = min(0.9, max(0.1, bin_key))
        bins[bin_key].append(actual)

    calibration = [
        {
            "predicted": key,
            "actual": sum(vals) / len(vals),
        }
        for key, vals in sorted(bins.items())
    ]

    return {
        "brier_score": round(brier, 4),
        "calibration": calibration,
        "sample_size": len(scored),
    }


@router.get("/accuracy")
async def get_accuracy(db: AsyncSession = Depends(get_db)):  # noqa: B008
    stmt = (
        select(Game)
        .options(selectinload(Game.prediction))
        .where(Game.status == "completed")
        .where(Game.home_score.is_not(None))
        .where(Game.away_score.is_not(None))
    )
    result = await db.execute(stmt)
    games = result.scalars().all()
    # Only games that have predictions
    games_with_pred = [g for g in games if g.prediction is not None]
    return _compute_accuracy(games_with_pred)


@router.post("/admin/refresh")
async def admin_refresh(
    admin_token: str = Depends(verify_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    for league in LEAGUE_MAP.keys():
        await sync_games(league, db)
    return {"status": "refresh_completed"}
