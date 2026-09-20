from collections import defaultdict
from secrets import compare_digest
from time import monotonic

from fastapi import HTTPException, Request, Security, status
from fastapi.security import APIKeyHeader

from core.runtime import UnsafeAdminTokenError, resolve_admin_token

api_key_header = APIKeyHeader(name="X-Admin-Token", auto_error=False)

ADMIN_RATE_LIMIT = 30
ADMIN_RATE_WINDOW_SECONDS = 60.0
_admin_hits: dict[str, list[float]] = defaultdict(list)


def reset_admin_rate_limiter() -> None:
    _admin_hits.clear()


def enforce_admin_rate_limit(client_key: str) -> None:
    now = monotonic()
    window_start = now - ADMIN_RATE_WINDOW_SECONDS
    hits = [stamp for stamp in _admin_hits[client_key] if stamp > window_start]
    if len(hits) >= ADMIN_RATE_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many admin requests",
        )
    hits.append(now)
    _admin_hits[client_key] = hits


def verify_admin(request: Request, api_key: str | None = Security(api_key_header)) -> str:
    try:
        admin_token = resolve_admin_token()
    except UnsafeAdminTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    client_host = request.client.host if request.client else "unknown"
    enforce_admin_rate_limit(client_host)

    if api_key is None or not compare_digest(api_key, admin_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Admin Token",
        )
    return api_key
