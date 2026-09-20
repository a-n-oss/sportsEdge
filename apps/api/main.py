import asyncio
import logging
import os
import subprocess
import sys
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore # 3rd party library lacks stubs
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1.endpoints import router as api_v1_router
from core.runtime import (
    is_production_environment,
    resolve_admin_token,
    should_skip_espn_scheduler,
    should_skip_startup_migrations,
)
from db.session import AsyncSessionLocal
from fetchers.espn import LEAGUE_MAP, sync_games
from fetchers.schedule import (
    LEAGUE_REQUEST_GAP_SECONDS,
    in_slate_window,
    register_espn_jobs,
    scoreboard_dates,
)

logger = logging.getLogger(__name__)

_espn_sync_lock: asyncio.Lock | None = None


def _sync_lock() -> asyncio.Lock:
    global _espn_sync_lock
    if _espn_sync_lock is None:
        _espn_sync_lock = asyncio.Lock()
    return _espn_sync_lock


async def async_sleep(seconds: float) -> None:
    await asyncio.sleep(seconds)


def _run_migrations() -> None:
    """Run alembic in a subprocess to avoid nested asyncio.run / event-loop deadlocks."""
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        check=True,
    )


async def scheduled_fetch_games(
    include_previous_day: bool = False,
    now: datetime | None = None,
) -> None:
    moment = now if now is not None else datetime.now(UTC)
    dates = scoreboard_dates(include_previous_day=include_previous_day, now=moment)
    logger.info(
        "Starting ESPN sync include_previous_day=%s dates=%s",
        include_previous_day,
        dates,
    )
    async with _sync_lock():
        async with AsyncSessionLocal() as session:
            first_league = True
            for league in LEAGUE_MAP:
                if not first_league:
                    await async_sleep(LEAGUE_REQUEST_GAP_SECONDS)
                first_league = False
                for date in dates:
                    try:
                        await sync_games(league, session, date)
                    except Exception as e:
                        logger.error("Error syncing %s (date=%s): %s", league, date, e)
            await session.commit()
    logger.info("Finished ESPN sync")


async def frequent_refresh(now: datetime | None = None) -> None:
    moment = now if now is not None else datetime.now(UTC)
    if not in_slate_window(moment):
        logger.info("Skipping frequent ESPN refresh outside slate window")
        return
    await scheduled_fetch_games(include_previous_day=False, now=moment)


async def daily_full_pass() -> None:
    await scheduled_fetch_games(include_previous_day=True)


def build_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    register_espn_jobs(scheduler, frequent=frequent_refresh, daily=daily_full_pass)
    return scheduler


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

    scheduler = None
    if should_skip_espn_scheduler():
        # Seed-locked e2e: a misfired */20 cron would scrape ESPN and overwrite
        # GSW / Boston Celtics fixtures with the live board.
        logger.info("SKIP_ESPN_SCHEDULER=1 — ESPN scheduler not started")
    else:
        scheduler = build_scheduler()
        scheduler.start()

        # Kick off ESPN sync in the background so /health can pass during boot
        if is_production_environment():
            logger.info("Production environment detected — scheduling initial data sync...")
            asyncio.create_task(scheduled_fetch_games())

    yield
    if scheduler is not None:
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
