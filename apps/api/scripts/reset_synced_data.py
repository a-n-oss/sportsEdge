"""Wipe ESPN-synced sports data so a fresh sync can rebuild correct league associations.

Use after deploying the namespaced team-id fix. Existing rows used raw ESPN team IDs
as primary keys, which collide across leagues and corrupt names/leagues.

Usage:
  cd apps/api && uv run python scripts/reset_synced_data.py
  # optional: also refresh all leagues
  cd apps/api && uv run python scripts/reset_synced_data.py --refresh
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fetchers.espn import LEAGUE_MAP, sync_games

TABLES_IN_FK_ORDER = (
    "predictions",
    "rating_history",
    "ratings",
    "games",
    "teams",
    "fetch_runs",
)


async def reset_synced_data(*, refresh: bool) -> None:
    database_url = os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://sportsedge:sportsedge_password@localhost:5432/sportsedge_db"
    )
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        for table in TABLES_IN_FK_ORDER:
            await conn.execute(text(f"TRUNCATE {table} CASCADE"))
        print(f"Truncated: {', '.join(TABLES_IN_FK_ORDER)}")

    if refresh:
        async with session_factory() as session:
            for league in LEAGUE_MAP:
                print(f"Syncing {league}...")
                await sync_games(league, session)
        print("Refresh completed.")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="After truncate, sync all leagues from ESPN",
    )
    args = parser.parse_args()
    asyncio.run(reset_synced_data(refresh=args.refresh))


if __name__ == "__main__":
    main()
