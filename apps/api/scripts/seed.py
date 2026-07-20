import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Add the parent directory to sys.path to allow importing from the main app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.models import Base, Game, Prediction, RatingHistory, Team


async def seed():
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://sportsedge:sportsedge_password@localhost:5432/sportsedge_db"
    )
    engine = create_async_engine(database_url)
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        # Drop all tables and recreate them to ensure a clean slate
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # Create Teams
        lakers = Team(id=1, league="nba", name="Los Angeles Lakers", abbreviation="LAL")
        celtics = Team(id=2, league="nba", name="Boston Celtics", abbreviation="BOS")
        warriors = Team(id=3, league="nba", name="Golden State Warriors", abbreviation="GSW")
        heat = Team(id=4, league="nba", name="Miami Heat", abbreviation="MIA")

        session.add_all([lakers, celtics, warriors, heat])
        await session.commit()

        # Create Historical Games (Past)
        past_date = datetime.now(timezone.utc) - timedelta(days=2)
        game_past = Game(
            id=101,
            league="nba",
            date=past_date,
            status="completed",
            home_team_id=1,
            away_team_id=2,
            home_score=110,
            away_score=105,
        )
        session.add(game_past)
        await session.commit()

        # Create Upcoming Games (Future)
        future_date_1 = datetime.now(timezone.utc) + timedelta(days=1)
        future_date_2 = datetime.now(timezone.utc) + timedelta(days=2)

        game_future_1 = Game(
            id=102,
            league="nba",
            date=future_date_1,
            status="scheduled",
            home_team_id=3,
            away_team_id=1,
            home_score=None,
            away_score=None,
        )
        game_future_2 = Game(
            id=103,
            league="nba",
            date=future_date_2,
            status="scheduled",
            home_team_id=2,
            away_team_id=4,
            home_score=None,
            away_score=None,
        )
        session.add_all([game_future_1, game_future_2])
        await session.commit()

        # Create Rating History
        rh1 = RatingHistory(team_id=1, game_id=101, elo_rating=1550.0, date=past_date)
        rh2 = RatingHistory(team_id=2, game_id=101, elo_rating=1480.0, date=past_date)
        rh3 = RatingHistory(team_id=3, game_id=None, elo_rating=1600.0, date=past_date)  # No games played yet
        rh4 = RatingHistory(team_id=4, game_id=None, elo_rating=1520.0, date=past_date)

        session.add_all([rh1, rh2, rh3, rh4])
        await session.commit()

        # Create Predictions for future games
        pred1 = Prediction(game_id=102, home_win_prob=0.65, away_win_prob=0.35, draw_prob=None)
        pred2 = Prediction(game_id=103, home_win_prob=0.45, away_win_prob=0.55, draw_prob=None)
        session.add_all([pred1, pred2])
        await session.commit()

    await engine.dispose()
    print("✅ Database seeded deterministically.")


if __name__ == "__main__":
    asyncio.run(seed())
