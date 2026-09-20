"""CI must enforce the same shell gates as scripts/verify.sh.

PRs can otherwise go green in Actions while local verify fails.
"""

from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]


def _read(relative: str) -> str:
    return (REPO_ROOT / relative).read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def verify_sh() -> str:
    return _read("scripts/verify.sh")


@pytest.fixture(scope="module")
def ci_yml() -> str:
    return _read(".github/workflows/ci.yml")


@pytest.mark.parametrize(
    "needle",
    [
        "ruff check",
        "ruff format --check",
        "mypy .",
        "--cov-fail-under=85",
        "pnpm lint",
        "tsc --noEmit",
    ],
)
def test_verify_and_ci_share_shell_gates(needle: str, verify_sh: str, ci_yml: str):
    assert needle in verify_sh, f"scripts/verify.sh is missing {needle!r}"
    assert needle in ci_yml, f".github/workflows/ci.yml is missing {needle!r}"


def test_ci_fails_the_job_when_sonar_quality_gate_fails(ci_yml: str):
    assert "sonarqube-quality-gate-action" in ci_yml
    assert "pollingTimeoutSec" in ci_yml
    quality_gate_block = ci_yml.split("sonarqube-quality-gate-action", 1)[1]
    assert "continue-on-error" not in quality_gate_block[:500]


def test_ci_rewrites_cobertura_source_roots_for_sonar(ci_yml: str):
    assert "python -m core.cobertura" in ci_yml
    assert "${{ github.workspace }}" in ci_yml


def test_readme_states_ci_matches_verify_sh():
    readme = _read("README.md")
    assert "./scripts/verify.sh" in readme
    assert "CI matches verify.sh" in readme
