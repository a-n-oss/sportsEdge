"""ESPN refresh cadence: schedule policy and job registration.

All clock assertions use fixed timezone-aware datetimes — never datetime.now().
"""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest
from apscheduler.schedulers.background import BackgroundScheduler  # type: ignore[import-untyped]
from apscheduler.triggers.cron import CronTrigger  # type: ignore[import-untyped]

from fetchers.schedule import (
    DAILY_FULL_PASS_JOB_ID,
    FREQUENT_REFRESH_JOB_ID,
    espn_cron_jobs,
    in_slate_window,
    parse_retry_after,
    register_espn_jobs,
    retry_delay_seconds,
    scoreboard_dates,
)

EASTERN = ZoneInfo("America/New_York")


def test_espn_cron_jobs_define_frequent_slate_and_daily_utc_pass():
    jobs = {spec.id: spec for spec in espn_cron_jobs()}

    frequent = jobs[FREQUENT_REFRESH_JOB_ID]
    assert frequent.kind == "frequent"
    assert frequent.minute == "*/20"
    assert frequent.hour == "8-23,0-3"
    assert frequent.timezone == "America/New_York"

    daily = jobs[DAILY_FULL_PASS_JOB_ID]
    assert daily.kind == "daily"
    assert daily.minute == 0
    assert daily.hour == 8
    assert daily.timezone == "UTC"


@pytest.mark.parametrize(
    ("when", "expected"),
    [
        # Winter (EST, UTC-5)
        (datetime(2026, 1, 16, 8, 0, tzinfo=EASTERN), True),
        (datetime(2026, 1, 16, 20, 15, tzinfo=EASTERN), True),
        (datetime(2026, 1, 17, 3, 59, tzinfo=EASTERN), True),
        (datetime(2026, 1, 17, 4, 0, tzinfo=EASTERN), False),
        (datetime(2026, 1, 17, 7, 59, tzinfo=EASTERN), False),
        # Summer (EDT, UTC-4) — same local hours, different UTC offset
        (datetime(2026, 7, 15, 8, 0, tzinfo=EASTERN), True),
        (datetime(2026, 7, 15, 23, 40, tzinfo=EASTERN), True),
        (datetime(2026, 7, 16, 3, 0, tzinfo=EASTERN), True),
        (datetime(2026, 7, 16, 4, 0, tzinfo=EASTERN), False),
        # Naive UTC treated as UTC: 20:00 UTC = 15:00 EST in January
        (datetime(2026, 1, 16, 20, 0), True),
        # 08:00 UTC = 03:00 EST (in window) vs 04:00 EDT (out of window)
        (datetime(2026, 1, 16, 8, 0, tzinfo=UTC), True),
        (datetime(2026, 7, 16, 8, 0, tzinfo=UTC), False),
    ],
)
def test_in_slate_window_uses_america_new_york_hours(when: datetime, expected: bool):
    assert in_slate_window(when) is expected


def test_scoreboard_dates_frequent_refresh_uses_live_board_only():
    now = datetime(2026, 1, 16, 23, 30, tzinfo=UTC)
    assert scoreboard_dates(include_previous_day=False, now=now) == [None]


def test_scoreboard_dates_daily_pass_includes_yesterday_yyyymmdd():
    now = datetime(2026, 1, 16, 8, 0, tzinfo=UTC)
    assert scoreboard_dates(include_previous_day=True, now=now) == [None, "20260115"]


def test_retry_delay_doubles_and_caps():
    assert retry_delay_seconds(0) == 2.0
    assert retry_delay_seconds(1) == 4.0
    assert retry_delay_seconds(2) == 8.0
    assert retry_delay_seconds(10) == 30.0


def test_retry_delay_honors_retry_after_but_still_caps():
    assert retry_delay_seconds(0, retry_after=3.0) == 3.0
    assert retry_delay_seconds(0, retry_after=120.0) == 30.0
    assert retry_delay_seconds(0, retry_after=0.0) == 2.0


def test_parse_retry_after_seconds_or_none():
    assert parse_retry_after("5") == 5.0
    assert parse_retry_after("5.5") == 5.5
    assert parse_retry_after(None) is None
    assert parse_retry_after("Wed, 21 Oct 2015 07:28:00 GMT") is None


def _noop() -> None:
    return None


def test_register_espn_jobs_adds_coalesced_cron_jobs():
    scheduler = BackgroundScheduler()
    register_espn_jobs(scheduler, frequent=_noop, daily=_noop)

    ids = {job.id for job in scheduler.get_jobs()}
    assert ids == {FREQUENT_REFRESH_JOB_ID, DAILY_FULL_PASS_JOB_ID}

    frequent = scheduler.get_job(FREQUENT_REFRESH_JOB_ID)
    daily = scheduler.get_job(DAILY_FULL_PASS_JOB_ID)
    assert frequent is not None
    assert daily is not None
    assert frequent.coalesce is True
    assert frequent.max_instances == 1
    assert daily.coalesce is True
    assert daily.max_instances == 1
    assert isinstance(frequent.trigger, CronTrigger)
    assert isinstance(daily.trigger, CronTrigger)
    assert str(frequent.trigger.timezone) == "America/New_York"
    assert str(daily.trigger.timezone) == "UTC"


def test_frequent_trigger_fires_every_20_min_inside_et_window_not_quiet_hours():
    scheduler = BackgroundScheduler()
    register_espn_jobs(scheduler, frequent=_noop, daily=_noop)
    trigger = scheduler.get_job(FREQUENT_REFRESH_JOB_ID).trigger

    # Next fire after 07:59 ET Friday is 08:00
    after_quiet = datetime(2026, 1, 16, 7, 59, tzinfo=EASTERN)
    first = trigger.get_next_fire_time(None, after_quiet)
    assert first == datetime(2026, 1, 16, 8, 0, tzinfo=EASTERN)

    # Inside the window, 20-minute cadence
    after_eight = datetime(2026, 1, 16, 8, 1, tzinfo=EASTERN)
    second = trigger.get_next_fire_time(None, after_eight)
    assert second == datetime(2026, 1, 16, 8, 20, tzinfo=EASTERN)

    # Last slot before quiet hours is 03:40 ET; next after 03:41 is 08:00
    late_night = datetime(2026, 1, 17, 3, 41, tzinfo=EASTERN)
    after_window = trigger.get_next_fire_time(None, late_night)
    assert after_window == datetime(2026, 1, 17, 8, 0, tzinfo=EASTERN)

    quiet = datetime(2026, 1, 17, 4, 0, tzinfo=EASTERN)
    assert trigger.get_next_fire_time(None, quiet) == datetime(2026, 1, 17, 8, 0, tzinfo=EASTERN)


def test_daily_trigger_fires_at_08_utc():
    scheduler = BackgroundScheduler()
    register_espn_jobs(scheduler, frequent=_noop, daily=_noop)
    trigger = scheduler.get_job(DAILY_FULL_PASS_JOB_ID).trigger

    before = datetime(2026, 1, 16, 7, 0, tzinfo=UTC)
    nxt = trigger.get_next_fire_time(None, before)
    assert nxt == datetime(2026, 1, 16, 8, 0, tzinfo=UTC)

    after = datetime(2026, 1, 16, 8, 1, tzinfo=UTC)
    nxt_next = trigger.get_next_fire_time(None, after)
    assert nxt_next == datetime(2026, 1, 17, 8, 0, tzinfo=UTC)
