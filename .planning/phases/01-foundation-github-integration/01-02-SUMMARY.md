---
phase: 01-foundation-github-integration
plan: 02
subsystem: api
tags: [github-app, octokit, webhooks, hono, hmac-sha256, idempotency]

# Dependency graph
requires:
  - phase: 01-foundation-github-integration (plan 01)
    provides: Drizzle schema (6 tables), DB client with WAL mode, env config with Zod validation
provides:
  - GitHub App auth factory with per-installation Octokit client caching
  - Webhook endpoint with HMAC-SHA256 signature verification
  - Event handlers for installation and pull_request lifecycle events
  - Idempotent pipeline run creation via INSERT ON CONFLICT DO NOTHING
  - Startup reconciliation for stale RUNNING/PENDING pipeline runs
  - Hono app entry point with Node.js HTTP server
  - Health check endpoint at GET /health
affects: [01-03, 02-pipeline-execution, 03-review-output]

# Tech tracking
tech-stack:
  added: ["@octokit/webhooks", "@octokit/rest", "@octokit/auth-app", "nanoid", "hono/logger", "@hono/node-server"]
  patterns: [webhook-fast-ack, atomic-idempotency, installation-client-cache, startup-reconciliation]

key-files:
  created:
    - packages/api/src/github/auth.ts
    - packages/api/src/github/webhook.ts
    - packages/api/src/github/handlers.ts
    - packages/api/src/lib/idempotency.ts
    - packages/api/src/db/reconcile.ts
    - packages/api/src/routes/health.ts
    - packages/api/src/index.ts

key-decisions:
  - "Non-null assertion on installation.account for type safety -- GitHub always sends account on installation.created"
  - "Used Hono sub-app routing (app.route) to isolate webhook from global middleware"
  - "console.log for event logging instead of pino -- lightweight for Phase 1, pino integration deferred"

patterns-established:
  - "Webhook fast-ACK: read raw body first, verify HMAC, ACK immediately, handlers run async"
  - "Atomic idempotency: INSERT ON CONFLICT DO NOTHING on delivery_id unique constraint"
  - "Installation client cache: Map<number, Octokit> with clearInstallationClient on deletion"
  - "Startup reconciliation: mark orphaned RUNNING/PENDING runs as STALE on boot"

requirements-completed: [GHUB-01, GHUB-02, GHUB-03, GHUB-04, GHUB-05]

# Metrics
duration: 4min
completed: 2026-03-30
---

# Phase 01 Plan 02: GitHub App Integration Summary

**GitHub App webhook handler with HMAC-SHA256 verification, installation lifecycle management, atomic idempotent pipeline run creation, and Hono server entry point**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T20:33:13Z
- **Completed:** 2026-03-30T20:37:54Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Webhook endpoint reads raw body before signature verification, verifies HMAC-SHA256 via @octokit/webhooks, and ACKs immediately
- Event handlers persist GitHub installations, repositories (handling "All repositories" selection via API), and pull requests with full lifecycle coverage
- Pipeline runs created with atomic idempotency using INSERT ON CONFLICT DO NOTHING on the delivery_id unique constraint
- Startup reconciliation marks orphaned RUNNING/PENDING runs as STALE for crash recovery
- Per-installation Octokit client cache with auto-refreshing tokens via @octokit/auth-app

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GitHub auth factory, idempotency module, and startup reconciliation** - `e0b9d64` (feat)
2. **Task 2: Create webhook route, event handlers, health endpoint, and Hono app entry** - `70e8c35` (feat)

## Files Created/Modified

- `packages/api/src/github/auth.ts` - GitHub App auth factory with per-installation Octokit client caching and auto-refresh
- `packages/api/src/github/webhook.ts` - POST /api/webhook route with raw body read, HMAC-SHA256 signature verification, fast ACK
- `packages/api/src/github/handlers.ts` - Event handlers for installation.created/deleted, installation_repositories.added/removed, pull_request.opened/synchronize/reopened
- `packages/api/src/lib/idempotency.ts` - ensurePullRequest upsert and tryCreatePipelineRun with atomic INSERT ON CONFLICT DO NOTHING
- `packages/api/src/db/reconcile.ts` - Startup reconciliation marking stale RUNNING/PENDING pipeline runs as STALE
- `packages/api/src/routes/health.ts` - GET /health endpoint returning status, uptime, and timestamp
- `packages/api/src/index.ts` - Hono app entry with webhook/health route mounting, reconciliation on startup, Node.js HTTP server

## Decisions Made

- **Non-null assertion on installation.account:** GitHub's webhook types mark account as nullable for edge cases, but installation.created always includes account data. Used `!` assertion with safe property access pattern.
- **Hono sub-app routing:** Used `app.route('/', webhookApp)` to mount the webhook as a sub-app, isolating it from any global middleware that might consume the body.
- **console.log over pino for Phase 1:** Lightweight logging with structured prefixes like `[handlers]` and `[webhook]`. Pino integration can be added later without changing the logging patterns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed nullable TypeScript types from @octokit/webhooks**
- **Found during:** Task 2 (webhook handlers)
- **Issue:** TypeScript strict mode flagged `installation.account` as possibly null and `account` as a union type (User | Enterprise) where Enterprise lacks `login` property. Also `pull_request.user` is nullable.
- **Fix:** Added non-null assertion on account (always present on installation events), property-based type narrowing for login/type, and optional chaining with fallback for PR user.
- **Files modified:** packages/api/src/github/handlers.ts
- **Verification:** `npx tsc --project packages/api --noEmit` passes cleanly
- **Committed in:** 70e8c35 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug -- nullable type handling)
**Impact on plan:** Type safety fix required for TypeScript strict mode. No scope creep.

## Known Stubs

- `packages/api/src/github/handlers.ts:171` - `// TODO: Phase 2 will dispatch pipeline execution here` -- intentional, pipeline AI execution is Phase 2 scope

## Issues Encountered

None -- plan executed cleanly after type fixes.

## User Setup Required

**External services require manual configuration.** The GitHub App must be registered before the server can receive webhooks. See the plan's `user_setup` section for:
- `GITHUB_APP_ID` - from GitHub Settings > Developer settings > GitHub Apps
- `GITHUB_PRIVATE_KEY_PATH` - PEM file generated from the GitHub App settings
- `GITHUB_WEBHOOK_SECRET` - random string set as the webhook secret in the GitHub App settings

## Next Phase Readiness

- All GitHub integration infrastructure is ready for Plan 03 (Tailscale Funnel, testing, Drizzle migrations)
- Phase 2 pipeline execution can wire into the `pull_request` event handler's TODO placeholder
- Health endpoint is live for monitoring

## Self-Check: PASSED

- All 7 created files verified to exist on disk
- Commit e0b9d64 (Task 1) verified in git log
- Commit 70e8c35 (Task 2) verified in git log
- SUMMARY.md verified at expected path
- `npx tsc --project packages/api --noEmit` passes cleanly

---
*Phase: 01-foundation-github-integration*
*Completed: 2026-03-30*
