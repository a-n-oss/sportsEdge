#!/usr/bin/env bash
set -euo pipefail

echo "── Backend: lint + types + tests ──"
( cd apps/api \
  && uv run ruff check . \
  && uv run ruff format --check . \
  && uv run mypy . \
  && uv run pytest --cov --cov-fail-under=85 -q )

echo "── Frontend: lint + types + tests ──"
( cd apps/web \
  && pnpm lint \
  && pnpm exec tsc --noEmit \
  && pnpm run test )

echo "✅ verify.sh: ALL SHELL CHECKS PASSED"
echo "ℹ️  Before push: run the SonarQube MCP check (AGENTS.md §3) — CI will enforce the quality gate."
