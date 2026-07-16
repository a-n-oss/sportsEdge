import os

from fastapi import HTTPException, Security, status
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-Admin-Token", auto_error=False)


def verify_admin(api_key: str = Security(api_key_header)) -> str:
    admin_token = os.getenv("ADMIN_TOKEN", "development_token")
    if api_key != admin_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Admin Token",
        )
    return api_key
