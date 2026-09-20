# SportsEdge 🏀⚽️⚾️

SportsEdge is an open-source, full-stack predictive sports analytics engine. It leverages statistical Elo modeling, margin-of-victory (MOV) multipliers, and home-field advantage (HFA) adjustments to predict outcomes for the NFL, NBA, MLB, NHL, and major soccer leagues.

Built entirely with modern, agentic workflows, SportsEdge consists of a rigorous TDD-driven FastAPI backend and a beautiful, high-performance Next.js 14 App Router frontend.

## 🌟 Key Features

- **Algorithmic Elo Engine**: A custom Python engine that processes zero-sum rating exchanges with sport-specific dynamic K-factors, MOV multipliers, and season regressions.
- **Automated Data Fetching**: Robust backend fetchers that hit ESPN APIs to synchronize live scores and upcoming matchups.
- **Predictive Odds Generation**: Converts raw Elo differentials into accurate Win/Loss/Draw probabilities (including specialized 3-way Poisson-adjacent logic for soccer).
- **Stunning Frontend UI**: A dark-themed, glassmorphic Next.js dashboard featuring win-probability bars and historical Elo graphs using `recharts`.
- **Bulletproof Reliability**: Enforced by a 90%+ local coverage gate, SonarQube static analysis, comprehensive Playwright end-to-end smoke testing, and strict Zod API boundary validation.

## 🏗 Architecture & Tech Stack

### Backend (`apps/api/`)
- **FastAPI**: High-performance async Python web framework.
- **SQLAlchemy + asyncpg**: Asynchronous ORM connected to PostgreSQL.
- **Alembic**: Database schema migrations.
- **uv**: Ultra-fast Python package and environment manager.

### Frontend (`apps/web/`)
- **Next.js 14**: React framework utilizing the App Router and Server Components.
- **Tailwind CSS + shadcn/ui**: Modern utility-first styling with a bespoke dark UI component system.
- **Playwright**: Comprehensive E2E testing framework.
- **Zod**: Runtime type validation ensuring frontend safety against backend schema drift.

---

## 🚀 Getting Started Locally

### 1. Prerequisites
- Docker & docker-compose (for PostgreSQL)
- Python 3.12+ (managed by `uv`)
- Node.js 24+ & `pnpm`

### 2. Database Setup
Spin up the local PostgreSQL database using docker-compose:
```bash
docker-compose up -d
```

### 3. Backend Setup
Navigate to the `apps/api` directory and install the Python environment using `uv`:
```bash
cd apps/api
uv venv
uv pip install -r requirements.lock
```

Run the database migrations to set up your tables:
```bash
uv run alembic upgrade head
```

Optionally, seed the database with deterministic test data (this is useful if you don't want to wait for live ESPN fetchers to populate the database). `seed.py` runs `drop_all` and **refuses to run when a production signal such as `RAILWAY_ENVIRONMENT` is set** — it is local-only:
```bash
uv run python scripts/seed.py
```

Start the FastAPI server:
```bash
uv run uvicorn main:app --reload
```
The backend API is now running at `http://localhost:8000`.

### 4. Frontend Setup
Open a new terminal session, navigate to `apps/web`, and install dependencies:
```bash
cd apps/web
pnpm install
```

Start the Next.js development server:
```bash
pnpm dev
```
The frontend application is now running at `http://localhost:3000`.

## 🤖 Administrative Tasks

Admin routes authenticate with the **`X-Admin-Token`** header (not `Authorization: Bearer`). Locally, docker-compose sets `ADMIN_TOKEN=secret_admin_token`. If `ADMIN_TOKEN` is unset in a non-production environment, the API uses the documented default `development_token`. In production (`RAILWAY_ENVIRONMENT` or similar), a real non-default `ADMIN_TOKEN` is required.

See [docs/ops.md](docs/ops.md) for production token requirements, seed/wipe guards, and `SKIP_MIGRATIONS` risk.

**Daily refresh** (full roster + today's scoreboard + Elo, all leagues):
```bash
curl -X POST http://localhost:8000/api/v1/admin/refresh \
  -H "X-Admin-Token: secret_admin_token"
```

**Historical backfill** (full roster, then each day's ESPN scoreboard in chronological order, then Elo). Omit `from`/`to` to use the current season for that league (clipped to today). Prefer one league at a time — a season is hundreds of ESPN calls.

```bash
curl -X POST "http://localhost:8000/api/v1/admin/backfill?league=nba&from=2025-10-01&to=2026-04-15" \
  -H "X-Admin-Token: secret_admin_token"
```

Failed league syncs write `FetchRun.status="error"` (they no longer record a false success). After merging this, validate backfill on staging, then give CoS/Louis a heads-up before production `POST /api/v1/admin/reset-and-refresh`.

## 🧪 Testing and Verification

The repository enforces extremely strict CI quality gates.

**Local Shell Verification (Lint + Types + Tests):**
```bash
./scripts/verify.sh
```

**End-to-End Playwright Smoke Tests:**
*(Ensure the backend is running before executing)*
```bash
cd apps/web
pnpm exec playwright test
```

## ☁️ Deployment

Both the API and the Next.js frontend deploy on **Railway**. Only the frontend is public; the API and Postgres stay on private/internal networking.

- **API**: `railway.json` — Nixpacks start command is `python start.py` (dual-stack bind). The `apps/api/Dockerfile` `CMD` matches that entrypoint if a Docker build is used.
- **Web**: `apps/web/railway.toml`.
- Root `vercel.json` was leftover Create-Next-App / Vercel scaffolding and has been removed; do not treat Vercel as the production deploy path.

Ops details (admin token, seed safety, `SKIP_MIGRATIONS`): [docs/ops.md](docs/ops.md).