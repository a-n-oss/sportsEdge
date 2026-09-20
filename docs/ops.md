# SportsEdge operations notes

Production topology: only the Next.js web service is public. The FastAPI API and Postgres stay on Railway private/internal networking. The web server talks to the API with the server-only `API_URL` env var (not `NEXT_PUBLIC_API_URL`), so browsers never call the API directly.

## Admin authentication

Admin routes (`POST /api/v1/admin/refresh`, `POST /api/v1/admin/reset-and-refresh`) require the **`X-Admin-Token`** header. They do **not** accept `Authorization: Bearer`.

```bash
curl -X POST "$API_URL/admin/refresh" \
  -H "X-Admin-Token: $ADMIN_TOKEN"
```

- **Local / docker-compose:** if `ADMIN_TOKEN` is unset, the API uses the documented default `development_token`. Compose sets `ADMIN_TOKEN=secret_admin_token`.
- **Production (Railway):** `ADMIN_TOKEN` is required and must not be `development_token`. The API refuses to treat the local default as valid when `RAILWAY_ENVIRONMENT` (or `RAILWAY_ENVIRONMENT_ID` / `RAILWAY_ENVIRONMENT_NAME`, or `ENVIRONMENT=production`) is set. Set a real token in the Railway dashboard; do not rely on agents to flip env vars.

Admin routes are also lightly rate-limited in-process (per client IP) to slow brute-force attempts.

## Database seed / wipe scripts are local-only

`apps/api/scripts/seed.py` runs `drop_all` and will **refuse to run** when a production environment signal is present. Do not run it against Railway Postgres.

`apps/api/scripts/reset_synced_data.py` is the same class of destructive operation and is also blocked in production. After the namespaced team-id fix, prefer `POST /api/v1/admin/reset-and-refresh` with `X-Admin-Token` (once `ADMIN_TOKEN` is set in Railway).

## `SKIP_MIGRATIONS` can silently skip schema updates

On API boot, `main.py` runs `alembic upgrade head` unless `SKIP_MIGRATIONS=1`.

**Risk:** `SKIP_MIGRATIONS=1` is a silent skip. If the Railway API service has that flag set and there is no `preDeployCommand` (or other job) running `alembic upgrade head`, new migrations in a deploy will **not** apply and the app can boot against a stale schema.

- Prefer leaving `SKIP_MIGRATIONS` unset (or `0`) so boot applies migrations, **or**
- Keep `SKIP_MIGRATIONS=1` only if a Railway pre-deploy command is known to run Alembic.

Do not change Railway variables from automation unless an operator explicitly asks.

## How the API process starts

Railway (this repo's `railway.json`) starts the API with:

```text
python start.py
```

`start.py` binds dual-stack IPv6 (`IPV6_V6ONLY=0`) so private DNS (IPv6) and platform healthchecks (often IPv4) both work. The `apps/api/Dockerfile` `CMD` matches that entrypoint if a Docker build is used. Local compose still overrides to `uvicorn ... --reload` for development.

## Frontend

The web app deploys on Railway (`apps/web/railway.toml`), not Vercel. A leftover root `vercel.json` from earlier scaffolding has been removed.
