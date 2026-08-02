import logging
from collections.abc import Sequence
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from db.models import Game, Prediction, Rating, RatingHistory, Team
from engine.elo import EloEngine

logger = logging.getLogger(__name__)


async def ensure_ratings(session: AsyncSession, league: str) -> None:
    """Ensure all teams in the league have an initial rating of 1500."""
    result = await session.execute(select(Team).where(Team.league == league).options(selectinload(Team.rating)))
    teams = result.scalars().all()

    ratings_to_insert = []
    now = datetime.now(UTC)

    for team in teams:
        if not team.rating:
            ratings_to_insert.append(
                {
                    "team_id": team.id,
                    "elo_rating": EloEngine.MEAN_RATING,
                    "last_updated": now,
                }
            )

    if ratings_to_insert:
        stmt = insert(Rating).values(ratings_to_insert).on_conflict_do_nothing(index_elements=["team_id"])
        await session.execute(stmt)
        await session.commit()


async def process_completed_games(session: AsyncSession, league: str) -> None:
    """Process Elo updates for completed games that haven't been processed yet."""
    # Find all completed games for the league
    result = await session.execute(
        select(Game).where(Game.league == league, Game.status == "STATUS_FINAL").order_by(Game.date)
    )
    games: Sequence[Game] = result.scalars().all()

    # Load all current ratings into memory for quick updates
    rating_result = await session.execute(select(Rating).join(Team).where(Team.league == league))
    ratings: dict[int, Rating] = {r.team_id: r for r in rating_result.scalars().all()}

    # Check which games have already been processed by looking for RatingHistory
    history_result = await session.execute(
        select(RatingHistory.game_id).where(RatingHistory.game_id.in_([g.id for g in games]))
    )
    processed_game_ids = {row[0] for row in history_result.all()}

    now = datetime.now(UTC)
    updates_made = False

    for game in games:
        if game.id in processed_game_ids:
            continue

        if game.home_score is None or game.away_score is None:
            continue

        home_rating_obj = ratings.get(game.home_team_id)
        away_rating_obj = ratings.get(game.away_team_id)

        if not home_rating_obj or not away_rating_obj:
            continue

        new_home, new_away = EloEngine.calculate_new_ratings(
            home_rating_obj.elo_rating, away_rating_obj.elo_rating, game.home_score, game.away_score, league
        )

        # Update in-memory objects (which updates DB when session commits)
        home_rating_obj.elo_rating = new_home
        home_rating_obj.last_updated = now
        away_rating_obj.elo_rating = new_away
        away_rating_obj.last_updated = now

        # Record history
        session.add_all(
            [
                RatingHistory(team_id=game.home_team_id, game_id=game.id, elo_rating=new_home, date=game.date),
                RatingHistory(team_id=game.away_team_id, game_id=game.id, elo_rating=new_away, date=game.date),
            ]
        )
        updates_made = True

    if updates_made:
        await session.commit()
        logger.info(f"Processed Elo ratings for completed games in {league}")


async def update_predictions(session: AsyncSession, league: str) -> None:
    """Generate or update predictions for scheduled games."""
    result = await session.execute(select(Game).where(Game.league == league, Game.status == "STATUS_SCHEDULED"))
    scheduled_games = result.scalars().all()

    if not scheduled_games:
        return

    # Load current ratings
    rating_result = await session.execute(select(Rating).join(Team).where(Team.league == league))
    ratings: dict[int, Rating] = {r.team_id: r for r in rating_result.scalars().all()}

    predictions_to_upsert = []

    for game in scheduled_games:
        home_rating = ratings.get(game.home_team_id)
        away_rating = ratings.get(game.away_team_id)

        if not home_rating or not away_rating:
            continue

        probs = EloEngine.calculate_probabilities(home_rating.elo_rating, away_rating.elo_rating, league)

        predictions_to_upsert.append(
            {
                "game_id": game.id,
                "home_win_prob": probs["home"],
                "away_win_prob": probs["away"],
                "draw_prob": probs.get("draw"),
            }
        )

    if predictions_to_upsert:
        stmt = insert(Prediction).values(predictions_to_upsert)
        stmt = stmt.on_conflict_do_update(
            index_elements=["game_id"],
            set_={
                "home_win_prob": stmt.excluded.home_win_prob,
                "away_win_prob": stmt.excluded.away_win_prob,
                "draw_prob": stmt.excluded.draw_prob,
            },
        )
        await session.execute(stmt)
        await session.commit()
        logger.info(f"Updated predictions for scheduled {league} games")


async def run_elo_pipeline(session: AsyncSession, league: str) -> None:
    """Run the full Elo generation pipeline for a league."""
    await ensure_ratings(session, league)
    await process_completed_games(session, league)
    await update_predictions(session, league)
