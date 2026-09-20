"""Production hardening: admin token, seed drop_all, and related guards."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import func, select

from api import deps
from core.runtime import (
    DEFAULT_DEV_ADMIN_TOKEN,
    ProductionSafetyError,
    UnsafeAdminTokenError,
    assert_not_production,
    is_production_environment,
    resolve_admin_token,
    should_skip_espn_scheduler,
    should_skip_startup_migrations,
)
from db.models import Team
from scripts.reset_synced_data import reset_synced_data
from scripts.seed import seed
from tests.conftest import engine


def test_local_env_is_not_production():
    assert is_production_environment({}) is False
    assert is_production_environment({"ADMIN_TOKEN": "anything"}) is False


def test_railway_environment_is_treated_as_production():
    assert is_production_environment({"RAILWAY_ENVIRONMENT": "production"}) is True
    assert is_production_environment({"RAILWAY_ENVIRONMENT": "staging"}) is True
    assert is_production_environment({"RAILWAY_ENVIRONMENT_ID": "env-123"}) is True
    assert is_production_environment({"RAILWAY_ENVIRONMENT_NAME": "prod"}) is True


def test_explicit_environment_and_app_env_flags_are_production():
    assert is_production_environment({"ENVIRONMENT": "production"}) is True
    assert is_production_environment({"ENVIRONMENT": "prod"}) is True
    assert is_production_environment({"APP_ENV": "production"}) is True
    assert is_production_environment({"ENVIRONMENT": "development"}) is False


def test_local_admin_token_defaults_to_documented_development_token():
    assert resolve_admin_token({}) == DEFAULT_DEV_ADMIN_TOKEN
    assert resolve_admin_token({"ADMIN_TOKEN": "secret_admin_token"}) == "secret_admin_token"


def test_production_requires_non_default_admin_token():
    with pytest.raises(UnsafeAdminTokenError, match="ADMIN_TOKEN"):
        resolve_admin_token({"RAILWAY_ENVIRONMENT": "production"})

    with pytest.raises(UnsafeAdminTokenError, match="default"):
        resolve_admin_token(
            {
                "RAILWAY_ENVIRONMENT": "production",
                "ADMIN_TOKEN": DEFAULT_DEV_ADMIN_TOKEN,
            }
        )

    with pytest.raises(UnsafeAdminTokenError):
        resolve_admin_token({"RAILWAY_ENVIRONMENT": "production", "ADMIN_TOKEN": "   "})


def test_production_accepts_a_real_admin_token():
    token = resolve_admin_token(
        {
            "RAILWAY_ENVIRONMENT": "production",
            "ADMIN_TOKEN": "railway-real-token",
        }
    )
    assert token == "railway-real-token"


def test_assert_not_production_blocks_destructive_ops():
    assert_not_production("drop_all", environ={})
    with pytest.raises(ProductionSafetyError, match="drop_all"):
        assert_not_production("drop_all", environ={"RAILWAY_ENVIRONMENT": "production"})


def test_skip_migrations_only_when_flag_is_exactly_one():
    assert should_skip_startup_migrations({"SKIP_MIGRATIONS": "1"}) is True
    assert should_skip_startup_migrations({}) is False
    assert should_skip_startup_migrations({"SKIP_MIGRATIONS": "0"}) is False


def test_skip_espn_scheduler_only_when_flag_is_exactly_one():
    """E2E/CI must be able to freeze the board on seed data, not the live ESPN slate."""
    assert should_skip_espn_scheduler({"SKIP_ESPN_SCHEDULER": "1"}) is True
    assert should_skip_espn_scheduler({}) is False
    assert should_skip_espn_scheduler({"SKIP_ESPN_SCHEDULER": "0"}) is False
    assert should_skip_espn_scheduler({"SKIP_ESPN_SCHEDULER": "true"}) is False


@pytest.mark.asyncio
async def test_seed_refuses_drop_all_when_production_detected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    with pytest.raises(ProductionSafetyError):
        await seed()


@pytest.mark.asyncio
async def test_reset_synced_data_refuses_when_production_detected(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    with pytest.raises(ProductionSafetyError):
        await reset_synced_data(refresh=False)


@pytest.mark.asyncio
async def test_admin_refresh_rejects_default_token_in_production(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setenv("RAILWAY_ENVIRONMENT", "production")
    monkeypatch.delenv("ADMIN_TOKEN", raising=False)

    response = await async_client.post(
        "/api/v1/admin/refresh",
        headers={"X-Admin-Token": DEFAULT_DEV_ADMIN_TOKEN},
    )
    assert response.status_code == 503
    assert "ADMIN_TOKEN" in response.json()["detail"]


@pytest.mark.asyncio
async def test_admin_refresh_rejects_wrong_x_admin_token_locally(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT_ID", raising=False)
    monkeypatch.delenv("RAILWAY_ENVIRONMENT_NAME", raising=False)
    monkeypatch.setenv("ADMIN_TOKEN", "local-secret")

    response = await async_client.post(
        "/api/v1/admin/refresh",
        headers={"X-Admin-Token": "wrong"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_refresh_does_not_accept_bearer_authorization(
    async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.delenv("RAILWAY_ENVIRONMENT", raising=False)
    monkeypatch.setenv("ADMIN_TOKEN", "local-secret")

    response = await async_client.post(
        "/api/v1/admin/refresh",
        headers={"Authorization": "Bearer local-secret"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_admin_routes_are_rate_limited(async_client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(deps, "ADMIN_RATE_LIMIT", 2)
    deps.reset_admin_rate_limiter()
    headers = {"X-Admin-Token": "wrong"}

    first = await async_client.post("/api/v1/admin/refresh", headers=headers)
    second = await async_client.post("/api/v1/admin/refresh", headers=headers)
    third = await async_client.post("/api/v1/admin/refresh", headers=headers)

    assert first.status_code == 401
    assert second.status_code == 401
    assert third.status_code == 429


def test_rate_limiter_allows_other_clients_independently():
    deps.reset_admin_rate_limiter()
    deps.enforce_admin_rate_limit("10.0.0.1")
    deps.enforce_admin_rate_limit("10.0.0.2")
    # Independent keys must not share a bucket.
    deps.reset_admin_rate_limiter()
    for _ in range(deps.ADMIN_RATE_LIMIT):
        deps.enforce_admin_rate_limit("10.0.0.1")
    with pytest.raises(HTTPException) as exc:
        deps.enforce_admin_rate_limit("10.0.0.1")
    assert exc.value.status_code == 429
    deps.enforce_admin_rate_limit("10.0.0.2")


def test_dockerfile_cmd_uses_dual_stack_start_py():
    dockerfile = Path(__file__).resolve().parents[1] / "Dockerfile"
    contents = dockerfile.read_text(encoding="utf-8")
    assert 'CMD ["python", "start.py"]' in contents


def _dockerfile_text() -> str:
    return (Path(__file__).resolve().parents[1] / "Dockerfile").read_text(encoding="utf-8")


def test_dockerfile_does_not_recursively_copy_the_build_context():
    """docker:S6470 — COPY/ADD of '.' can bake secrets and .git into the image."""
    for raw in _dockerfile_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(("COPY ", "ADD ")):
            args = line.split()[1:]
            while args and args[0].startswith("--"):
                args = args[1:]
            sources = args[:-1]
            assert "." not in sources, f"recursive context copy is not allowed: {line}"
            assert "./" not in sources, f"recursive context copy is not allowed: {line}"


def test_dockerfile_copied_app_files_stay_root_owned():
    """docker:S6504 — the runtime user must not own copied application files."""
    for raw in _dockerfile_text().splitlines():
        line = raw.strip()
        if not line.startswith(("COPY ", "ADD ")):
            continue
        if "--from=" in line:
            continue
        assert "--chown=" not in line, f"copied resources must remain root-owned: {line}"


def test_dockerfile_drops_privileges_to_a_non_root_user():
    """docker:S6471 — python images default to root."""
    users = [
        line.strip().split(maxsplit=1)[1]
        for line in _dockerfile_text().splitlines()
        if line.strip().startswith("USER ")
    ]
    assert users, "Dockerfile must switch to a non-root USER"
    assert users[-1] not in {"root", "0", "0:0"}


def test_dockerfile_installs_python_deps_from_a_locked_binary_set():
    """docker:S8544 + docker:S8541 — lock resolved versions and skip sdist setup scripts."""
    contents = _dockerfile_text()
    uses_uv_lock = "uv.lock" in contents and ("--locked" in contents or "--frozen" in contents)
    uses_pip_hashes = "--require-hashes" in contents
    assert uses_uv_lock or uses_pip_hashes
    assert "--no-build" in contents or "--only-binary" in contents


def _clear_production_signals(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "RAILWAY_ENVIRONMENT",
        "RAILWAY_ENVIRONMENT_ID",
        "RAILWAY_ENVIRONMENT_NAME",
        "ENVIRONMENT",
        "APP_ENV",
        "SPORTSEDGE_ENV",
    ):
        monkeypatch.delenv(key, raising=False)


def _test_database_url() -> str:
    return engine.url.render_as_string(hide_password=False)


def test_verify_admin_accepts_matching_token(monkeypatch: pytest.MonkeyPatch):
    _clear_production_signals(monkeypatch)
    monkeypatch.setenv("ADMIN_TOKEN", "ok-token")
    deps.reset_admin_rate_limiter()
    request = Mock()
    request.client.host = "127.0.0.1"
    assert deps.verify_admin(request, api_key="ok-token") == "ok-token"

    request.client = None
    assert deps.verify_admin(request, api_key="ok-token") == "ok-token"


@pytest.mark.asyncio
async def test_seed_populates_teams_locally(monkeypatch: pytest.MonkeyPatch):
    _clear_production_signals(monkeypatch)
    monkeypatch.setenv("DATABASE_URL", _test_database_url())
    await seed()

    async with engine.connect() as conn:
        result = await conn.execute(select(Team.abbreviation))
        abbreviations = {row[0] for row in result}
    assert {"LAL", "BOS", "GSW", "MIA"} <= abbreviations


@pytest.mark.asyncio
async def test_reset_synced_data_truncates_locally(monkeypatch: pytest.MonkeyPatch):
    _clear_production_signals(monkeypatch)
    # Cover the postgresql:// → asyncpg rewrite used by Railway-style URLs.
    url = _test_database_url().replace("postgresql+asyncpg://", "postgresql://", 1)
    monkeypatch.setenv("DATABASE_URL", url)
    await reset_synced_data(refresh=False)

    async with engine.connect() as conn:
        count = await conn.scalar(select(func.count()).select_from(Team))
    assert count == 0
