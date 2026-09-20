from datetime import UTC, datetime, tzinfo
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient

from core.runtime import UnsafeAdminTokenError
from fetchers.espn import LEAGUE_MAP
from fetchers.schedule import (
    DAILY_FULL_PASS_JOB_ID,
    FREQUENT_REFRESH_JOB_ID,
    LEAGUE_REQUEST_GAP_SECONDS,
)
from main import (
    app,
    async_sleep,
    build_scheduler,
    daily_full_pass,
    frequent_refresh,
    lifespan,
    scheduled_fetch_games,
)

EASTERN = ZoneInfo("America/New_York")

client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_build_scheduler_registers_frequent_and_daily_jobs():
    scheduler = build_scheduler()
    ids = {job.id for job in scheduler.get_jobs()}
    assert ids == {FREQUENT_REFRESH_JOB_ID, DAILY_FULL_PASS_JOB_ID}


class _FakeSession:
    async def commit(self) -> None:
        return None

    async def __aenter__(self) -> "_FakeSession":
        return self

    async def __aexit__(self, *args: object) -> bool:
        return False


@pytest.mark.asyncio
async def test_scheduled_fetch_games_syncs_each_league_current_board(monkeypatch):
    calls: list[tuple[str, str | None]] = []

    async def fake_sync(league: str, session: object, date: str | None = None) -> None:
        calls.append((league, date))

    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("main.sync_games", fake_sync)
    monkeypatch.setattr("main.AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr("main.async_sleep", fake_sleep)

    await scheduled_fetch_games(now=datetime(2026, 1, 16, 20, 0, tzinfo=UTC))
    assert [league for league, _date in calls] == list(LEAGUE_MAP.keys())
    assert all(date is None for _league, date in calls)


@pytest.mark.asyncio
async def test_daily_full_pass_also_requests_yesterday_scoreboard(monkeypatch):
    calls: list[tuple[str, str | None]] = []

    async def fake_sync(league: str, session: object, date: str | None = None) -> None:
        calls.append((league, date))

    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("main.sync_games", fake_sync)
    monkeypatch.setattr("main.AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr("main.async_sleep", fake_sleep)

    await scheduled_fetch_games(include_previous_day=True, now=datetime(2026, 1, 16, 8, 0, tzinfo=UTC))
    by_league: dict[str, list[str | None]] = {}
    for league, date in calls:
        by_league.setdefault(league, []).append(date)
    assert list(by_league) == list(LEAGUE_MAP.keys())
    for dates in by_league.values():
        assert dates == [None, "20260115"]


@pytest.mark.asyncio
async def test_scheduled_fetch_continues_after_league_error(monkeypatch):
    calls: list[str] = []

    async def fake_sync(league: str, session: object, date: str | None = None) -> None:
        calls.append(league)
        if league == "nba":
            raise RuntimeError("espn down")

    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("main.sync_games", fake_sync)
    monkeypatch.setattr("main.AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr("main.async_sleep", fake_sleep)

    await scheduled_fetch_games(now=datetime(2026, 1, 16, 20, 0, tzinfo=UTC))
    assert calls == list(LEAGUE_MAP.keys())


@pytest.mark.asyncio
async def test_scheduled_fetch_paces_league_requests(monkeypatch):
    sleeps: list[float] = []

    async def fake_sync(league: str, session: object, date: str | None = None) -> None:
        return None

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("main.sync_games", fake_sync)
    monkeypatch.setattr("main.AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr("main.async_sleep", fake_sleep)

    await scheduled_fetch_games(now=datetime(2026, 1, 16, 20, 0, tzinfo=UTC))
    assert sleeps == [LEAGUE_REQUEST_GAP_SECONDS] * (len(LEAGUE_MAP) - 1)


@pytest.mark.asyncio
async def test_frequent_refresh_skips_outside_slate_window(monkeypatch):
    ran = False

    async def fake_scheduled(**kwargs: object) -> None:
        nonlocal ran
        ran = True

    monkeypatch.setattr("main.scheduled_fetch_games", fake_scheduled)
    await frequent_refresh(now=datetime(2026, 1, 17, 4, 0, tzinfo=EASTERN))
    assert ran is False


@pytest.mark.asyncio
async def test_frequent_refresh_runs_inside_slate_window(monkeypatch):
    kwargs_seen: dict[str, object] = {}

    async def fake_scheduled(**kwargs: object) -> None:
        kwargs_seen.update(kwargs)

    monkeypatch.setattr("main.scheduled_fetch_games", fake_scheduled)
    when = datetime(2026, 1, 16, 20, 0, tzinfo=EASTERN)
    await frequent_refresh(now=when)
    assert kwargs_seen["include_previous_day"] is False
    assert kwargs_seen["now"] == when


@pytest.mark.asyncio
async def test_daily_full_pass_sets_include_previous_day(monkeypatch):
    kwargs_seen: dict[str, object] = {}

    async def fake_scheduled(**kwargs: object) -> None:
        kwargs_seen.update(kwargs)

    monkeypatch.setattr("main.scheduled_fetch_games", fake_scheduled)
    await daily_full_pass()
    assert kwargs_seen["include_previous_day"] is True


class _FrozenDateTime:
    @staticmethod
    def now(tz: tzinfo | None = None) -> datetime:
        return datetime(2026, 1, 16, 20, 0, tzinfo=tz)


class _FakeScheduler:
    def __init__(self) -> None:
        self.started = False
        self.shutdown_called = False

    def start(self) -> None:
        self.started = True

    def shutdown(self) -> None:
        self.shutdown_called = True


@pytest.mark.asyncio
async def test_async_sleep_delegates_to_asyncio(monkeypatch):
    slept: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        slept.append(seconds)

    monkeypatch.setattr("main.asyncio.sleep", fake_sleep)
    await async_sleep(0.5)
    assert slept == [0.5]


@pytest.mark.asyncio
async def test_scheduled_fetch_games_defaults_now_to_utc_clock(monkeypatch):
    calls: list[tuple[str, str | None]] = []

    async def fake_sync(league: str, session: object, date: str | None = None) -> None:
        calls.append((league, date))

    async def fake_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("main.sync_games", fake_sync)
    monkeypatch.setattr("main.AsyncSessionLocal", lambda: _FakeSession())
    monkeypatch.setattr("main.async_sleep", fake_sleep)
    monkeypatch.setattr("main.datetime", _FrozenDateTime)

    await scheduled_fetch_games(include_previous_day=True)
    first_league_dates = [date for league, date in calls if league == "nfl"]
    assert first_league_dates == [None, "20260115"]


@pytest.mark.asyncio
async def test_frequent_refresh_defaults_now_to_utc_clock(monkeypatch):
    kwargs_seen: dict[str, object] = {}

    async def fake_scheduled(**kwargs: object) -> None:
        kwargs_seen.update(kwargs)

    monkeypatch.setattr("main.scheduled_fetch_games", fake_scheduled)
    monkeypatch.setattr("main.datetime", _FrozenDateTime)
    await frequent_refresh()
    assert kwargs_seen["now"] == datetime(2026, 1, 16, 20, 0, tzinfo=UTC)
    assert kwargs_seen["include_previous_day"] is False


@pytest.mark.asyncio
async def test_lifespan_skips_migrations_and_starts_scheduler(monkeypatch):
    monkeypatch.setenv("SKIP_MIGRATIONS", "1")
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    scheduler = _FakeScheduler()
    monkeypatch.setattr("main.build_scheduler", lambda: scheduler)

    async with lifespan(app):
        assert scheduler.started is True
    assert scheduler.shutdown_called is True


@pytest.mark.asyncio
async def test_lifespan_runs_migrations_when_not_skipped(monkeypatch):
    monkeypatch.delenv("SKIP_MIGRATIONS", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    ran: list[str] = []

    def fake_migrations() -> None:
        ran.append("migrate")

    async def fake_to_thread(fn: object) -> None:
        if callable(fn):
            fn()

    scheduler = _FakeScheduler()
    monkeypatch.setattr("main._run_migrations", fake_migrations)
    monkeypatch.setattr("main.asyncio.to_thread", fake_to_thread)
    monkeypatch.setattr("main.build_scheduler", lambda: scheduler)

    async with lifespan(app):
        assert ran == ["migrate"]
        assert scheduler.started is True
    assert scheduler.shutdown_called is True


@pytest.mark.asyncio
async def test_lifespan_kicks_off_boot_sync_on_railway(monkeypatch):
    monkeypatch.setenv("SKIP_MIGRATIONS", "1")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    # Prod hardening refuses the documented local default; boot-sync still runs
    # when a real token is configured.
    monkeypatch.setenv("ADMIN_TOKEN", "railway-real-token")
    boot: list[str] = []

    async def fake_sync(*args: object, **kwargs: object) -> None:
        boot.append("sync")

    scheduler = _FakeScheduler()
    monkeypatch.setattr("main.scheduled_fetch_games", fake_sync)
    monkeypatch.setattr("main.build_scheduler", lambda: scheduler)

    async with lifespan(app):
        await async_sleep(0)

    assert boot == ["sync"]


@pytest.mark.asyncio
async def test_lifespan_refuses_production_default_admin_token(monkeypatch):
    monkeypatch.setenv("SKIP_MIGRATIONS", "1")
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)
    monkeypatch.setattr("main.build_scheduler", lambda: _FakeScheduler())

    with pytest.raises(UnsafeAdminTokenError, match="ADMIN_TOKEN"):
        async with lifespan(app):
            pass
