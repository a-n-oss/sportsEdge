import math
from typing import Dict, Tuple

class EloEngine:
    MEAN_RATING = 1500.0
    DEFAULT_K = 20.0
    DEFAULT_HOME_ADVANTAGE = 55.0

    LEAGUE_K = {
        "NFL": 20.0,
        "NBA": 20.0,
        "NHL": 20.0,
        "MLB": 20.0,
        "EPL": 24.0
    }

    LEAGUE_HOME_ADVANTAGE = {
        "NFL": 55.0,
        "NBA": 55.0,
        "NHL": 55.0,
        "MLB": 55.0,
        "EPL": 55.0
    }

    @staticmethod
    def get_k_factor(league: str) -> float:
        return EloEngine.LEAGUE_K.get(league.upper(), EloEngine.DEFAULT_K)

    @staticmethod
    def get_home_advantage(league: str) -> float:
        return EloEngine.LEAGUE_HOME_ADVANTAGE.get(league.upper(), EloEngine.DEFAULT_HOME_ADVANTAGE)

    @staticmethod
    def expected_score(rating_team: float, rating_opp: float) -> float:
        """Calculate expected score based on ratings."""
        return 1.0 / (1.0 + 10.0 ** ((rating_opp - rating_team) / 400.0))

    @staticmethod
    def calculate_margin_of_victory_multiplier(point_diff: float, elo_diff_winner: float) -> float:
        """
        Calculate the Margin of Victory (MOV) multiplier for point-based sports.
        Formula: ln(|point_diff| + 1) * (2.2 / ((elo_diff_winner * 0.001) + 2.2))
        """
        if point_diff == 0:
            return 1.0
        mov = abs(point_diff)
        multiplier = math.log(mov + 1) * (2.2 / ((elo_diff_winner * 0.001) + 2.2))
        return multiplier

    @staticmethod
    def calculate_probabilities(
        home_rating: float, 
        away_rating: float, 
        league: str
    ) -> Dict[str, float]:
        """
        Calculate win probabilities for a match.
        For soccer (EPL), calculates 3-way probabilities (home, away, draw).
        For other sports, calculates 2-way probabilities.
        """
        home_adv = EloEngine.get_home_advantage(league)
        home_eff_rating = home_rating + home_adv
        
        expected_home = EloEngine.expected_score(home_eff_rating, away_rating)
        expected_away = 1.0 - expected_home

        if league.upper() == "EPL":
            # Soccer draw modeling
            elo_diff = home_eff_rating - away_rating
            d_max = 0.28
            p_draw = d_max * math.exp(-((elo_diff / 400.0) ** 2))
            
            # Scale P(home win) and P(away win) proportionally
            remaining_prob = 1.0 - p_draw
            scaled_home = expected_home * remaining_prob
            scaled_away = expected_away * remaining_prob
            
            return {
                "home": scaled_home,
                "away": scaled_away,
                "draw": p_draw
            }
        else:
            return {
                "home": expected_home,
                "away": expected_away
            }

    @staticmethod
    def calculate_new_ratings(
        home_rating: float, 
        away_rating: float, 
        home_score: float, 
        away_score: float, 
        league: str
    ) -> Tuple[float, float]:
        """
        Calculate updated Elo ratings after a game.
        """
        home_adv = EloEngine.get_home_advantage(league)
        home_eff_rating = home_rating + home_adv

        expected_home = EloEngine.expected_score(home_eff_rating, away_rating)
        expected_away = 1.0 - expected_home

        if home_score > away_score:
            s_home, s_away = 1.0, 0.0
            point_diff = home_score - away_score
            elo_diff_winner = home_eff_rating - away_rating
        elif away_score > home_score:
            s_home, s_away = 0.0, 1.0
            point_diff = away_score - home_score
            elo_diff_winner = away_rating - home_eff_rating
        else:
            s_home, s_away = 0.5, 0.5
            point_diff = 0
            elo_diff_winner = 0.0

        k = EloEngine.get_k_factor(league)
        
        # MOV multiplier is 1.0 for soccer (EPL doesn't strictly use points diff for Elo scaling typically, but we use point diff = 0 for draws)
        if league.upper() == "EPL":
            # For soccer, we typically don't apply the MOV multiplier, or if we do, it's based on goal difference.
            # Assuming standard Elo K-factor for EPL handles the weight, but we'll apply standard MOV if requested.
            # The spec says: "Margin-of-victory multiplier for point-based sports"
            # So we only apply it if it's not EPL, or we apply it if point_diff > 0.
            # We'll skip MOV for EPL to stick to basic 3-way soccer Elo unless specified.
            mov_mult = 1.0
        else:
            mov_mult = EloEngine.calculate_margin_of_victory_multiplier(point_diff, elo_diff_winner)

        new_home_rating = home_rating + (k * mov_mult * (s_home - expected_home))
        new_away_rating = away_rating + (k * mov_mult * (s_away - expected_away))

        return new_home_rating, new_away_rating

    @staticmethod
    def regress_rating(rating: float) -> float:
        """
        Regress rating 25% toward the mean (1500) at the start of each season.
        """
        return rating - 0.25 * (rating - EloEngine.MEAN_RATING)
