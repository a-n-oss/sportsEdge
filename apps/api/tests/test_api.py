import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_leagues(async_client: AsyncClient):
    response = await async_client.get("/api/v1/leagues")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


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
async def test_get_team_by_id(async_client: AsyncClient):
    response = await async_client.get("/api/v1/teams/999999")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_rating_history(async_client: AsyncClient):
    response = await async_client.get("/api/v1/teams/999999/rating-history")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_accuracy(async_client: AsyncClient):
    response = await async_client.get("/api/v1/accuracy")
    assert response.status_code == 200
    data = response.json()
    assert "brier_score" in data
    assert "calibration" in data
