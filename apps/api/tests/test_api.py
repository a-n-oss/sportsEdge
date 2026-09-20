from datetime import UTC, datetime, timedelta

import pytest
import respx
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Game, Prediction, Rating, RatingHistory, Team
from fetchers.espn import LEAGUE_MAP


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
async def test_games_status_accepts_comma_separated_completed(async_client: AsyncClient, get_db_session: AsyncSession):
    """History/accuracy UIs need both ESPN STATUS_FINAL and seed 'completed'."""
    now = datetime.now(UTC)
    home = Team(id=10, league="nba", name="Home", abbreviation="HOM")
    away = Team(id=11, league="nba", name="Away", abbreviation="AWY")
    get_db_session.add_all([home, away])
    await get_db_session.commit()

    get_db_session.add_all(
        [
            Game(
                id=201,
                league="nba",
                date=now - timedelta(days=1),
                status="STATUS_FINAL",
                home_team_id=10,
                away_team_id=11,
                home_score=100,
                away_score=90,
            ),
            Game(
                id=202,
                league="nba",
                date=now - timedelta(days=2),
                status="completed",
                home_team_id=10,
                away_team_id=11,
                home_score=98,
                away_score=97,
            ),
            Game(
                id=203,
                league="nba",
                date=now + timedelta(days=1),
                status="STATUS_SCHEDULED",
                home_team_id=10,
                away_team_id=11,
            ),
        ]
    )
    await get_db_session.commit()

    response = await async_client.get("/api/v1/games?status=STATUS_FINAL,completed")
    assert response.status_code == 200
    ids = {g["id"] for g in response.json()}
    assert ids == {201, 202}


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

    # ESPN scoreboards use STATUS_FINAL; accuracy must count those too.
    past.status = "STATUS_FINAL"
    await get_db_session.commit()
    accuracy_espn = await async_client.get("/api/v1/accuracy")
    assert accuracy_espn.status_code == 200
    assert accuracy_espn.json()["sample_size"] == 1

    refresh = await async_client.get("/api/v1/meta/last-refresh")
    assert refresh.status_code == 200
    assert refresh.json()["league"] == "nba"
    assert refresh.json()["timestamp"] is not None


ADMIN_HEADERS = {"X-Admin-Token": "development_token"}


def _espn_urls(league: str) -> tuple[str, str]:
    sport, espn_league = LEAGUE_MAP[league]
    base = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}"
    return f"{base}/scoreboard", f"{base}/teams"


def _empty_roster() -> dict:
    return {"sports": [{"leagues": [{"teams": []}]}]}


def _final_event(event_id: str, date_str: str) -> dict:
    return {
        "id": event_id,
        "date": date_str,
        "status": {"type": {"name": "STATUS_FINAL"}},
        "competitions": [
            {
                "competitors": [
                    {
                        "homeAway": "home",
                        "team": {"id": "1", "name": "Celtics", "abbreviation": "BOS"},
                        "score": "100",
                    },
                    {
                        "homeAway": "away",
                        "team": {"id": "2", "name": "Heat", "abbreviation": "MIA"},
                        "score": "90",
                    },
                ]
            }
        ],
    }


@pytest.mark.asyncio
async def test_admin_backfill_unauthorized(async_client: AsyncClient):
    response = await async_client.post("/api/v1/admin/backfill")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_backfill_rejects_unknown_league(async_client: AsyncClient):
    response = await async_client.post(
        "/api/v1/admin/backfill",
        params={"league": "wnba", "from": "2024-11-01", "to": "2024-11-02"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_admin_backfill_rejects_partial_custom_range(async_client: AsyncClient):
    response = await async_client.post(
        "/api/v1/admin/backfill",
        params={"league": "nba", "from": "2024-11-01"},
        headers=ADMIN_HEADERS,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_admin_backfill_syncs_requested_date_range(async_client: AsyncClient, get_db_session: AsyncSession):
    scoreboard_url, teams_url = _espn_urls("nba")
    day1 = {"events": [_final_event("111", "2024-11-01T00:00Z")]}
    day2 = {"events": [_final_event("222", "2024-11-02T00:00Z")]}

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(teams_url).mock(return_value=Response(200, json=_empty_roster()))
        respx_mock.get(scoreboard_url, params={"dates": "20241101"}).mock(return_value=Response(200, json=day1))
        respx_mock.get(scoreboard_url, params={"dates": "20241102"}).mock(return_value=Response(200, json=day2))
        response = await async_client.post(
            "/api/v1/admin/backfill",
            params={"league": "nba", "from": "2024-11-01", "to": "2024-11-02"},
            headers=ADMIN_HEADERS,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "backfill_completed"
    assert body["results"][0]["league"] == "nba"
    assert body["results"][0]["days"] == 2

    games = (await get_db_session.execute(select(Game).order_by(Game.date))).scalars().all()
    assert [g.id for g in games] == [111, 222]

    run = (await get_db_session.execute(select(FetchRun))).scalar_one()
    assert run.status == "success"
    assert run.league == "nba"


@pytest.mark.asyncio
async def test_admin_refresh_syncs_all_leagues(async_client: AsyncClient, get_db_session: AsyncSession):
    with respx.mock(assert_all_called=True) as respx_mock:
        for league in LEAGUE_MAP:
            scoreboard_url, teams_url = _espn_urls(league)
            respx_mock.get(teams_url).mock(return_value=Response(200, json=_empty_roster()))
            respx_mock.get(scoreboard_url).mock(return_value=Response(200, json={"events": []}))
        response = await async_client.post("/api/v1/admin/refresh", headers=ADMIN_HEADERS)

    assert response.status_code == 200
    assert response.json()["status"] == "refresh_completed"
    runs = (await get_db_session.execute(select(FetchRun))).scalars().all()
    assert {run.league for run in runs} == set(LEAGUE_MAP)
    assert all(run.status == "success" for run in runs)


@pytest.mark.asyncio
async def test_admin_refresh_continues_after_league_error(async_client: AsyncClient, get_db_session: AsyncSession):
    with respx.mock(assert_all_called=True) as respx_mock:
        for league in LEAGUE_MAP:
            scoreboard_url, teams_url = _espn_urls(league)
            respx_mock.get(teams_url).mock(return_value=Response(200, json=_empty_roster()))
            status = 500 if league == "nhl" else 200
            respx_mock.get(scoreboard_url).mock(return_value=Response(status, json={"events": []}))
        response = await async_client.post("/api/v1/admin/refresh", headers=ADMIN_HEADERS)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "refresh_completed_with_errors"
    assert {err["league"] for err in body["errors"]} == {"nhl"}
    runs = (await get_db_session.execute(select(FetchRun))).scalars().all()
    assert {run.league: run.status for run in runs}["nhl"] == "error"


@pytest.mark.asyncio
async def test_admin_backfill_records_espn_failure(async_client: AsyncClient, get_db_session: AsyncSession):
    scoreboard_url, teams_url = _espn_urls("nba")
    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(teams_url).mock(return_value=Response(200, json=_empty_roster()))
        respx_mock.get(scoreboard_url, params={"dates": "20241101"}).mock(return_value=Response(500))
        response = await async_client.post(
            "/api/v1/admin/backfill",
            params={"league": "nba", "from": "2024-11-01", "to": "2024-11-01"},
            headers=ADMIN_HEADERS,
        )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "backfill_completed_with_errors"
    assert body["errors"][0]["league"] == "nba"
    run = (await get_db_session.execute(select(FetchRun))).scalar_one()
    assert run.status == "error"


@pytest.mark.asyncio
async def test_admin_reset_and_refresh_still_works(async_client: AsyncClient, get_db_session: AsyncSession):
    get_db_session.add(Team(id=99, league="nba", name="Temp", abbreviation="TMP"))
    await get_db_session.commit()

    with respx.mock(assert_all_called=True) as respx_mock:
        for league in LEAGUE_MAP:
            scoreboard_url, teams_url = _espn_urls(league)
            respx_mock.get(teams_url).mock(return_value=Response(200, json=_empty_roster()))
            respx_mock.get(scoreboard_url).mock(return_value=Response(200, json={"events": []}))
        response = await async_client.post("/api/v1/admin/reset-and-refresh", headers=ADMIN_HEADERS)

    assert response.status_code == 200
    assert response.json()["status"] == "reset_and_refresh_completed"
    leftover = (await get_db_session.execute(select(Team).where(Team.id == 99))).scalar_one_or_none()
    assert leftover is None
