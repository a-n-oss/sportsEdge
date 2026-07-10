import math
import pytest
from engine.elo import EloEngine

def test_expected_score():
    # If ratings are equal, expected score should be 0.5
    assert EloEngine.expected_score(1500, 1500) == 0.5
    
    # If team is 400 points higher, expected score is ~0.909
    assert math.isclose(EloEngine.expected_score(1900, 1500), 1 / (1 + 10**(-1)), rel_tol=1e-5)
    
    # If team is 400 points lower, expected score is ~0.091
    assert math.isclose(EloEngine.expected_score(1100, 1500), 1 / (1 + 10**(1)), rel_tol=1e-5)

def test_home_advantage():
    assert EloEngine.get_home_advantage("NFL") == 55.0
    assert EloEngine.get_home_advantage("UNKNOWN") == 55.0

def test_k_factor():
    assert EloEngine.get_k_factor("EPL") == 24.0
    assert EloEngine.get_k_factor("NFL") == 20.0
    assert EloEngine.get_k_factor("UNKNOWN") == 20.0

def test_mov_multiplier():
    # If point diff is 0, multiplier is 1.0
    assert EloEngine.calculate_margin_of_victory_multiplier(0, 100.0) == 1.0
    
    # If point diff is 10, winner has 100 Elo advantage
    mult = EloEngine.calculate_margin_of_victory_multiplier(10, 100.0)
    expected_mult = math.log(11) * (2.2 / ((100.0 * 0.001) + 2.2))
    assert math.isclose(mult, expected_mult, rel_tol=1e-5)

def test_soccer_probabilities():
    probs = EloEngine.calculate_probabilities(1500, 1500, "EPL")
    # Probabilities should sum to 1
    assert math.isclose(sum(probs.values()), 1.0, rel_tol=1e-5)
    assert "draw" in probs
    assert probs["draw"] > 0
    
    # Home team has advantage, so P(home) > P(away) even with equal ratings
    assert probs["home"] > probs["away"]

def test_non_soccer_probabilities():
    probs = EloEngine.calculate_probabilities(1500, 1500, "NFL")
    assert math.isclose(sum(probs.values()), 1.0, rel_tol=1e-5)
    assert "draw" not in probs
    assert probs["home"] > probs["away"]

def test_calculate_new_ratings_home_win():
    new_home, new_away = EloEngine.calculate_new_ratings(1500, 1500, 24, 10, "NFL")
    assert new_home > 1500
    assert new_away < 1500

def test_calculate_new_ratings_away_win():
    new_home, new_away = EloEngine.calculate_new_ratings(1500, 1500, 10, 24, "NFL")
    assert new_home < 1500
    assert new_away > 1500

def test_calculate_new_ratings_draw():
    new_home, new_away = EloEngine.calculate_new_ratings(1500, 1500, 1, 1, "EPL")
    # Expected home is > 0.5 because of home advantage
    # Since they drew (0.5), home underperformed, away overperformed
    assert new_home < 1500
    assert new_away > 1500

def test_season_regression():
    # 25% regression towards 1500
    assert EloEngine.regress_rating(1900) == 1800  # 1900 - 0.25 * 400 = 1800
    assert EloEngine.regress_rating(1100) == 1200  # 1100 - 0.25 * -400 = 1200
    assert EloEngine.regress_rating(1500) == 1500

def test_determinism():
    res1 = EloEngine.calculate_new_ratings(1600, 1400, 102, 98, "NBA")
    res2 = EloEngine.calculate_new_ratings(1600, 1400, 102, 98, "NBA")
    assert res1 == res2
