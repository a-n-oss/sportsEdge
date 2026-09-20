from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Game, Prediction, Rating, Team
from engine.elo import EloEngine
from engine.process import run_elo_pipeline, update_predictions


async def _seed_nba_matchup(session: AsyncSession, home_elo: float = 1500.0, away_elo: float = 1500.0) -> None:
    session.add_all(
        [
            Team(id=1, league="nba", name="Home", abbreviation="HOM"),
            Team(id=2, league="nba", name="Away", abbreviation="AWY"),
        ]
    )
    await session.commit()
    now = datetime.now(UTC)
    session.add_all(
        [
            Rating(team_id=1, elo_rating=home_elo, last_updated=now),
            Rating(team_id=2, elo_rating=away_elo, last_updated=now),
        ]
    )
    await session.commit()


def _game(*, game_id: int, status: str, days: int = 1, scores: tuple[int, int] | None = None) -> Game:
    home_score, away_score = scores if scores is not None else (None, None)
    return Game(
        id=game_id,
        league="nba",
        date=datetime.now(UTC) + timedelta(days=days),
        status=status,
        home_team_id=1,
        away_team_id=2,
        home_score=home_score,
        away_score=away_score,
    )


@pytest.mark.asyncio
async def test_update_predictions_writes_for_scheduled_games(get_db_session: AsyncSession):
    await _seed_nba_matchup(get_db_session)
    get_db_session.add(_game(game_id=10, status="STATUS_SCHEDULED", days=1))
    await get_db_session.commit()

    await update_predictions(get_db_session, "nba")

    pred = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 10))).scalar_one()
    expected = EloEngine.calculate_probabilities(1500.0, 1500.0, "nba")
    assert pred.home_win_prob == pytest.approx(expected["home"])
    assert pred.away_win_prob == pytest.approx(expected["away"])
    assert pred.draw_prob is None


@pytest.mark.asyncio
async def test_update_predictions_writes_for_seed_scheduled_status(get_db_session: AsyncSession):
    await _seed_nba_matchup(get_db_session)
    get_db_session.add(_game(game_id=16, status="scheduled", days=1))
    await get_db_session.commit()

    await update_predictions(get_db_session, "nba")

    pred = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 16))).scalar_one()
    assert pred.home_win_prob > 0.5


@pytest.mark.asyncio
async def test_update_predictions_refreshes_while_still_scheduled(get_db_session: AsyncSession):
    await _seed_nba_matchup(get_db_session)
    get_db_session.add(_game(game_id=11, status="STATUS_SCHEDULED", days=2))
    await get_db_session.commit()

    await update_predictions(get_db_session, "nba")
    first = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 11))).scalar_one()
    first_home = first.home_win_prob

    home_rating = await get_db_session.get(Rating, 1)
    assert home_rating is not None
    home_rating.elo_rating = 1800.0
    await get_db_session.commit()

    await update_predictions(get_db_session, "nba")
    refreshed = (
        await get_db_session.execute(
            select(Prediction).where(Prediction.game_id == 11).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert refreshed.home_win_prob > first_home


@pytest.mark.asyncio
async def test_update_predictions_freezes_when_status_flips_to_final(get_db_session: AsyncSession):
    await _seed_nba_matchup(get_db_session)
    game = _game(game_id=12, status="STATUS_SCHEDULED", days=1)
    get_db_session.add(game)
    await get_db_session.commit()

    await update_predictions(get_db_session, "nba")
    frozen = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 12))).scalar_one()
    frozen_home = frozen.home_win_prob
    frozen_away = frozen.away_win_prob

    game.status = "STATUS_FINAL"
    game.home_score = 110
    game.away_score = 98
    home_rating = await get_db_session.get(Rating, 1)
    assert home_rating is not None
    home_rating.elo_rating = 1900.0
    await get_db_session.commit()

    await update_predictions(get_db_session, "nba")
    still = (
        await get_db_session.execute(
            select(Prediction).where(Prediction.game_id == 12).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert still.home_win_prob == pytest.approx(frozen_home)
    assert still.away_win_prob == pytest.approx(frozen_away)


@pytest.mark.asyncio
async def test_update_predictions_does_not_invent_retrospective_for_first_seen_final(
    get_db_session: AsyncSession,
):
    await _seed_nba_matchup(get_db_session)
    get_db_session.add(_game(game_id=13, status="STATUS_FINAL", days=-1, scores=(104, 99)))
    await get_db_session.commit()

    await update_predictions(get_db_session, "nba")

    pred = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 13))).scalar_one_or_none()
    assert pred is None


@pytest.mark.asyncio
async def test_pipeline_skips_in_progress_games_never_seen_scheduled(get_db_session: AsyncSession):
    await _seed_nba_matchup(get_db_session)
    get_db_session.add(_game(game_id=14, status="STATUS_IN_PROGRESS", days=0, scores=(20, 18)))
    await get_db_session.commit()

    await run_elo_pipeline(get_db_session, "nba")

    pred = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 14))).scalar_one_or_none()
    assert pred is None


@pytest.mark.asyncio
async def test_pipeline_writes_prediction_then_processes_final_without_rewriting(
    get_db_session: AsyncSession,
):
    await _seed_nba_matchup(get_db_session)
    game = _game(game_id=15, status="STATUS_SCHEDULED", days=0)
    get_db_session.add(game)
    await get_db_session.commit()

    await run_elo_pipeline(get_db_session, "nba")
    pre_tip = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 15))).scalar_one()
    pre_home = pre_tip.home_win_prob

    game.status = "STATUS_FINAL"
    game.home_score = 120
    game.away_score = 90
    await get_db_session.commit()

    await run_elo_pipeline(get_db_session, "nba")
    post = (
        await get_db_session.execute(
            select(Prediction).where(Prediction.game_id == 15).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert post.home_win_prob == pytest.approx(pre_home)
