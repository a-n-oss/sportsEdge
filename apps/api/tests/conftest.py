import asyncio
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.config import settings
from db.models import Base

# We will use the main DB URL but we wrap tests in a transaction that rolls back
engine = create_async_engine(settings.DATABASE_URL, echo=False)

TestingSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for each test case."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture()
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    # Create engine inside the current test's loop
    test_engine = create_async_engine(settings.DATABASE_URL, echo=False)

    # Ensure tables exist
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with test_engine.connect() as connection:
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

    await test_engine.dispose()
