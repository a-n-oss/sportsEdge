import logging
from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.deps import verify_admin
from api.league_status import league_status_rows
from db.models import FetchRun, Game, Rating, RatingHistory, Team
from db.session import get_db
from engine.game_status import COMPLETED_STATUSES, expand_status_filter
from engine.season import apply_season_regression
from engine.standings import standing_trend
from fetchers.espn import LEAGUE_MAP, backfill_games, resolve_backfill_window, sync_games

router = APIRouter(prefix="/api/v1", tags=["v1"])
logger = logging.getLogger(__name__)

_SYNCED_TABLES = (
    "predictions",
    "rating_history",
    "ratings",
    "games",
    "teams",
    "fetch_runs",
)


@router.get("/leagues")
async def get_leagues(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await league_status_rows(db)


@router.get("/games")
async def get_games(
    league: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    has_prediction: bool = Query(
        default=False,
        description="If true, only games with a stored pre-game prediction. "
        "History/accuracy should set this so unpredicted finals cannot crowd out the limit.",
    ),
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
        statuses = expand_status_filter([s.strip() for s in status.split(",") if s.strip()])
        if len(statuses) == 1:
            stmt = stmt.where(Game.status == statuses[0])
        elif statuses:
            stmt = stmt.where(Game.status.in_(statuses))
    if has_prediction:
        stmt = stmt.where(Game.prediction.has())
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
        history_by_team = await _elo_history_by_team(db, [team.id for team, _, _ in rows])
        for rank, (team, elo, last_updated) in enumerate(rows, start=1):
            standings.append(
                _standing_row(
                    rank=rank,
                    team=team,
                    elo_rating=elo,
                    last_updated=last_updated.isoformat() if last_updated else None,
                    trend=standing_trend(elo, history_by_team.get(team.id, [])),
                )
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
    history_by_team = await _elo_history_by_team(db, team_ids)
    for rank, rh in enumerate(ordered, start=1):
        team = teams[rh.team_id]
        standings.append(
            _standing_row(
                rank=rank,
                team=team,
                elo_rating=rh.elo_rating,
                last_updated=rh.date.isoformat() if rh.date else None,
                trend=standing_trend(rh.elo_rating, history_by_team.get(rh.team_id, [])),
            )
        )
    return standings


def _standing_row(
    *,
    rank: int,
    team: Team,
    elo_rating: float,
    last_updated: str | None,
    trend: int | None,
) -> dict:
    return {
        "rank": rank,
        "team_id": team.id,
        "league": team.league,
        "name": team.name,
        "abbreviation": team.abbreviation,
        "elo_rating": elo_rating,
        "last_updated": last_updated,
        "trend": trend,
    }


async def _elo_history_by_team(db: AsyncSession, team_ids: list[int]) -> dict[int, list[float]]:
    if not team_ids:
        return {}
    history_stmt = (
        select(RatingHistory)
        .where(RatingHistory.team_id.in_(team_ids))
        .order_by(RatingHistory.team_id, RatingHistory.date.asc(), RatingHistory.id.asc())
    )
    history_rows = (await db.execute(history_stmt)).scalars().all()
    grouped: dict[int, list[float]] = defaultdict(list)
    for rh in history_rows:
        grouped[rh.team_id].append(rh.elo_rating)
    return grouped


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
async def get_accuracy(
    league: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    # ESPN stores STATUS_FINAL; seed/tests may use "completed". Both are completed.
    stmt = (
        select(Game)
        .options(selectinload(Game.prediction))
        .where(Game.status.in_(COMPLETED_STATUSES))
        .where(Game.home_score.is_not(None))
        .where(Game.away_score.is_not(None))
        .where(Game.prediction.has())
    )
    if league:
        stmt = stmt.where(Game.league == league.lower())
    result = await db.execute(stmt)
    games = result.scalars().all()
    return _compute_accuracy(list(games))


@router.post("/admin/refresh")
async def admin_refresh(
    admin_token: str = Depends(verify_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    errors: list[dict[str, str]] = []
    for league in LEAGUE_MAP:
        try:
            await sync_games(league, db)
        except Exception as exc:
            logger.exception("Admin refresh failed for %s", league)
            errors.append({"league": league, "error": str(exc)})
    if errors:
        return {"status": "refresh_completed_with_errors", "errors": errors}
    return {"status": "refresh_completed"}


@router.post("/admin/reset-and-refresh")
async def admin_reset_and_refresh(
    admin_token: str = Depends(verify_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    """Wipe synced sports data, then re-fetch all leagues.

    Required after the team-id namespacing fix: legacy rows used raw ESPN team
    IDs as primary keys, which collide across leagues and mis-tag teams.
    """
    for table in _SYNCED_TABLES:
        await db.execute(text(f"TRUNCATE {table} CASCADE"))
    await db.commit()

    for league in LEAGUE_MAP:
        await sync_games(league, db)
    return {"status": "reset_and_refresh_completed", "truncated_tables": list(_SYNCED_TABLES)}


def _backfill_leagues(league: str | None) -> list[str]:
    if league is None:
        return list(LEAGUE_MAP)
    league_key = league.lower()
    if league_key not in LEAGUE_MAP:
        raise HTTPException(status_code=400, detail="Unknown league")
    return [league_key]


@router.post("/admin/backfill")
async def admin_backfill(
    admin_token: str = Depends(verify_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
    league: str | None = Query(default=None, description="League key (nfl, nba, mlb, nhl, epl). Omit to backfill all."),
    from_date: date | None = Query(  # noqa: B008
        default=None, alias="from", description="Inclusive start date (YYYY-MM-DD)."
    ),
    to_date: date | None = Query(  # noqa: B008
        default=None, alias="to", description="Inclusive end date (YYYY-MM-DD)."
    ),
):
    """Sync full rosters and historical ESPN scoreboards for a date range.

    Omit from/to to use each league's current season (clipped to today).
    """
    leagues = _backfill_leagues(league)
    results: list[dict] = []
    errors: list[dict[str, str]] = []
    for league_key in leagues:
        try:
            start, end = resolve_backfill_window(league_key, from_date, to_date)
            results.append(await backfill_games(league_key, db, start, end))
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("Admin backfill failed for %s", league_key)
            errors.append({"league": league_key, "error": str(exc)})

    status = "backfill_completed" if not errors else "backfill_completed_with_errors"
    return {"status": status, "results": results, "errors": errors}


@router.post(
    "/admin/regress-season",
    responses={400: {"description": "Unknown league"}},
)
async def admin_regress_season(
    admin_token: str = Depends(verify_admin),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
    league: str = Query(..., description="League key (nfl, nba, mlb, nhl, epl)."),
):
    """Regress Elo 25% toward 1500 at a season boundary.

    Not run during ESPN sync. Call once after the prior season is processed and
    before new-season games should inherit unregressed ratings. Safe to retry:
    already-applied seasons return ``season_regression_already_applied``.
    """
    league_key = league.lower()
    if league_key not in LEAGUE_MAP:
        raise HTTPException(status_code=400, detail="Unknown league")
    return await apply_season_regression(db, league_key)
