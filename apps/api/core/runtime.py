"""Runtime environment helpers for production safety checks."""

from __future__ import annotations

import os
from collections.abc import Mapping

DEFAULT_DEV_ADMIN_TOKEN = "development_token"

_RAILWAY_SIGNALS = (
    "RAILWAY_ENVIRONMENT",
    "RAILWAY_ENVIRONMENT_ID",
    "RAILWAY_ENVIRONMENT_NAME",
)
_EXPLICIT_ENV_KEYS = ("ENVIRONMENT", "APP_ENV", "SPORTSEDGE_ENV")
_PRODUCTION_VALUES = frozenset({"production", "prod"})


class ProductionSafetyError(RuntimeError):
    """Raised when a local-only destructive action is attempted in production."""


class UnsafeAdminTokenError(RuntimeError):
    """Raised when production would use the documented local default ADMIN_TOKEN."""


def _environ(environ: Mapping[str, str] | None) -> Mapping[str, str]:
    return os.environ if environ is None else environ


def is_production_environment(environ: Mapping[str, str] | None = None) -> bool:
    """True when a Railway or explicit production signal is present.

    Local docker-compose / pytest do not set these variables. Any Railway
    environment (including preview/staging) is treated as non-local: the
    documented development admin token and seed drop_all are unsafe there.
    """
    env = _environ(environ)
    if any(env.get(key) for key in _RAILWAY_SIGNALS):
        return True
    for key in _EXPLICIT_ENV_KEYS:
        value = (env.get(key) or "").strip().lower()
        if value in _PRODUCTION_VALUES:
            return True
    return False


def should_skip_startup_migrations(environ: Mapping[str, str] | None = None) -> bool:
    """Return True only when SKIP_MIGRATIONS is the string '1'.

    This is a silent skip: Alembic will not run during API boot. If the
    Railway API service has SKIP_MIGRATIONS=1 and no preDeployCommand runs
    `alembic upgrade head`, schema changes will not apply. See docs/ops.md.
    """
    return _environ(environ).get("SKIP_MIGRATIONS") == "1"


def resolve_admin_token(environ: Mapping[str, str] | None = None) -> str:
    """Return ADMIN_TOKEN, using a documented local default only outside production."""
    env = _environ(environ)
    configured = (env.get("ADMIN_TOKEN") or "").strip()
    if is_production_environment(env):
        if not configured or configured == DEFAULT_DEV_ADMIN_TOKEN:
            raise UnsafeAdminTokenError(
                "ADMIN_TOKEN must be set to a non-default value in production "
                "(RAILWAY_ENVIRONMENT or similar). The local default "
                f"'{DEFAULT_DEV_ADMIN_TOKEN}' is not allowed."
            )
        return configured
    return configured or DEFAULT_DEV_ADMIN_TOKEN


def assert_not_production(action: str, environ: Mapping[str, str] | None = None) -> None:
    """Refuse destructive local-only operations when a production signal is set."""
    if is_production_environment(environ):
        raise ProductionSafetyError(
            f"Refusing to {action}: production environment detected "
            "(RAILWAY_ENVIRONMENT or similar). This operation is local-only."
        )
