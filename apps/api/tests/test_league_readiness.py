from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from api.league_status import league_status_rows
from db.models import Game, Rating, Team
from engine.elo import EloEngine
from engine.league_readiness import is_league_ready


def test_league_is_stub_when_all_elos_are_default():
    assert is_league_ready(ratings=[EloEngine.MEAN_RATING, EloEngine.MEAN_RATING], upcoming_elo_pairs=[]) is False


def test_league_is_ready_when_any_elo_differs_from_default():
    assert is_league_ready(ratings=[EloEngine.MEAN_RATING, 1510.0], upcoming_elo_pairs=[]) is True


def test_league_is_ready_when_upcoming_slate_has_nonzero_pre_hfa_elo_delta():
    assert (
        is_league_ready(
            ratings=[EloEngine.MEAN_RATING, EloEngine.MEAN_RATING],
            upcoming_elo_pairs=[(1480.0, 1520.0)],
        )
        is True
    )


def test_equal_upcoming_elos_do_not_make_a_stub_ready():
    assert (
        is_league_ready(
            ratings=[EloEngine.MEAN_RATING],
            upcoming_elo_pairs=[(EloEngine.MEAN_RATING, EloEngine.MEAN_RATING)],
        )
        is False
    )


def test_empty_ratings_and_slate_are_stub():
    assert is_league_ready(ratings=[], upcoming_elo_pairs=[]) is False


@pytest.mark.asyncio
async def test_status_rows_skip_upcoming_games_without_both_ratings(get_db_session: AsyncSession):
    now = datetime.now(UTC)
    home = Team(id=1, league="mlb", name="Home", abbreviation="HOM")
    away = Team(id=2, league="mlb", name="Away", abbreviation="AWY")
    get_db_session.add_all([home, away])
    await get_db_session.flush()
    get_db_session.add(Rating(team_id=1, elo_rating=EloEngine.MEAN_RATING, last_updated=now))
    get_db_session.add(
        Game(
            id=7,
            league="mlb",
            date=now + timedelta(days=1),
            home_team_id=1,
            away_team_id=2,
            status="scheduled",
        )
    )
    await get_db_session.commit()

    rows = await league_status_rows(get_db_session)
    by_key = {row["key"]: row["ready"] for row in rows}
    assert by_key["mlb"] is False


@pytest.mark.asyncio
async def test_status_rows_ready_when_upcoming_pair_has_elo_delta(get_db_session: AsyncSession):
    now = datetime.now(UTC)
    home = Team(id=3, league="epl", name="Home", abbreviation="HOM")
    away = Team(id=4, league="epl", name="Away", abbreviation="AWY")
    get_db_session.add_all([home, away])
    await get_db_session.flush()
    get_db_session.add_all(
        [
            Rating(team_id=3, elo_rating=1480.0, last_updated=now),
            Rating(team_id=4, elo_rating=1520.0, last_updated=now),
            Game(
                id=8,
                league="epl",
                date=now + timedelta(days=1),
                home_team_id=3,
                away_team_id=4,
                status="STATUS_SCHEDULED",
            ),
        ]
    )
    await get_db_session.commit()

    rows = await league_status_rows(get_db_session)
    by_key = {row["key"]: row["ready"] for row in rows}
    assert by_key["epl"] is True
