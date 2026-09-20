from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import Rating, RatingHistory, Team
from engine.standings import standing_trend


def test_trend_is_none_without_history():
    assert standing_trend(1550.0, []) is None


def test_trend_is_zero_when_only_current_point_exists():
    assert standing_trend(1550.0, [1550.0]) == 0


def test_trend_is_delta_over_available_history_when_fewer_than_lookback():
    assert standing_trend(1550.0, [1510.0, 1550.0]) == 40


def test_trend_uses_rating_from_five_games_ago():
    # Six post-game ratings; last five games started from 1510.
    history = [1510.0, 1520.0, 1530.0, 1540.0, 1550.0, 1560.0]
    assert standing_trend(1560.0, history) == 50


def test_trend_is_negative_when_elo_fell():
    assert standing_trend(1540.0, [1600.0, 1570.0, 1540.0]) == -60


def test_trend_rounds_to_nearest_int():
    assert standing_trend(1510.6, [1500.4, 1510.6]) == 10


@pytest.mark.asyncio
async def test_standings_exposes_trend_from_rating_history(async_client: AsyncClient, get_db_session: AsyncSession):
    now = datetime.now(UTC)
    rising = Team(id=1, league="nba", name="Los Angeles Lakers", abbreviation="LAL")
    flat = Team(id=2, league="nba", name="Boston Celtics", abbreviation="BOS")
    get_db_session.add_all([rising, flat])
    await get_db_session.commit()

    get_db_session.add_all(
        [
            Rating(team_id=1, elo_rating=1550.0, last_updated=now),
            Rating(team_id=2, elo_rating=1480.0, last_updated=now),
            RatingHistory(team_id=1, game_id=None, elo_rating=1510.0, date=now - timedelta(days=10)),
            RatingHistory(team_id=1, game_id=None, elo_rating=1550.0, date=now - timedelta(days=1)),
        ]
    )
    await get_db_session.commit()

    response = await async_client.get("/api/v1/leagues/nba/standings")
    assert response.status_code == 200
    by_id = {row["team_id"]: row for row in response.json()}
    assert by_id[1]["trend"] == 40
    assert by_id[2]["trend"] is None


@pytest.mark.asyncio
async def test_standings_trend_on_history_fallback_without_current_ratings(
    async_client: AsyncClient, get_db_session: AsyncSession
):
    now = datetime.now(UTC)
    team = Team(id=3, league="nfl", name="Kansas City Chiefs", abbreviation="KC")
    get_db_session.add(team)
    await get_db_session.commit()
    get_db_session.add_all(
        [
            RatingHistory(team_id=3, game_id=None, elo_rating=1600.0, date=now - timedelta(days=20)),
            RatingHistory(team_id=3, game_id=None, elo_rating=1640.0, date=now - timedelta(days=1)),
        ]
    )
    await get_db_session.commit()

    response = await async_client.get("/api/v1/leagues/nfl/standings")
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    assert rows[0]["elo_rating"] == 1640.0
    assert rows[0]["trend"] == 40
