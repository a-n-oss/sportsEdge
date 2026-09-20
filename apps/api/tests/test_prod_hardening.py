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
