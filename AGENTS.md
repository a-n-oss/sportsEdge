## Learned User Preferences

- Prefer visual mockups or a canvas before locking a UI direction; do not jump straight to an implementation plan from prose options alone.
- For the SportsEdge overhaul, prefer design + product UX scope (league hubs, matchup pages, rankings, prediction feedback), not a visual-only reskin of existing routes.
- Commit to the Broadcast Night visual direction: dense game-day board, high information density, amber-on-black energy — not a table-only layout.
- Team identity in product UI should use abbreviations and custom monograms only; do not ship official team logos or photos.
- Prefer production topology where only the frontend is public; keep the API and Postgres on private/internal networking.
- When asked to verify locally, run the compose stack rather than only describing how to run it.

## Learned Workspace Facts

- SportsEdge is an Elo-based predictive sports analytics monorepo: FastAPI + PostgreSQL in `apps/api`, Next.js in `apps/web`, covering NFL, NBA, MLB, NHL, and major soccer leagues.
- Mandatory engineering guardrails (TDD, `./scripts/verify.sh`, Sonar via MCP/CI, no hook bypass) live in `.agents/AGENTS.md`.
- Production runs on Railway with a public web service and private API/Postgres; the Next.js server uses server-only `API_URL` (not `NEXT_PUBLIC_`) so the browser never calls the API directly.
- ESPN reuses numeric team IDs across sports; team primary keys must be league-namespaced or cross-league sync overwrites names while leaving the wrong `league`.
- After deploying the namespaced-ID fix, corrupted prod rows need `POST /api/v1/admin/reset-and-refresh` (or `scripts/reset_synced_data.py --refresh`); do not reset before that deploy.
- Railway API service in this monorepo should build from the repo root (not a nested `/apps/api` root directory) so the Dockerfile context resolves correctly.
