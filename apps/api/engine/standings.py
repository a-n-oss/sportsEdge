from collections.abc import Sequence

TREND_LOOKBACK_GAMES = 5


def standing_trend(current_elo: float, chronological_history: Sequence[float]) -> int | None:
    """Δ Elo over the last TREND_LOOKBACK_GAMES updates.

    ``chronological_history`` is post-game (or post-regression) Elo, oldest first.
    Returns None when there is no history so the UI can show an em dash.
    """
    if not chronological_history:
        return None
    if len(chronological_history) > TREND_LOOKBACK_GAMES:
        baseline = chronological_history[-(TREND_LOOKBACK_GAMES + 1)]
    else:
        baseline = chronological_history[0]
    return round(current_elo - baseline)
