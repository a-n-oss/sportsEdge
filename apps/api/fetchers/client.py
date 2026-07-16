import hishel.httpx
import httpx


def get_client() -> httpx.AsyncClient:
    return hishel.httpx.AsyncCacheClient(
        timeout=httpx.Timeout(10.0),
        limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
    )
