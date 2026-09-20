from collections.abc import Sequence

STATUS_SCHEDULED = "STATUS_SCHEDULED"
STATUS_IN_PROGRESS = "STATUS_IN_PROGRESS"
STATUS_FINAL = "STATUS_FINAL"

_CANONICAL = {
    "scheduled": STATUS_SCHEDULED,
    STATUS_SCHEDULED: STATUS_SCHEDULED,
    "in_progress": STATUS_IN_PROGRESS,
    STATUS_IN_PROGRESS: STATUS_IN_PROGRESS,
    "completed": STATUS_FINAL,
    STATUS_FINAL: STATUS_FINAL,
}

_ALIAS_GROUPS: dict[str, tuple[str, ...]] = {
    STATUS_SCHEDULED: (STATUS_SCHEDULED, "scheduled"),
    "scheduled": (STATUS_SCHEDULED, "scheduled"),
    STATUS_IN_PROGRESS: (STATUS_IN_PROGRESS, "in_progress"),
    "in_progress": (STATUS_IN_PROGRESS, "in_progress"),
    STATUS_FINAL: (STATUS_FINAL, "completed"),
    "completed": (STATUS_FINAL, "completed"),
}

COMPLETED_STATUSES = _ALIAS_GROUPS[STATUS_FINAL]
SCHEDULED_STATUSES = _ALIAS_GROUPS[STATUS_SCHEDULED]


def normalize_game_status(status: str) -> str:
    """Map seed labels onto ESPN STATUS_* names; leave unknown values unchanged."""
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
