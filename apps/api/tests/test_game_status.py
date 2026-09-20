from engine.game_status import (
    STATUS_FINAL,
    STATUS_IN_PROGRESS,
    STATUS_SCHEDULED,
    expand_status_filter,
    is_completed_status,
    is_scheduled_status,
    normalize_game_status,
)

COMPLETED_ALIASES = {STATUS_FINAL, "completed", "STATUS_FULL_TIME", "STATUS_FT"}


def test_normalize_maps_seed_labels_to_espn_status():
    assert normalize_game_status("scheduled") == STATUS_SCHEDULED
    assert normalize_game_status("completed") == STATUS_FINAL
    assert normalize_game_status("in_progress") == STATUS_IN_PROGRESS


def test_normalize_keeps_espn_status_names():
    assert normalize_game_status("STATUS_SCHEDULED") == STATUS_SCHEDULED
    assert normalize_game_status("STATUS_FINAL") == STATUS_FINAL
    assert normalize_game_status("STATUS_IN_PROGRESS") == STATUS_IN_PROGRESS


def test_normalize_maps_soccer_full_time_to_final():
    assert normalize_game_status("STATUS_FULL_TIME") == STATUS_FINAL
    assert normalize_game_status("STATUS_FT") == STATUS_FINAL


def test_normalize_leaves_unknown_espn_status_unchanged():
    assert normalize_game_status("STATUS_POSTPONED") == "STATUS_POSTPONED"


def test_completed_and_scheduled_predicates_accept_aliases():
    assert is_completed_status("completed")
    assert is_completed_status("STATUS_FINAL")
    assert is_completed_status("STATUS_FULL_TIME")
    assert is_completed_status("STATUS_FT")
    assert not is_completed_status("STATUS_SCHEDULED")
    assert is_scheduled_status("scheduled")
    assert is_scheduled_status("STATUS_SCHEDULED")
    assert not is_scheduled_status("STATUS_FINAL")


def test_status_filter_expands_seed_and_espn_aliases():
    assert set(expand_status_filter(["completed"])) == COMPLETED_ALIASES
    assert set(expand_status_filter(["STATUS_FINAL"])) == COMPLETED_ALIASES
    assert set(expand_status_filter(["STATUS_FULL_TIME"])) == COMPLETED_ALIASES
    assert set(expand_status_filter(["scheduled"])) == {"scheduled", STATUS_SCHEDULED}
