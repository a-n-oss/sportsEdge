import asyncio
import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer  # type: ignore # 3rd party library lacks stubs

from core.config import settings
from db.models import Base

# Check if we are running in CI
is_ci = os.environ.get("CI") == "true"

if is_ci:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
else:
    # Use testcontainers locally
    postgres = PostgresContainer("postgres:16-alpine", driver="asyncpg")
    postgres.start()
    engine = create_async_engine(postgres.get_connection_url(), echo=False)

TestingSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


def pytest_sessionfinish(session, exitstatus):
    if not is_ci:
        postgres.stop()


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture()
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    # Ensure tables exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with engine.connect() as connection:
        transaction = await connection.begin()

        test_session_maker = async_sessionmaker(
            bind=connection,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

        async with test_session_maker() as session:
            yield session

        await transaction.rollback()
