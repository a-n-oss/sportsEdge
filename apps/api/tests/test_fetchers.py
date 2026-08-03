from datetime import UTC, datetime

import pytest
import respx
from httpx import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Game, Team
from fetchers.espn import LEAGUE_MAP, fetch_scoreboard, namespaced_team_id, sync_games


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


@pytest.mark.asyncio
async def test_sync_games_upsert(espn_mock_data, get_db_session: AsyncSession):
    # This assumes get_db_session is a fixture that yields a real async db session connected to test db
    league = "nba"
    sport, espn_league = LEAGUE_MAP[league]
    url = f"https://site.api.espn.com/apis/site/v2/sports/{sport}/{espn_league}/scoreboard"

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(url).mock(return_value=Response(200, json=espn_mock_data))

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

        respx_mock.get(url).mock(return_value=Response(200, json=espn_mock_data))
        await sync_games(league, get_db_session)

        # Verify Game was updated
        result_games = await get_db_session.execute(select(Game).execution_options(populate_existing=True))
        games = result_games.scalars().all()
        assert len(games) == 1
        assert games[0].status == "STATUS_FINAL"
        assert games[0].home_score == 110
        assert games[0].away_score == 105


def test_namespaced_team_id_is_league_scoped():
    assert namespaced_team_id("mlb", 14) != namespaced_team_id("nba", 14)
    assert namespaced_team_id("nhl", 28) != namespaced_team_id("nba", 28)
    assert namespaced_team_id("NBA", 1) == 2_000_001


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

    mlb_url = f"https://site.api.espn.com/apis/site/v2/sports/{LEAGUE_MAP['mlb'][0]}/{LEAGUE_MAP['mlb'][1]}/scoreboard"
    nba_url = f"https://site.api.espn.com/apis/site/v2/sports/{LEAGUE_MAP['nba'][0]}/{LEAGUE_MAP['nba'][1]}/scoreboard"

    with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.get(mlb_url).mock(return_value=Response(200, json=mlb_board))
        await sync_games("mlb", get_db_session)

        respx_mock.get(nba_url).mock(return_value=Response(200, json=nba_board))
        await sync_games("nba", get_db_session)

    result = await get_db_session.execute(select(Team).order_by(Team.league, Team.id))
    teams = {(t.league, t.name): t for t in result.scalars().all()}

    assert teams[("mlb", "Blue Jays")].id == namespaced_team_id("mlb", 14)
    assert teams[("mlb", "Blue Jays")].league == "mlb"
    assert teams[("nba", "Raptors")].id == namespaced_team_id("nba", 14)
    assert teams[("nba", "Raptors")].league == "nba"
    assert len(teams) == 4
