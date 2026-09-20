from datetime import UTC, date, datetime

import httpx
import pytest
import respx
from httpx import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Game, Prediction, RatingHistory, Team
from fetchers.espn import (
    LEAGUE_MAP,
    backfill_games,
    current_season_start,
    current_season_window,
    fetch_scoreboard,
    namespaced_team_id,
    parse_espn_teams,
    parse_scoreboard,
    resolve_backfill_window,
    sync_games,
    sync_league_teams,
)
from fetchers.schedule import ESPN_MAX_ATTEMPTS


def _espn_urls(league: str) -> tuple[str, str]:
    sport, espn_league = LEAGUE_MAP[league]
    base = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}"
    return f"{base}/scoreboard", f"{base}/teams"


def _roster_payload(teams: list[dict]) -> dict:
    return {"sports": [{"leagues": [{"teams": [{"team": team} for team in teams]}]}]}


EMPTY_ROSTER = _roster_payload([])


def _mock_league_espn(respx_mock, league: str, scoreboard_json: dict, roster: dict | None = None) -> None:
    scoreboard_url, teams_url = _espn_urls(league)
    respx_mock.get(teams_url).mock(return_value=Response(200, json=roster or EMPTY_ROSTER))
    respx_mock.get(scoreboard_url).mock(return_value=Response(200, json=scoreboard_json))


def _scoreboard_event(
    event_id: str,
    date_str: str,
    home: dict,
    away: dict,
    status: str = "STATUS_SCHEDULED",
    home_score: int | None = None,
    away_score: int | None = None,
) -> dict:
    home_competitor: dict = {"homeAway": "home", "team": home}
    away_competitor: dict = {"homeAway": "away", "team": away}
    if home_score is not None:
        home_competitor["score"] = str(home_score)
    if away_score is not None:
        away_competitor["score"] = str(away_score)
    return {
        "id": event_id,
        "date": date_str,
        "status": {"type": {"name": status}},
        "competitions": [{"competitors": [home_competitor, away_competitor]}],
    }


@pytest.fixture
def espn_mock_data():
    return {
        "events": [
            {
                "id": "12345",
                "date": "2024-11-20T20:30Z",
                "status": {"type": {"name": "STATUS_SCHEDULED"}},
                "competitions": [
                    {
                        "competitors": [
                            {
                                "homeAway": "home",
                                "team": {"id": "1", "location": "Boston", "name": "Celtics", "abbreviation": "BOS"},
                            },
                            {
                                "homeAway": "away",
                                "team": {"id": "2", "location": "Miami", "name": "Heat", "abbreviation": "MIA"},
                            },
                        ]
                    }
                ],
            }
        ]
    }


@pytest.mark.asyncio
async def test_fetch_scoreboard(espn_mock_data):
    league = "nba"
    sport, espn_league = LEAGUE_MAP[league]
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}/scoreboard"

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(url).mock(return_value=Response(200, json=espn_mock_data))

        result = await fetch_scoreboard(league)
        assert result == espn_mock_data


def _nba_scoreboard_url() -> str:
    sport, espn_league = LEAGUE_MAP["nba"]
    return f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}/scoreboard"


@pytest.mark.asyncio
async def test_fetch_scoreboard_retries_on_429_then_succeeds(espn_mock_data, monkeypatch):
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("fetchers.espn.async_sleep", fake_sleep)

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(_nba_scoreboard_url()).mock(
            side_effect=[
                Response(429, headers={"Retry-After": "3"}),
                Response(200, json=espn_mock_data),
            ]
        )
        result = await fetch_scoreboard("nba")
        assert result == espn_mock_data
    assert sleeps == [3.0]


@pytest.mark.asyncio
async def test_fetch_scoreboard_retries_on_503_with_exponential_backoff(espn_mock_data, monkeypatch):
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("fetchers.espn.async_sleep", fake_sleep)

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(_nba_scoreboard_url()).mock(
            side_effect=[
                Response(503),
                Response(503),
                Response(200, json=espn_mock_data),
            ]
        )
        result = await fetch_scoreboard("nba")
        assert result == espn_mock_data
    assert sleeps == [2.0, 4.0]


@pytest.mark.asyncio
async def test_fetch_scoreboard_gives_up_after_max_attempts(monkeypatch):
    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("fetchers.espn.async_sleep", fake_sleep)

    with respx.mock() as respx_mock:
        route = respx_mock.get(_nba_scoreboard_url()).mock(return_value=Response(503))
        with pytest.raises(httpx.HTTPStatusError):
            await fetch_scoreboard("nba")
        assert route.call_count == ESPN_MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_fetch_scoreboard_does_not_retry_client_errors():
    with respx.mock() as respx_mock:
        route = respx_mock.get(_nba_scoreboard_url()).mock(return_value=Response(404))
        with pytest.raises(httpx.HTTPStatusError):
            await fetch_scoreboard("nba")
        assert route.call_count == 1


@pytest.mark.asyncio
async def test_fetch_scoreboard_retries_on_transport_error(espn_mock_data, monkeypatch):
    sleeps: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("fetchers.espn.async_sleep", fake_sleep)

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(_nba_scoreboard_url()).mock(
            side_effect=[
                httpx.ConnectError("connection reset"),
                Response(200, json=espn_mock_data),
            ]
        )
        result = await fetch_scoreboard("nba")
        assert result == espn_mock_data
    assert sleeps == [2.0]


@pytest.mark.asyncio
async def test_fetch_scoreboard_gives_up_after_transport_errors(monkeypatch):
    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("fetchers.espn.async_sleep", fake_sleep)

    with respx.mock() as respx_mock:
        route = respx_mock.get(_nba_scoreboard_url()).mock(side_effect=httpx.ConnectError("connection reset"))
        with pytest.raises(httpx.ConnectError):
            await fetch_scoreboard("nba")
        assert route.call_count == ESPN_MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_fetch_scoreboard_passes_dates_query(espn_mock_data):
    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(_nba_scoreboard_url(), params={"dates": "20260115"}).mock(
            return_value=Response(200, json=espn_mock_data)
        )
        result = await fetch_scoreboard("nba", "20260115")
        assert result == espn_mock_data


@pytest.mark.asyncio
async def test_fetch_scoreboard_fails_closed_when_attempts_are_zero(monkeypatch):
    monkeypatch.setattr("fetchers.espn.ESPN_MAX_ATTEMPTS", 0)
    with pytest.raises(RuntimeError, match="exhausted retries"):
        await fetch_scoreboard("nba")


@pytest.mark.asyncio
async def test_async_sleep_delegates_to_asyncio(monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr("fetchers.espn.asyncio.sleep", fake_sleep)
    from fetchers.espn import async_sleep

    await async_sleep(0.25)
    assert slept == [0.25]


@pytest.mark.asyncio
async def test_sync_games_upsert(espn_mock_data, get_db_session: AsyncSession):
    # This assumes get_db_session is a fixture that yields a real async db session connected to test db
    league = "nba"

    with respx.mock(assert_all_called=True) as respx_mock:
        _mock_league_espn(respx_mock, league, espn_mock_data)

        # Run sync_games
        await sync_games(league, get_db_session)

        home_id = namespaced_team_id("nba", 1)
        away_id = namespaced_team_id("nba", 2)

        # Verify Teams were inserted
        result_teams = await get_db_session.execute(select(Team).order_by(Team.id))
        teams = result_teams.scalars().all()
        assert len(teams) == 2
        assert teams[0].id == home_id
        assert teams[0].league == "nba"
        assert teams[0].name == "Celtics"
        assert teams[1].id == away_id
        assert teams[1].name == "Heat"

        # Verify Game was inserted
        result_games = await get_db_session.execute(select(Game))
        games = result_games.scalars().all()
        assert len(games) == 1
        assert games[0].id == 12345
        assert games[0].status == "STATUS_SCHEDULED"
        assert games[0].home_team_id == home_id
        assert games[0].away_team_id == away_id
        assert games[0].date == datetime(2024, 11, 20, 20, 30, tzinfo=UTC)

        # Verify FetchRun was inserted
        result_runs = await get_db_session.execute(select(FetchRun))
        fetch_runs = result_runs.scalars().all()
        assert len(fetch_runs) == 1
        assert fetch_runs[0].league == "nba"
        assert fetch_runs[0].status == "success"

        # Now mock an update (score changes)
        espn_mock_data["events"][0]["status"]["type"]["name"] = "STATUS_FINAL"
        espn_mock_data["events"][0]["competitions"][0]["competitors"][0]["score"] = "110"
        espn_mock_data["events"][0]["competitions"][0]["competitors"][1]["score"] = "105"

        respx_mock.get(_espn_urls(league)[0]).mock(return_value=Response(200, json=espn_mock_data))
        await sync_games(league, get_db_session)

        # Verify Game was updated
        result_games = await get_db_session.execute(select(Game).execution_options(populate_existing=True))
        games = result_games.scalars().all()
        assert len(games) == 1
        assert games[0].status == "STATUS_FINAL"
        assert games[0].home_score == 110
        assert games[0].away_score == 105


@pytest.mark.asyncio
async def test_sync_scheduled_to_final_retains_prediction(espn_mock_data, get_db_session: AsyncSession):
    """Pre-game predictions must survive when ESPN flips the game to STATUS_FINAL."""
    league = "nba"
    scoreboard_url, _ = _espn_urls(league)

    with respx.mock(assert_all_called=True) as respx_mock:
        _mock_league_espn(respx_mock, league, espn_mock_data)
        await sync_games(league, get_db_session)

        pred_before = (await get_db_session.execute(select(Prediction).where(Prediction.game_id == 12345))).scalar_one()
        home_p = pred_before.home_win_prob
        away_p = pred_before.away_win_prob

        espn_mock_data["events"][0]["status"]["type"]["name"] = "STATUS_FINAL"
        espn_mock_data["events"][0]["competitions"][0]["competitors"][0]["score"] = "110"
        espn_mock_data["events"][0]["competitions"][0]["competitors"][1]["score"] = "105"
        respx_mock.get(scoreboard_url).mock(return_value=Response(200, json=espn_mock_data))
        await sync_games(league, get_db_session)

    pred_after = (
        await get_db_session.execute(
            select(Prediction).where(Prediction.game_id == 12345).execution_options(populate_existing=True)
        )
    ).scalar_one()
    assert pred_after.home_win_prob == pytest.approx(home_p)
    assert pred_after.away_win_prob == pytest.approx(away_p)


def test_namespaced_team_id_is_league_scoped():
    assert namespaced_team_id("mlb", 14) != namespaced_team_id("nba", 14)
    assert namespaced_team_id("nhl", 28) != namespaced_team_id("nba", 28)
    assert namespaced_team_id("NBA", 1) == 2_000_001


def test_namespaced_team_id_rejects_unknown_league():
    with pytest.raises(ValueError, match="Unsupported league"):
        namespaced_team_id("wnba", 1)


@pytest.mark.asyncio
async def test_sync_games_keeps_same_espn_id_in_separate_leagues(get_db_session: AsyncSession):
    """ESPN reuses small team IDs across sports; sync must not overwrite across leagues."""
    mlb_board = {
        "events": [
            {
                "id": "90001",
                "date": "2024-11-20T20:30Z",
                "status": {"type": {"name": "STATUS_SCHEDULED"}},
                "competitions": [
                    {
                        "competitors": [
                            {
                                "homeAway": "home",
                                "team": {
                                    "id": "14",
                                    "location": "Toronto",
                                    "name": "Blue Jays",
                                    "abbreviation": "TOR",
                                },
                            },
                            {
                                "homeAway": "away",
                                "team": {
                                    "id": "24",
                                    "location": "St. Louis",
                                    "name": "Cardinals",
                                    "abbreviation": "STL",
                                },
                            },
                        ]
                    }
                ],
            }
        ]
    }
    nba_board = {
        "events": [
            {
                "id": "90002",
                "date": "2024-11-20T23:00Z",
                "status": {"type": {"name": "STATUS_SCHEDULED"}},
                "competitions": [
                    {
                        "competitors": [
                            {
                                "homeAway": "home",
                                "team": {
                                    "id": "14",
                                    "location": "Toronto",
                                    "name": "Raptors",
                                    "abbreviation": "TOR",
                                },
                            },
                            {
                                "homeAway": "away",
                                "team": {
                                    "id": "28",
                                    "location": "Phoenix",
                                    "name": "Suns",
                                    "abbreviation": "PHX",
                                },
                            },
                        ]
                    }
                ],
            }
        ]
    }

    mlb_scoreboard, mlb_teams = _espn_urls("mlb")
    nba_scoreboard, nba_teams = _espn_urls("nba")

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(mlb_teams).mock(return_value=Response(200, json=EMPTY_ROSTER))
        respx_mock.get(mlb_scoreboard).mock(return_value=Response(200, json=mlb_board))
        await sync_games("mlb", get_db_session)

        respx_mock.get(nba_teams).mock(return_value=Response(200, json=EMPTY_ROSTER))
        respx_mock.get(nba_scoreboard).mock(return_value=Response(200, json=nba_board))
        await sync_games("nba", get_db_session)

    result = await get_db_session.execute(select(Team).order_by(Team.league, Team.id))
    teams = {(t.league, t.name): t for t in result.scalars().all()}

    assert teams[("mlb", "Blue Jays")].id == namespaced_team_id("mlb", 14)
    assert teams[("mlb", "Blue Jays")].league == "mlb"
    assert teams[("nba", "Raptors")].id == namespaced_team_id("nba", 14)
    assert teams[("nba", "Raptors")].league == "nba"
    assert len(teams) == 4


@pytest.mark.asyncio
async def test_sync_league_teams_upserts_full_roster(get_db_session: AsyncSession):
    """Roster sync must persist every ESPN team, not only tonight's scoreboard competitors."""
    _, teams_url = _espn_urls("nba")
    roster = _roster_payload(
        [
            {"id": "1", "name": "Hawks", "abbreviation": "ATL"},
            {"id": "2", "name": "Celtics", "abbreviation": "BOS"},
            {"id": "17", "name": "Nets", "abbreviation": "BKN"},
        ]
    )

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(teams_url).mock(return_value=Response(200, json=roster))
        await sync_league_teams("nba", get_db_session)

    result = await get_db_session.execute(select(Team).order_by(Team.id))
    teams = result.scalars().all()
    assert [t.abbreviation for t in teams] == ["ATL", "BOS", "BKN"]
    assert teams[0].id == namespaced_team_id("nba", 1)
    assert teams[1].league == "nba"
    assert teams[2].name == "Nets"


@pytest.mark.asyncio
async def test_backfill_games_syncs_date_range_chronologically(get_db_session: AsyncSession):
    """Historical backfill walks each day in order so Elo sees completed games oldest-first."""
    scoreboard_url, teams_url = _espn_urls("nba")
    celtics = {"id": "2", "name": "Celtics", "abbreviation": "BOS"}
    heat = {"id": "14", "name": "Heat", "abbreviation": "MIA"}
    lakers = {"id": "13", "name": "Lakers", "abbreviation": "LAL"}
    day1 = {
        "events": [
            _scoreboard_event("111", "2024-11-01T00:00Z", celtics, heat, "STATUS_FINAL", 110, 100),
        ]
    }
    day2 = {
        "events": [
            _scoreboard_event("222", "2024-11-02T03:00Z", lakers, celtics, "STATUS_FINAL", 98, 97),
        ]
    }

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(teams_url).mock(return_value=Response(200, json=_roster_payload([celtics, heat, lakers])))
        respx_mock.get(scoreboard_url, params={"dates": "20241101"}).mock(return_value=Response(200, json=day1))
        respx_mock.get(scoreboard_url, params={"dates": "20241102"}).mock(return_value=Response(200, json=day2))
        await backfill_games("nba", get_db_session, date(2024, 11, 1), date(2024, 11, 2))

    games = (await get_db_session.execute(select(Game).order_by(Game.date))).scalars().all()
    assert [g.id for g in games] == [111, 222]
    assert games[0].home_score == 110
    assert games[1].away_score == 97

    history = (await get_db_session.execute(select(RatingHistory))).scalars().all()
    assert {row.game_id for row in history} == {111, 222}

    runs = (await get_db_session.execute(select(FetchRun))).scalars().all()
    assert len(runs) == 1
    assert runs[0].league == "nba"
    assert runs[0].status == "success"


@pytest.mark.asyncio
async def test_sync_games_upserts_roster_teams_missing_from_scoreboard(espn_mock_data, get_db_session: AsyncSession):
    """Daily sync must persist the full league roster, not only tonight's competitors."""
    scoreboard_url, teams_url = _espn_urls("nba")
    extra = {"id": "17", "name": "Nets", "abbreviation": "BKN"}
    roster = _roster_payload(
        [
            {"id": "1", "name": "Celtics", "abbreviation": "BOS"},
            {"id": "2", "name": "Heat", "abbreviation": "MIA"},
            extra,
        ]
    )

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(teams_url).mock(return_value=Response(200, json=roster))
        respx_mock.get(scoreboard_url).mock(return_value=Response(200, json=espn_mock_data))
        await sync_games("nba", get_db_session)

    teams = (await get_db_session.execute(select(Team).order_by(Team.id))).scalars().all()
    assert {t.abbreviation for t in teams} == {"BOS", "MIA", "BKN"}
    assert namespaced_team_id("nba", 17) in {t.id for t in teams}


@pytest.mark.asyncio
async def test_sync_games_records_error_fetch_run_when_espn_fails(get_db_session: AsyncSession):
    scoreboard_url, teams_url = _espn_urls("nba")

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(teams_url).mock(return_value=Response(200, json=EMPTY_ROSTER))
        respx_mock.get(scoreboard_url).mock(return_value=Response(500, json={"error": "espn down"}))
        with pytest.raises(httpx.HTTPStatusError):
            await sync_games("nba", get_db_session)

    runs = (await get_db_session.execute(select(FetchRun))).scalars().all()
    assert len(runs) == 1
    assert runs[0].league == "nba"
    assert runs[0].status == "error"


def test_current_season_window_uses_in_progress_or_last_completed_season():
    as_of = date(2026, 9, 20)
    assert current_season_window("nba", as_of) == (date(2025, 10, 1), date(2026, 6, 30))
    assert current_season_window("nhl", as_of) == (date(2025, 10, 1), date(2026, 6, 30))
    assert current_season_window("nfl", as_of) == (date(2026, 9, 1), as_of)
    assert current_season_window("mlb", as_of) == (date(2026, 3, 20), as_of)
    assert current_season_window("epl", as_of) == (date(2026, 8, 1), as_of)
    assert current_season_start("nba", as_of) == date(2025, 10, 1)
    assert current_season_start("nfl", as_of) == date(2026, 9, 1)


def test_current_season_window_clips_open_season_to_as_of():
    as_of = date(2026, 11, 15)
    assert current_season_window("nba", as_of) == (date(2026, 10, 1), as_of)
    assert current_season_window("nfl", as_of) == (date(2026, 9, 1), as_of)


def test_resolve_backfill_window_defaults_to_current_season():
    as_of = date(2026, 9, 20)
    assert resolve_backfill_window("nba", None, None, as_of) == current_season_window("nba", as_of)


def test_resolve_backfill_window_requires_both_custom_bounds():
    with pytest.raises(ValueError, match="both from and to"):
        resolve_backfill_window("nba", date(2024, 11, 1), None)


def test_resolve_backfill_window_rejects_range_over_400_days():
    with pytest.raises(ValueError, match="400"):
        resolve_backfill_window("nba", date(2024, 1, 1), date(2025, 3, 1))


def test_mlb_window_uses_previous_season_before_opening_day():
    assert current_season_window("mlb", date(2026, 2, 1)) == (date(2025, 3, 20), date(2025, 11, 5))
    with pytest.raises(ValueError, match="Unsupported league"):
        current_season_window("wnba", date(2026, 9, 20))


def test_parse_espn_teams_skips_entries_without_ids():
    payload = _roster_payload(
        [
            {"id": "1", "name": "Hawks", "abbreviation": "ATL"},
            {"name": "Ghosts", "abbreviation": "GHO"},
        ]
    )
    teams = parse_espn_teams("nba", payload)
    assert len(teams) == 1
    assert teams[0]["abbreviation"] == "ATL"


def test_parse_scoreboard_skips_events_missing_a_side():
    payload = {
        "events": [
            {
                "id": "1",
                "date": "2024-11-01T00:00Z",
                "status": {"type": {"name": "STATUS_FINAL"}},
                "competitions": [{"competitors": [{"homeAway": "home", "team": {"id": "1", "name": "Hawks"}}]}],
            }
        ]
    }
    teams, games = parse_scoreboard("nba", payload)
    assert teams == []
    assert games == []


def test_parse_scoreboard_drops_reversed_mirror_matchups():
    celtics = {"id": "1", "name": "Celtics", "abbreviation": "BOS"}
    heat = {"id": "2", "name": "Heat", "abbreviation": "MIA"}
    payload = {
        "events": [
            _scoreboard_event("100", "2024-11-20T20:30Z", celtics, heat),
            _scoreboard_event("101", "2024-11-20T20:30Z", heat, celtics),
        ]
    }
    _, games = parse_scoreboard("nba", payload)
    assert [g["id"] for g in games] == [100]


def test_parse_scoreboard_normalizes_seed_style_status_names():
    celtics = {"id": "1", "name": "Celtics", "abbreviation": "BOS"}
    heat = {"id": "2", "name": "Heat", "abbreviation": "MIA"}
    payload = {
        "events": [
            _scoreboard_event("100", "2024-11-20T20:30Z", celtics, heat, "completed", 110, 105),
        ]
    }
    _, games = parse_scoreboard("nba", payload)
    assert games[0]["status"] == "STATUS_FINAL"


def test_parse_scoreboard_normalizes_soccer_full_time_status():
    arsenal = {"id": "1", "name": "Arsenal", "abbreviation": "ARS"}
    chelsea = {"id": "2", "name": "Chelsea", "abbreviation": "CHE"}
    payload = {
        "events": [
            _scoreboard_event("100", "2024-08-17T15:00Z", arsenal, chelsea, "STATUS_FULL_TIME", 2, 1),
        ]
    }
    _, games = parse_scoreboard("epl", payload)
    assert games[0]["status"] == "STATUS_FINAL"


@pytest.mark.asyncio
async def test_sync_skips_incoming_mirror_of_existing_game(get_db_session: AsyncSession):
    league = "nba"
    celtics = {"id": "1", "name": "Celtics", "abbreviation": "BOS"}
    heat = {"id": "2", "name": "Heat", "abbreviation": "MIA"}
    first = {"events": [_scoreboard_event("100", "2024-11-20T20:30Z", celtics, heat)]}
    mirror = {"events": [_scoreboard_event("101", "2024-11-20T20:30Z", heat, celtics)]}

    with respx.mock(assert_all_called=True) as respx_mock:
        _mock_league_espn(respx_mock, league, first)
        await sync_games(league, get_db_session)

        scoreboard_url, teams_url = _espn_urls(league)
        respx_mock.get(teams_url).mock(return_value=Response(200, json=EMPTY_ROSTER))
        respx_mock.get(scoreboard_url).mock(return_value=Response(200, json=mirror))
        await sync_games(league, get_db_session)

    games = (await get_db_session.execute(select(Game))).scalars().all()
    assert [g.id for g in games] == [100]
    assert games[0].home_team_id == namespaced_team_id("nba", 1)
    assert games[0].away_team_id == namespaced_team_id("nba", 2)
