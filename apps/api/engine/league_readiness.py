from engine.elo import EloEngine


def is_league_ready(*, ratings: list[float], upcoming_elo_pairs: list[tuple[float, float]]) -> bool:
    """A league is ready when any Elo has left the default, or a slate game has a pre-HFA delta."""
    mean = EloEngine.MEAN_RATING
    if any(rating != mean for rating in ratings):
        return True
    return any(home != away for home, away in upcoming_elo_pairs)
