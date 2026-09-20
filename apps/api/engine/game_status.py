from collections.abc import Sequence

STATUS_SCHEDULED = "STATUS_SCHEDULED"
STATUS_IN_PROGRESS = "STATUS_IN_PROGRESS"
STATUS_FINAL = "STATUS_FINAL"
STATUS_FULL_TIME = "STATUS_FULL_TIME"
STATUS_FT = "STATUS_FT"

_CANONICAL = {
    "scheduled": STATUS_SCHEDULED,
    STATUS_SCHEDULED: STATUS_SCHEDULED,
    "in_progress": STATUS_IN_PROGRESS,
    STATUS_IN_PROGRESS: STATUS_IN_PROGRESS,
    "completed": STATUS_FINAL,
    STATUS_FINAL: STATUS_FINAL,
    STATUS_FULL_TIME: STATUS_FINAL,
    STATUS_FT: STATUS_FINAL,
}

_COMPLETED_ALIASES = (STATUS_FINAL, "completed", STATUS_FULL_TIME, STATUS_FT)

_ALIAS_GROUPS: dict[str, tuple[str, ...]] = {
    STATUS_SCHEDULED: (STATUS_SCHEDULED, "scheduled"),
    "scheduled": (STATUS_SCHEDULED, "scheduled"),
    STATUS_IN_PROGRESS: (STATUS_IN_PROGRESS, "in_progress"),
    "in_progress": (STATUS_IN_PROGRESS, "in_progress"),
    STATUS_FINAL: _COMPLETED_ALIASES,
    "completed": _COMPLETED_ALIASES,
    STATUS_FULL_TIME: _COMPLETED_ALIASES,
    STATUS_FT: _COMPLETED_ALIASES,
}

COMPLETED_STATUSES = _COMPLETED_ALIASES
SCHEDULED_STATUSES = _ALIAS_GROUPS[STATUS_SCHEDULED]


def normalize_game_status(status: str) -> str:
    """Map seed labels and soccer full-time aliases onto ESPN STATUS_* names."""
    return _CANONICAL.get(status, status)


def is_completed_status(status: str) -> bool:
    return normalize_game_status(status) == STATUS_FINAL


def is_scheduled_status(status: str) -> bool:
    return normalize_game_status(status) == STATUS_SCHEDULED


def expand_status_filter(statuses: Sequence[str]) -> list[str]:
    """Expand a query token so seed and ESPN labels match the same games."""
    expanded: list[str] = []
    seen: set[str] = set()
    for status in statuses:
        for alias in _ALIAS_GROUPS.get(status, (status,)):
            if alias in seen:
                continue
            seen.add(alias)
            expanded.append(alias)
    return expanded
