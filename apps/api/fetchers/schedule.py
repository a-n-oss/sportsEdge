"""ESPN refresh cadence: timezone-aware cron specs, backoff, and job registration.

Frequent refresh runs every 20 minutes during typical multi-league slate hours
in America/New_York (08:00–03:59, wrapping midnight). That window covers EPL
morning kickoffs through U.S. West-coast late games so STATUS_FINAL lands the
night of the game. Quiet hours are 04:00–07:59 ET.

A daily full pass remains at 08:00 UTC and also requests yesterday's
scoreboard so games that rolled off ESPN's live board are still upserted.

Job specs are data, not wall-clock: tests inspect CronTrigger.next fire times
with frozen datetimes.
"""

from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")

FREQUENT_REFRESH_JOB_ID = "espn-frequent-refresh"
DAILY_FULL_PASS_JOB_ID = "espn-daily-full-pass"

# 08:00 inclusive through 03:59 ET (hours 8–23 and 0–3).
FREQUENT_MINUTE = "*/20"
FREQUENT_HOUR = "8-23,0-3"
FREQUENT_TIMEZONE = "America/New_York"

DAILY_HOUR_UTC = 8
DAILY_MINUTE = 0

SLATE_START_HOUR_ET = 8  # inclusive
SLATE_END_HOUR_ET = 4  # exclusive; quiet hours start here

LEAGUE_REQUEST_GAP_SECONDS = 0.5
ESPN_MAX_ATTEMPTS = 4  # initial try + 3 retries
ESPN_BACKOFF_BASE_SECONDS = 2.0
ESPN_BACKOFF_CAP_SECONDS = 30.0

SCHEDULER_JOB_DEFAULTS: dict[str, Any] = {
    "max_instances": 1,
    "coalesce": True,
    "misfire_grace_time": 120,
}

JobKind = Literal["frequent", "daily"]


@dataclass(frozen=True)
class CronJobSpec:
    id: str
    kind: JobKind
    minute: str | int
    hour: str | int
    timezone: str


class JobScheduler(Protocol):
    def add_job(self, func: Callable[..., Any], trigger: str, **kwargs: Any) -> Any: ...


def espn_cron_jobs() -> tuple[CronJobSpec, ...]:
    return (
        CronJobSpec(
            id=FREQUENT_REFRESH_JOB_ID,
            kind="frequent",
            minute=FREQUENT_MINUTE,
            hour=FREQUENT_HOUR,
            timezone=FREQUENT_TIMEZONE,
        ),
        CronJobSpec(
            id=DAILY_FULL_PASS_JOB_ID,
            kind="daily",
            minute=DAILY_MINUTE,
            hour=DAILY_HOUR_UTC,
            timezone="UTC",
        ),
    )


def in_slate_window(now: datetime) -> bool:
    """Return True when frequent ESPN refresh should hit the live scoreboard."""
    aware = now if now.tzinfo is not None else now.replace(tzinfo=UTC)
    hour = aware.astimezone(EASTERN).hour
    return hour >= SLATE_START_HOUR_ET or hour < SLATE_END_HOUR_ET


def scoreboard_dates(*, include_previous_day: bool, now: datetime) -> list[str | None]:
    """Dates to pass to sync_games.

    ``None`` means ESPN's current scoreboard (no ``dates=`` query). The daily
    pass also requests yesterday as YYYYMMDD — not a historical backfill.
    """
    dates: list[str | None] = [None]
    if include_previous_day:
        aware = now if now.tzinfo is not None else now.replace(tzinfo=UTC)
        previous = (aware.astimezone(UTC) - timedelta(days=1)).strftime("%Y%m%d")
        dates.append(previous)
    return dates


def parse_retry_after(header: str | None) -> float | None:
    """Parse Retry-After as a delay in seconds. HTTP-dates are ignored."""
    if header is None:
        return None
    try:
        return float(header)
    except ValueError:
        return None


def retry_delay_seconds(attempt: int, retry_after: float | None = None) -> float:
    """Exponential backoff for ESPN 429/5xx. ``attempt`` is 0-indexed."""
    if retry_after is not None and retry_after > 0:
        return min(retry_after, ESPN_BACKOFF_CAP_SECONDS)
    delay = ESPN_BACKOFF_BASE_SECONDS * (2**attempt)
    return min(delay, ESPN_BACKOFF_CAP_SECONDS)


def _callable_for_kind(kind: JobKind, frequent: Callable[..., Any], daily: Callable[..., Any]) -> Callable[..., Any]:
    funcs: dict[JobKind, Callable[..., Any]] = {"frequent": frequent, "daily": daily}
    return funcs[kind]


def register_espn_jobs(
    scheduler: JobScheduler,
    *,
    frequent: Callable[..., Any],
    daily: Callable[..., Any],
) -> None:
    for spec in espn_cron_jobs():
        scheduler.add_job(
            _callable_for_kind(spec.kind, frequent, daily),
            "cron",
            id=spec.id,
            minute=spec.minute,
            hour=spec.hour,
            timezone=spec.timezone,
            replace_existing=True,
            **SCHEDULER_JOB_DEFAULTS,
        )
