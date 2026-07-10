# AGENTS.md — SportsEdge Engineering Rules

These rules are **mandatory and non-negotiable**. They override any conflicting instruction in task prompts, and they apply to every commit, in every session, with no exceptions. If a rule cannot be satisfied, STOP and report the blocker — do not work around it.

---

## 0. Prime Directives

1. **TDD is the only accepted workflow.** No production code is written without a failing test that motivates it. Ever.
2. **Nothing is committed unless the full local verification suite passes.** Green means green — zero failing tests, zero lint errors, zero type errors, quality gate passed.
3. **Never bypass the guardrails.** `git commit --no-verify`, `git push --no-verify`, skipping hooks, commenting out tests, marking tests as `skip`/`xfail`/`.skip`/`.todo` to get to green, deleting tests, or loosening coverage thresholds are all **forbidden**. If a test is genuinely obsolete, its removal must be justified in the commit message body with the reason.
4. **Do not weaken configuration to pass checks.** No editing `ruff.toml`, `mypy.ini`, `eslint` config, coverage thresholds, or Sonar quality gate settings to make failures disappear. Fix the code, not the ruler.

---

## 1. TDD Workflow (Red → Green → Refactor)

For every feature, endpoint, component, or bug fix:

1. **RED** — Write the test(s) first. Run them. **Confirm they fail for the expected reason** (assertion failure, not import error). Show the failing output.
2. **GREEN** — Write the *minimum* production code to make the test pass. Run the specific test file, then the module's full suite.
3. **REFACTOR** — Clean up duplication and naming while keeping everything green. Re-run the suite after refactoring.
4. Only then move to the next behavior.

Rules within the loop:
- One behavior per cycle. Do not write a large batch of code and backfill tests — that is not TDD and violates Directive 1.
- Bug fixes start with a **regression test** that reproduces the bug and fails, then the fix.
- Tests assert behavior, not implementation details (no asserting on private attributes or mock-call choreography unless the interaction *is* the contract, e.g. retry counts).
- Test names describe the behavior: `test_soccer_probabilities_sum_to_one`, not `test_elo_2`.

---

## 2. Definition of Done (per task/milestone)

A task is done only when ALL of the following are true:

- [ ] Tests written first and passing (backend and/or frontend as applicable)
- [ ] Full local verification suite passes (§3) — not just the tests you touched
- [ ] Coverage has not decreased; engine/ and api/ modules remain ≥85%
- [ ] SonarQube analysis run; quality gate **passed**; zero new Critical/Blocker issues; new-code coverage and duplication within gate limits
- [ ] No debug prints, commented-out code, TODOs without linked context, or dead code
- [ ] Docs updated if behavior or setup changed (README, .env.example, OpenAPI descriptions)

---

## 3. Local Verification Suite

Run from the repo root. **All steps must pass before ANY commit.**

### Backend (`apps/api`)
```bash
cd apps/api
uv run ruff check . && uv run ruff format --check .
uv run mypy .
uv run pytest --cov --cov-fail-under=85 -q
```

### Frontend (`apps/web`)
```bash
cd apps/web
pnpm lint
pnpm exec tsc --noEmit
pnpm test run
```

### SonarQube (whole repo) — via MCP, no local scanner
There is **no local sonar-scanner** in this environment. Sonar verification is done through the **`sonarqube` MCP server tools**, and hard enforcement lives in CI (§5b). Before every push, the agent MUST:
1. Use the sonarqube MCP tools to fetch issues scoped to the files touched in this change, plus the project's quality gate status.
2. Fix any new **Critical/Blocker** issues and anything that would fail the quality gate (new-code coverage, duplication, security hotspots).
3. Re-check via MCP and paste the resulting issue/gate summary into the working notes before pushing.
- Do not mark issues "won't fix"/"accepted" and do not change gate conditions to pass.
- Note: MCP tools cannot be invoked from shell hooks, so this step is an **agent obligation** verified by CI — skipping it will surface as a CI quality-gate failure, which is a P0 (§4.6).

### One-command wrapper
Lint, types, and tests are wrapped in `scripts/verify.sh` (see §5). Prefer running:
```bash
./scripts/verify.sh          # lint + types + tests (backend + frontend)
```
`verify.sh` covers everything shell-runnable. The Sonar MCP check (§3 above) is performed by the agent **in addition to** verify.sh before any push.

---

## 4. Commit & Push Protocol

1. Run `./scripts/verify.sh` and confirm exit code 0. Paste the summary output into your working notes for the commit.
2. Stage only files related to one logical change. No drive-by edits mixed into unrelated commits.
3. Conventional commits: `feat:`, `fix:`, `test:`, `refactor:`, `chore:`, `docs:`. Tests and the code they cover ship **in the same commit** (the test-first history lives in your working process, not as broken intermediate commits).
4. Never commit: secrets, `.env` files, `node_modules`, `__pycache__`, coverage artifacts, editor junk. `.gitignore` must cover these from M1.
5. Push only after the pre-push hook passes (§5). If the hook fails, fix and re-verify — **never** `--no-verify`.
6. After every push, follow the CI watch protocol in §5c — a push without a watched-to-green run is an unfinished task.

---

## 5. Enforcement Hooks (install at M1, before any feature work)

Prose rules are advisory; hooks are physics. Install these git hooks as the **first task of the project** and verify they fire by attempting a commit with a deliberately failing test (then fix it).

### `scripts/verify.sh`
```bash
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
  && pnpm test run )

echo "✅ verify.sh: ALL SHELL CHECKS PASSED"
echo "ℹ️  Before push: run the SonarQube MCP check (AGENTS.md §3) — CI will enforce the quality gate."
```

### `.githooks/pre-commit`
```bash
#!/usr/bin/env bash
set -euo pipefail
echo "[pre-commit] running verification (lint + types + tests)…"
./scripts/verify.sh
```

### `.githooks/pre-push`
```bash
#!/usr/bin/env bash
set -euo pipefail
echo "[pre-push] running verification (lint + types + tests)…"
./scripts/verify.sh
echo "[pre-push] REMINDER: SonarQube MCP check (AGENTS.md §3) must be done and green."
echo "[pre-push] CI enforces the Sonar quality gate — a skipped check will fail the build."
```

### Installation (commit this setup in M1)
```bash
chmod +x scripts/verify.sh .githooks/pre-commit .githooks/pre-push
git config core.hooksPath .githooks
```
Add the `git config core.hooksPath .githooks` line to the README setup section and to a `make setup` / `pnpm setup` task so every clone gets the hooks.

**Hook integrity rules:** never edit hooks to weaken them, never unset `core.hooksPath`, never use `--no-verify`. If a hook is blocking you, the code is wrong — fix the code.

## 5b. CI-Side Sonar Enforcement (the hard gate)

Because the local environment has no scanner, the **authoritative** Sonar analysis runs in CI. In `ci.yml`, after the test jobs (so coverage reports exist):

```yaml
  sonar:
    needs: [backend, frontend]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }   # full history for accurate new-code detection
      - uses: actions/download-artifact@v4   # coverage reports from test jobs
      - uses: SonarSource/sonarqube-scan-action@v4
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
          SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}   # omit for SonarCloud
      - uses: SonarSource/sonarqube-quality-gate-action@v1
        with:
          pollingTimeoutSec: 300
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

- Test jobs must upload coverage artifacts (`coverage.xml` from pytest, `lcov.info` from vitest) and `sonar-project.properties` must point at them, so the gate's new-code coverage condition is real.
- The quality-gate step **fails the workflow** if the gate fails. Combined with branch protection on `main` (require CI green before merge), this makes the Sonar gate unbypassable regardless of what happens locally.
- The MCP check in §3 exists so failures are caught and fixed *before* CI, not discovered there.

## 5c. Post-Push CI Watch & Fix (mandatory)

A push is not "done" when it leaves the machine — it is done when CI is green. After **every** push:

1. **Watch the run to completion.** Use the GitHub CLI:
   ```bash
   RUN_ID=$(gh run list --branch "$(git branch --show-current)" --limit 1 --json databaseId -q '.[0].databaseId')
   gh run watch "$RUN_ID" --exit-status
   ```
   `--exit-status` makes the command fail if the run fails, so do not proceed to other work until it exits 0. (If a GitHub MCP server is available, polling the run status via its tools is an acceptable equivalent.)
2. **On failure — fix-forward loop, immediately:**
   a. Pull the failing evidence: `gh run view "$RUN_ID" --log-failed` and read the actual error, not just the job name.
   b. Reproduce locally. If it reproduces, it's a normal bug: **write the regression test first** (RED), fix (GREEN), run `./scripts/verify.sh`, push, and watch again.
   c. If it does **not** reproduce locally, diagnose the environmental difference (Python/Node version, missing service container, env var, coverage artifact path, timezone, ordering) — fix the workflow or the code so local and CI agree. Environment drift is a bug like any other.
   d. Repeat until the run is green. Maximum 3 fix-forward attempts; if still red, **revert the offending commit** (`git revert`, never force-push history away), confirm CI is green on the revert, and report the blocker.
3. **Flaky tests are failures, not noise.** Never re-run a failed job hoping it passes. If a test is intermittent, that intermittency is the bug: eliminate the nondeterminism (§6) with a regression in place.
4. **Forbidden CI "fixes":** disabling or deleting workflows/jobs/steps, adding `continue-on-error`, `if: false`, commenting out the quality-gate step, narrowing triggers to dodge checks, or force-pushing to erase a red run. The workflow may only be edited to genuinely fix it, and any workflow change must itself be watched to green.
5. **Session hygiene:** never end a session with a red run on any branch you pushed to. If time runs out mid-fix, revert to green first, then report.

---

## 6. Test Architecture Standards

- **Backend:** pytest. Unit tests for the Elo engine are pure (no DB, no HTTP). Fetcher tests mock HTTP (respx). API tests use httpx `AsyncClient` against a real test Postgres (testcontainers locally, service container in CI). Factories/fixtures over hand-built dicts. No test order dependence — the suite must pass with `pytest -p no:randomly` removed and with `--randomly-seed` varied.
- **Frontend:** Vitest + React Testing Library. Query by role/label, not test-ids, unless unavoidable. Mock at the fetch boundary, not component internals.
- **E2E:** Playwright smoke runs against seeded deterministic data (`seed.py`), included in full verification before milestone completion and on `main` in CI — not in the pre-commit fast path.
- **Determinism:** no real network, no real clock (`freezegun` / fake timers), no sleeps as synchronization.

---

## 7. Prohibited Behaviors (hard failures)

- Writing production code before its failing test
- Committing or pushing with any red check, or bypassing hooks in any way
- Skipping/deleting/weakening tests or thresholds to reach green
- Suppressing errors instead of handling them (`# type: ignore`, `eslint-disable`, bare `except`, `as any`) without an inline justification comment — and never to silence a legitimate failure
- Hardcoding secrets or committing `.env`
- Fabricating verification results — if you did not run it, do not claim it passed. Paste real command output when reporting status.
- Pushing and walking away — every push must be watched to a green CI run (§5c)
- Neutering CI to get green: `continue-on-error`, disabled jobs, deleted steps, retry-spamming flaky failures, or force-pushing away a red run

---

## 8. Session Start Checklist

At the start of every working session:
1. `git status` — confirm clean tree; if dirty, reconcile before new work.
2. `git config core.hooksPath` — confirm it returns `.githooks`; reinstall if not.
3. `gh run list --limit 3` — confirm the latest runs on your branches are green; a red run from a previous session is the first task (§5c).
4. `./scripts/verify.sh` — confirm the baseline is green before touching anything.
5. If baseline is red, fixing it IS the first task.