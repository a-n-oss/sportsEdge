import asyncio
import logging
import os
import subprocess
import sys
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore # 3rd party library lacks stubs
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1.endpoints import router as api_v1_router
from core.runtime import is_production_environment, resolve_admin_token, should_skip_startup_migrations
from db.session import AsyncSessionLocal
from fetchers.espn import LEAGUE_MAP, sync_games

logger = logging.getLogger(__name__)


def _run_migrations() -> None:
    """Run alembic in a subprocess to avoid nested asyncio.run / event-loop deadlocks."""
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
    )


async def scheduled_fetch_games():
    logger.info("Starting scheduled task: scheduled_fetch_games")
    async with AsyncSessionLocal() as session:
        for league in LEAGUE_MAP.keys():
            try:
                await sync_games(league, session)
            except Exception as e:
                logger.error(f"Error syncing {league}: {e}")
        await session.commit()
    logger.info("Finished scheduled task: scheduled_fetch_games")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail closed: never boot in production with the documented local ADMIN_TOKEN default.
    resolve_admin_token()

    # SKIP_MIGRATIONS=1 is a silent skip: Alembic will NOT run during API boot.
    # If the Railway API service currently has SKIP_MIGRATIONS=1 and there is no
    # preDeployCommand running `alembic upgrade head`, schema changes in this
    # deploy will not apply. Do not set this flag unless migrations are run
    # elsewhere. Agents must not flip Railway env vars; see docs/ops.md.
    # Avoid blocking /health on Alembic — nested event loops historically deadlocked.
    if should_skip_startup_migrations():
        logger.info("SKIP_MIGRATIONS=1 — skipping Alembic on startup")
    else:
        logger.info("Running database migrations...")
        await asyncio.to_thread(_run_migrations)
        logger.info("Database migrations complete.")

    scheduler = AsyncIOScheduler()
    scheduler.add_job(scheduled_fetch_games, "cron", hour=8)
    scheduler.start()

    # Kick off ESPN sync in the background so /health can pass during boot
    if is_production_environment():
        logger.info("Production environment detected — scheduling initial data sync...")
        asyncio.create_task(scheduled_fetch_games())

    yield
    scheduler.shutdown()


app = FastAPI(title="SportsEdge API", version="1.0.0", lifespan=lifespan)
origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


app.include_router(api_v1_router)
