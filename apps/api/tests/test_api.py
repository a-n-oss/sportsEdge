from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Game, Prediction, Rating, RatingHistory, Team


@pytest.mark.asyncio
async def test_get_leagues(async_client: AsyncClient):
    response = await async_client.get("/api/v1/leagues")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert "nba" in data


@pytest.mark.asyncio
async def test_get_games(async_client: AsyncClient):
    response = await async_client.get("/api/v1/games")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_get_teams(async_client: AsyncClient):
    response = await async_client.get("/api/v1/teams")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_admin_refresh_unauthorized(async_client: AsyncClient):
    response = await async_client.post("/api/v1/admin/refresh")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_reset_and_refresh_unauthorized(async_client: AsyncClient):
    response = await async_client.post("/api/v1/admin/reset-and-refresh")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_team_by_id(async_client: AsyncClient):
    response = await async_client.get("/api/v1/teams/999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_rating_history(async_client: AsyncClient):
    response = await async_client.get("/api/v1/teams/999999/rating-history")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_accuracy_empty(async_client: AsyncClient):
    response = await async_client.get("/api/v1/accuracy")
    assert response.status_code == 200
    data = response.json()
    assert "brier_score" in data
    assert "calibration" in data
    assert data["sample_size"] == 0


@pytest.mark.asyncio
async def test_get_game_not_found(async_client: AsyncClient):
    response = await async_client.get("/api/v1/games/999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_last_refresh_empty(async_client: AsyncClient):
    response = await async_client.get("/api/v1/meta/last-refresh")
    assert response.status_code == 200
    data = response.json()
    assert data["timestamp"] is None


@pytest.mark.asyncio
async def test_games_filter_and_game_detail(async_client: AsyncClient, get_db_session: AsyncSession):
    home = Team(id=1, league="nba", name="Los Angeles Lakers", abbreviation="LAL")
    away = Team(id=2, league="nba", name="Boston Celtics", abbreviation="BOS")
    get_db_session.add_all([home, away])
    await get_db_session.commit()

    game = Game(
        id=50,
        league="nba",
        date=datetime.now(UTC) + timedelta(days=1),
        status="scheduled",
        home_team_id=1,
        away_team_id=2,
    )
    get_db_session.add(game)
    await get_db_session.commit()

    filtered = await async_client.get("/api/v1/games?league=nba&status=scheduled")
    assert filtered.status_code == 200
    assert len(filtered.json()) == 1

    other = await async_client.get("/api/v1/games?league=nfl")
    assert other.status_code == 200
    assert other.json() == []

    detail = await async_client.get("/api/v1/games/50")
    assert detail.status_code == 200
    body = detail.json()
    assert body["id"] == 50
    assert body["home_team"]["abbreviation"] == "LAL"


@pytest.mark.asyncio
async def test_standings_and_accuracy(async_client: AsyncClient, get_db_session: AsyncSession):
    now = datetime.now(UTC)
    home = Team(id=1, league="nba", name="Los Angeles Lakers", abbreviation="LAL")
    away = Team(id=2, league="nba", name="Boston Celtics", abbreviation="BOS")
    get_db_session.add_all([home, away])
    await get_db_session.commit()

    get_db_session.add_all(
        [
            Rating(team_id=1, elo_rating=1550.0, last_updated=now),
            Rating(team_id=2, elo_rating=1480.0, last_updated=now),
        ]
    )
    past = Game(
        id=101,
        league="nba",
        date=now - timedelta(days=2),
        status="completed",
        home_team_id=1,
        away_team_id=2,
        home_score=110,
        away_score=105,
    )
    get_db_session.add(past)
    await get_db_session.commit()
    get_db_session.add(Prediction(game_id=101, home_win_prob=0.58, away_win_prob=0.42, draw_prob=None))
    get_db_session.add(FetchRun(timestamp=now, league="nba", status="success"))
    get_db_session.add(RatingHistory(team_id=1, game_id=101, elo_rating=1550.0, date=past.date))
    await get_db_session.commit()

    standings = await async_client.get("/api/v1/leagues/nba/standings")
    assert standings.status_code == 200
    rows = standings.json()
    assert len(rows) == 2
    assert rows[0]["abbreviation"] == "LAL"
    assert rows[0]["rank"] == 1

    bad_league = await async_client.get("/api/v1/leagues/xyz/standings")
    assert bad_league.status_code == 404

    accuracy = await async_client.get("/api/v1/accuracy")
    assert accuracy.status_code == 200
    acc = accuracy.json()
    assert acc["sample_size"] == 1
    assert 0 <= acc["brier_score"] <= 1

    refresh = await async_client.get("/api/v1/meta/last-refresh")
    assert refresh.status_code == 200
    assert refresh.json()["league"] == "nba"
    assert refresh.json()["timestamp"] is not None
