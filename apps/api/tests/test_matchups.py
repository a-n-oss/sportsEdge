from datetime import UTC, datetime

from engine.matchups import dedupe_mirror_matchups


def _game(*, game_id: int, home: int, away: int, date: str = "2024-11-20T20:30:00+00:00") -> dict:
    return {
        "id": game_id,
        "league": "nba",
        "date": datetime.fromisoformat(date).replace(tzinfo=UTC) if "T" in date else date,
        "home_team_id": home,
        "away_team_id": away,
        "status": "STATUS_SCHEDULED",
    }


def test_dedupe_keeps_first_orientation_of_a_mirror_pair():
    games = [
        _game(game_id=1, home=21, away=10),
        _game(game_id=2, home=10, away=21),
    ]
    result = dedupe_mirror_matchups(games)
    assert [g["id"] for g in result] == [1]


def test_dedupe_does_not_collapse_different_matchups():
    games = [
        _game(game_id=1, home=21, away=10),
        _game(game_id=2, home=4, away=30),
    ]
    assert [g["id"] for g in dedupe_mirror_matchups(games)] == [1, 2]


def test_dedupe_keeps_same_orientation_doubleheaders():
    games = [
        _game(game_id=1, home=21, away=10, date="2024-11-20T17:00:00+00:00"),
        _game(game_id=2, home=21, away=10, date="2024-11-20T23:00:00+00:00"),
    ]
    assert [g["id"] for g in dedupe_mirror_matchups(games)] == [1, 2]
