from datetime import datetime, timezone

import pytest
import respx
from httpx import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db.models import FetchRun, Game, Team
from fetchers.espn import LEAGUE_MAP, fetch_scoreboard, sync_games


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

        # Verify Teams were inserted
        result_teams = await get_db_session.execute(select(Team).order_by(Team.id))
        teams = result_teams.scalars().all()
        assert len(teams) == 2
        assert teams[0].id == 1
        assert teams[0].name == "Celtics"
        assert teams[1].id == 2
        assert teams[1].name == "Heat"

        # Verify Game was inserted
        result_games = await get_db_session.execute(select(Game))
        games = result_games.scalars().all()
        assert len(games) == 1
        assert games[0].id == 12345
        assert games[0].status == "STATUS_SCHEDULED"
        assert games[0].home_team_id == 1
        assert games[0].away_team_id == 2
        assert games[0].date == datetime(2024, 11, 20, 20, 30, tzinfo=timezone.utc)

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
