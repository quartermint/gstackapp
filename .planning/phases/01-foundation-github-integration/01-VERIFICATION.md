---
phase: 01-foundation-github-integration
verified: 2026-03-30T17:30:00Z
status: gaps_found
score: 4/5 success criteria verified
gaps:
  - truth: "The monorepo builds, tests pass, and the dev server starts with `npm run dev`"
    status: partial
    reason: "`npm run build` fails because the composite TypeScript build includes test files under src/, and those test files have two fixable errors: (1) JSON fixtures imported without `resolveJsonModule` enabled, and (2) BetterSqlite3.Database type in getTestDb() return signature cannot be named across composite project boundaries. Tests pass via Vitest (tsx handles these imports natively). Production source compiles cleanly when tested in isolation. The fix is a tsconfig adjustment — either exclude __tests__ from the composite build or add resolveJsonModule + an explicit type annotation."
    artifacts:
      - path: "packages/api/tsconfig.json"
        issue: "Does not exclude src/__tests__ from composite build, causing test files to be compiled into dist/ and TS6307/TS4058 errors to block `npm run build`"
    missing:
      - "Add `\"exclude\": [\"src/__tests__\"]` to packages/api/tsconfig.json to separate production build from test files"
      - "Alternatively, add `\"resolveJsonModule\": true` to root tsconfig.json and fix the TS4058 type annotation in test-db.ts getTestDb()"
human_verification:
  - test: "Start dev server with a configured .env"
    expected: "Server starts on port 3000, logs 'gstackapp API listening on http://localhost:3000', /health returns 200"
    why_human: "Requires GitHub App credentials (GITHUB_APP_ID, GITHUB_PRIVATE_KEY_PATH, GITHUB_WEBHOOK_SECRET) that are not in the repo"
  - test: "Install GitHub App on a real account and trigger a PR webhook"
    expected: "Installation and repositories persist in database; PR webhook creates pipeline run row with status PENDING and correct deliveryId"
    why_human: "End-to-end GitHub App registration and webhook delivery requires live GitHub interaction"
---

# Phase 1: Foundation & GitHub Integration Verification Report

**Phase Goal:** A working GitHub App that receives PR webhooks, persists installations/repos, and provides authenticated API access -- the bedrock everything else builds on
**Verified:** 2026-03-30T17:30:00Z
**Status:** gaps_found (1 gap)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can install the GitHub App, select repositories, and see them persisted in the database | VERIFIED | `installation.created` handler upserts to `githubInstallations` + `repositories` tables; test confirms persistence |
| 2 | Opening or force-pushing to a PR triggers a webhook that the app receives and ACKs within 10 seconds | VERIFIED | Webhook endpoint reads raw body, verifies HMAC, returns `{ok: true}` immediately; `pull_request.synchronize` creates new pipeline run (test passes) |
| 3 | The app can authenticate as the GitHub App installation and make API calls using auto-refreshed tokens | VERIFIED | `getInstallationOctokit()` creates Octokit with `createAppAuth` strategy; token refresh handled by `@octokit/auth-app` internally; integration tested via mock in handlers.test.ts |
| 4 | Duplicate webhook deliveries (same X-GitHub-Delivery) are silently ignored without errors | VERIFIED | `tryCreatePipelineRun` uses `INSERT ON CONFLICT DO NOTHING` on `delivery_id` unique index; idempotency.test.ts confirms `created=false` on duplicate |
| 5 | The monorepo builds, tests pass, and the dev server starts with `npm run dev` | PARTIAL | 16/16 tests pass; `npm run dev` uses tsx (bypasses tsc); `npm run build` FAILS because composite TS build includes test files with 2 fixable errors |

**Score:** 4/5 success criteria fully verified (1 partial gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | npm workspaces root | VERIFIED | `"workspaces": ["packages/*"]`, all scripts present |
| `packages/shared/src/schemas/verdicts.ts` | Verdict/Stage/PipelineStatus/Severity enums | VERIFIED | Exports all 4 enums + types; `VerdictSchema._def.values = ['PASS','FLAG','BLOCK','SKIP']` confirmed |
| `packages/api/src/db/schema.ts` | 6 Drizzle table definitions | VERIFIED | All 6 tables present with 3 unique indexes (`delivery_id_idx`, `pr_repo_number_idx`, `stage_run_stage_idx`) and 6 regular indexes |
| `packages/api/src/db/client.ts` | DB connection with WAL mode + pragmas | VERIFIED | `pragma('journal_mode = WAL')`, `pragma('busy_timeout = 5000')`, `pragma('foreign_keys = ON')` all present |
| `packages/api/src/lib/config.ts` | Zod-validated environment config | VERIFIED | `configSchema.parse()` with `resolvePrivateKey()` dual-path resolution; fails fast on missing required vars |
| `packages/api/src/github/auth.ts` | GitHub App auth factory | VERIFIED | `getInstallationOctokit()` + `clearInstallationClient()` exported; `createAppAuth` strategy wired |
| `packages/api/src/github/webhook.ts` | POST /api/webhook with signature verification | VERIFIED | Raw body read first; `verifyAndReceive()`; returns 400/401/200 correctly |
| `packages/api/src/github/handlers.ts` | Event handlers for installation + pull_request | VERIFIED | All 7 event types handled; `registerHandlers()` exported |
| `packages/api/src/lib/idempotency.ts` | Atomic idempotent pipeline run creation | VERIFIED | `tryCreatePipelineRun` uses `onConflictDoNothing()`; `ensurePullRequest` uses `onConflictDoUpdate` |
| `packages/api/src/db/reconcile.ts` | Startup reconciliation for stale runs | VERIFIED | `reconcileStaleRuns()` marks RUNNING/PENDING as STALE via `inArray` |
| `packages/api/src/index.ts` | Hono app entry with Node server | VERIFIED | `serve()` called; `reconcileStaleRuns()` on startup; webhook + health routes mounted; `export default app` |
| `packages/api/src/routes/health.ts` | Health endpoint | VERIFIED | GET /health returns `{status:'ok', uptime, timestamp}` |
| `packages/api/tsconfig.json` | TypeScript project references to shared | PARTIAL | References `../shared`; BUT does not exclude `__tests__/` causing `npm run build` to fail |
| `packages/api/vitest.config.ts` | Vitest configuration | VERIFIED | `defineConfig` with `include: ['src/__tests__/**/*.test.ts']` and setupFiles |
| `packages/api/src/__tests__/webhook.test.ts` | Webhook integration tests | VERIFIED | 5 tests: 400 (missing headers), 400 (missing signature), 401 (invalid sig), 200 (valid sig), 200 (health) |
| `packages/api/src/__tests__/handlers.test.ts` | Event handler integration tests | VERIFIED | 6 tests covering installation lifecycle + PR events including force-push |
| `packages/api/src/__tests__/idempotency.test.ts` | Idempotency unit tests | VERIFIED | 5 tests: new delivery, duplicate delivery, force-push, ensurePullRequest insert + update |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `webhook.ts` | `handlers.ts` | `registerHandlers(webhooks)` | WIRED | Called at module load; pattern present |
| `handlers.ts` | `db/schema.ts` | `db.insert(githubInstallations)` | WIRED | Direct import + usage in `installation.created` handler |
| `handlers.ts` | `idempotency.ts` | `tryCreatePipelineRun` | WIRED | Imported and called in `pull_request.*` handler |
| `index.ts` | `db/reconcile.ts` | `reconcileStaleRuns()` called at startup | WIRED | Present on line 23 of index.ts |
| `handlers.ts` | `github/auth.ts` | `getInstallationOctokit` for repo listing | WIRED | Called when `repository_selection === 'all'` |
| `api/tsconfig.json` | `shared/tsconfig.json` | TypeScript project references | WIRED | `"references": [{ "path": "../shared" }]` present |
| `webhook.test.ts` | `index.ts` | `app.request()` integration testing | WIRED | Imports `app` from `../index`; `app.request()` used throughout |
| `test-db.ts` | `db/schema.ts` | schema import for in-memory DB | WIRED | `import * as schema from '../../db/schema'` present |

### Data-Flow Trace (Level 4)

This phase builds infrastructure (DB schema, auth, event handlers) — not components rendering dynamic data. No Level 4 data-flow trace required.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 16 tests pass | `npm run test -w packages/api -- --reporter=verbose` | `16 passed (16)` in 2.10s | PASS |
| Shared schemas export valid Zod enums | `import('.../dist/schemas/verdicts.js')` | `VerdictSchema._def.values = ['PASS','FLAG','BLOCK','SKIP']` | PASS |
| `npm run build` succeeds | `npm run build` | FAIL — 5 TS errors in test files (TS6307 x4, TS4058 x1) | FAIL |
| Package workspaces resolved | `ls node_modules/.bin/hono` / workspace links | `@gstackapp` packages present in node_modules | PASS |
| All 7 files from Plan 02 committed | `git cat-file -t e0b9d64 70e8c35` | both return `commit` | PASS |

### Requirements Coverage

All 5 GHUB requirements are claimed by all 3 plans and traced in REQUIREMENTS.md traceability table.

| Requirement | Plans Claiming | Description | Status | Evidence |
|-------------|---------------|-------------|--------|---------|
| GHUB-01 | 01-01, 01-02, 01-03 | User can install GitHub App and see repos persisted | SATISFIED | `installation.created` handler upserts to githubInstallations + repositories; handlers.test.ts confirms persistence |
| GHUB-02 | 01-01, 01-02, 01-03 | App receives PR webhooks on open, synchronize, reopened | SATISFIED | `webhooks.on(['pull_request.opened','pull_request.synchronize','pull_request.reopened'])` wired; test confirms 200 response |
| GHUB-03 | 01-01, 01-02, 01-03 | App creates and refreshes installation access tokens | SATISFIED | `getInstallationOctokit()` with `createAppAuth` + token cache; auto-refresh handled by @octokit/auth-app at 59 min |
| GHUB-04 | 01-01, 01-02, 01-03 | Force-push triggers new pipeline run | SATISFIED | `tryCreatePipelineRun` with different deliveryId returns `created=true`; idempotency test "force-push" case passes |
| GHUB-05 | 01-01, 01-02, 01-03 | Webhook ACKs within 10 seconds, processes pipeline async | SATISFIED | Webhook returns `{ok: true}` immediately after `verifyAndReceive`; handlers run async inside Webhooks instance |

No orphaned requirements found. REQUIREMENTS.md maps exactly GHUB-01 through GHUB-05 to Phase 1 — all 5 accounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api/src/github/handlers.ts` | 171 | `// TODO: Phase 2 will dispatch pipeline execution here` | Info | Intentional placeholder — pipeline dispatch is Phase 2 scope. Not a blocker. |
| `packages/api/tsconfig.json` | (all) | Test files included in composite build, JSON fixtures lack `resolveJsonModule`, test-db.ts has unnamed type | Warning | `npm run build` fails. Dev workflow (tsx) and tests (Vitest) are unaffected. Fix requires 1 line change. |

### Human Verification Required

#### 1. Dev Server Startup

**Test:** Configure `.env` from `.env.example` with real GitHub App credentials, then run `npm run dev`
**Expected:** Server starts, logs `gstackapp API listening on http://localhost:3000`, GET /health returns `{"status":"ok","uptime":...,"timestamp":"..."}`
**Why human:** Requires registered GitHub App with real GITHUB_APP_ID + GITHUB_PRIVATE_KEY_PATH + GITHUB_WEBHOOK_SECRET

#### 2. End-to-End Webhook Receipt

**Test:** Install GitHub App on a test repo, open a PR, check database
**Expected:** Row in `github_installations`, row in `repositories`, row in `pull_requests`, row in `pipeline_runs` with status=PENDING
**Why human:** Requires live GitHub App installation and real webhook delivery

### Gaps Summary

One gap found: **`npm run build` fails** (Success Criterion 5 is partial).

The root cause is that `packages/api/tsconfig.json` includes `src` in its composite build, and `src/__tests__/` contains test files that import JSON fixtures using module syntax. The composite TypeScript build requires `resolveJsonModule: true` to handle these imports, and the `getTestDb()` function in test-db.ts returns a type from an external module that can't be named across composite project boundaries (TS4058).

**This is a test infrastructure configuration gap, not a production code defect.** The production source (`db/`, `github/`, `lib/`, `routes/`) compiles correctly — a prior `tsc --build packages/api` run produced clean dist/ output for all production files. The `npm run dev` command uses `tsx watch` (not tsc) and is unaffected. All 16 tests pass via Vitest, which uses tsx internally.

**Fix options (either resolves the gap):**
1. Add `"exclude": ["src/__tests__"]` to `packages/api/tsconfig.json` — cleanest, separates production from test compilation
2. Add `"resolveJsonModule": true` to root `tsconfig.json` + add explicit `Database` type import in `test-db.ts` getTestDb return signature

---

_Verified: 2026-03-30T17:30:00Z_
_Verifier: Claude (gsd-verifier)_
