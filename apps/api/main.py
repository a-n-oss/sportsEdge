import logging
import os
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore # 3rd party library lacks stubs
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.v1.endpoints import router as api_v1_router
from db.session import AsyncSessionLocal
from fetchers.espn import LEAGUE_MAP, sync_games

logger = logging.getLogger(__name__)


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
    scheduler = AsyncIOScheduler()
    scheduler.add_job(scheduled_fetch_games, "cron", hour=8)
    scheduler.start()
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
