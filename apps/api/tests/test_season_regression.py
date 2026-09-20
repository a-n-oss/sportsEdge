from datetime import UTC, date, datetime

import pytest
import respx
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Rating, RatingHistory, Team
from engine.elo import EloEngine
from engine.season import apply_season_regression
from fetchers.espn import LEAGUE_MAP, current_season_start, sync_games

ADMIN_HEADERS = {"X-Admin-Token": "development_token"}


async def _seed_rated_nba(session: AsyncSession, home_elo: float, away_elo: float) -> None:
    now = datetime.now(UTC)
    session.add_all(
        [
            Team(id=1, league="nba", name="Home", abbreviation="HOM"),
            Team(id=2, league="nba", name="Away", abbreviation="AWY"),
        ]
    )
    await session.commit()
    session.add_all(
        [
            Rating(team_id=1, elo_rating=home_elo, last_updated=now),
            Rating(team_id=2, elo_rating=away_elo, last_updated=now),
        ]
    )
    await session.commit()


@pytest.mark.asyncio
async def test_apply_season_regression_moves_ratings_25_percent_toward_mean(get_db_session: AsyncSession):
    await _seed_rated_nba(get_db_session, 1900.0, 1100.0)

    result = await apply_season_regression(get_db_session, "nba", as_of=date(2026, 10, 15))

    assert result["status"] == "season_regression_applied"
    assert result["teams_updated"] == 2
    home = await get_db_session.get(Rating, 1)
    away = await get_db_session.get(Rating, 2)
    assert home is not None and away is not None
    assert home.elo_rating == EloEngine.regress_rating(1900.0)
    assert away.elo_rating == EloEngine.regress_rating(1100.0)

    history = (await get_db_session.execute(select(RatingHistory))).scalars().all()
    assert len(history) == 2
    assert all(row.game_id is None for row in history)


@pytest.mark.asyncio
async def test_apply_season_regression_is_idempotent_for_the_same_season(get_db_session: AsyncSession):
    await _seed_rated_nba(get_db_session, 1900.0, 1100.0)
    first = await apply_season_regression(get_db_session, "nba", as_of=date(2026, 10, 15))
    second = await apply_season_regression(get_db_session, "nba", as_of=date(2026, 11, 1))

    assert first["status"] == "season_regression_applied"
    assert second["status"] == "season_regression_already_applied"
    home = await get_db_session.get(Rating, 1)
    assert home is not None
    assert home.elo_rating == 1800.0


@pytest.mark.asyncio
async def test_admin_regress_season_unauthorized(async_client: AsyncClient):
    response = await async_client.post("/api/v1/admin/regress-season", params={"league": "nba"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_regress_season_applies_for_league(async_client: AsyncClient, get_db_session: AsyncSession):
    await _seed_rated_nba(get_db_session, 1900.0, 1500.0)

    response = await async_client.post(
        "/api/v1/admin/regress-season",
        params={"league": "nba"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "season_regression_applied"
    assert body["league"] == "nba"
    assert body["season_start"] == current_season_start("nba").isoformat()

    home = await get_db_session.get(Rating, 1)
    assert home is not None
    assert home.elo_rating == 1800.0

    run = (await get_db_session.execute(select(FetchRun))).scalar_one()
    assert run.league == "nba"
    assert run.status.startswith("season_regression:")


@pytest.mark.asyncio
async def test_admin_regress_season_rejects_unknown_league(async_client: AsyncClient):
    response = await async_client.post(
        "/api/v1/admin/regress-season",
        params={"league": "wnba"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_sync_games_does_not_silently_regress_ratings(get_db_session: AsyncSession):
    await _seed_rated_nba(get_db_session, 1900.0, 1100.0)
    sport, espn_league = LEAGUE_MAP["nba"]
    base = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}"

    empty_roster: dict[str, object] = {"sports": [{"leagues": [{"teams": []}]}]}
    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(f"{base}/teams").mock(return_value=Response(200, json=empty_roster))
        respx_mock.get(f"{base}/scoreboard").mock(return_value=Response(200, json={"events": []}))
        await sync_games("nba", get_db_session)

    home = await get_db_session.get(Rating, 1)
    assert home is not None
    assert home.elo_rating == 1900.0
    runs = (await get_db_session.execute(select(FetchRun))).scalars().all()
    assert all(not run.status.startswith("season_regression:") for run in runs)
