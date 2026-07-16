import asyncio
import os
from collections.abc import AsyncGenerator

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import text
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


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    # Ensure tables exist once per session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


@pytest_asyncio.fixture()
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    # Truncate tables before each test
    async with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(text(f"TRUNCATE {table.name} CASCADE;"))

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


@pytest_asyncio.fixture()
async def async_client(get_db_session: AsyncSession) -> AsyncGenerator[httpx.AsyncClient, None]:
    from db.session import get_db
    from main import app

    # Override the dependency to use the test session
    async def override_get_db():
        yield get_db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
