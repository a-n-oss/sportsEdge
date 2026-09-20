FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --user-group appuser

COPY --from=ghcr.io/astral-sh/uv:0.12.17 /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project --no-build \
    && chown -R appuser:appuser /opt/venv

COPY --chown=appuser:appuser alembic.ini start.py main.py ./
COPY --chown=appuser:appuser api ./api
COPY --chown=appuser:appuser core ./core
COPY --chown=appuser:appuser db ./db
COPY --chown=appuser:appuser engine ./engine
COPY --chown=appuser:appuser fetchers ./fetchers
COPY --chown=appuser:appuser migrations ./migrations
COPY --chown=appuser:appuser scripts ./scripts

USER appuser

EXPOSE 8000

# Dual-stack bind (IPv4+IPv6) for Railway private DNS + healthchecks.
# Matches railway.json startCommand: python start.py
CMD ["python", "start.py"]
