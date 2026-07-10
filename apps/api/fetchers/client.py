from typing import Any

import httpx


def get_client() -> Any:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(10.0),
        limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
    )
