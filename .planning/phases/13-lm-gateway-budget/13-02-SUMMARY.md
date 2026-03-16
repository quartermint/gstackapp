---
phase: 13-lm-gateway-budget
plan: 02
subsystem: api
tags: [hono, routes, lm-studio, budget, health-panel, hook-enrichment, react-hook]

# Dependency graph
requires:
  - phase: 13-lm-gateway-budget
    plan: 01
    provides: LM Studio probe service, budget service, config schema, shared Zod schemas
  - phase: 12-session-ingestion
    provides: Session hook routes, session service, session reaper
affects: [dashboard-budget-widget, session-routing, phase-14-intelligence]

provides:
  - GET /api/models endpoint returning cached LM Studio three-state health
  - GET /api/budget endpoint returning weekly session counts with burn rate and tier suggestion
  - Session start hook enriched with budget context when burn rate exceeds low
  - LM Studio probe timer starting on server boot with shutdown cleanup
  - useLmStudio React hook polling /api/models on 30s interval
  - Health panel LM Studio status section with three-state colored indicator
  - Route integration tests for models and budget endpoints

# Tech tracking
tech-stack:
  added: []
  patterns: [budget-enrichment-in-hook-response, health-panel-independent-hook]

key-files:
  created:
    - packages/api/src/routes/models.ts
    - packages/api/src/routes/budget.ts
    - packages/api/src/__tests__/routes/models.test.ts
    - packages/api/src/__tests__/routes/budget.test.ts
    - packages/web/src/hooks/use-lm-studio.ts
  modified:
    - packages/api/src/app.ts
    - packages/api/src/index.ts
    - packages/api/src/routes/sessions.ts
    - packages/web/src/components/health/health-panel.tsx

key-decisions:
  - "Budget enrichment extracted into buildBudgetContext helper for reuse across resume and new session paths"
  - "useLmStudio hook called inside HealthPanel directly (not threaded through props) to minimize change surface"
  - "LM Studio probe timer cleanup runs before session reaper cleanup in shutdown sequence"

patterns-established:
  - "Budget context enrichment: conditional inclusion in hook response based on burn rate threshold"
  - "Independent polling hooks: health panel uses its own useLmStudio hook alongside parent useHealth"
  - "Three-state health indicator: green/amber/red dot with label and optional model ID tooltip"

requirements-completed: [GATE-03, API-05, API-06, GATE-01, GATE-02, BUDG-02, BUDG-03, BUDG-04]

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 13 Plan 02: LM Gateway + Budget API Routes, Hook Enrichment, and Health Panel Summary

**GET /api/models and GET /api/budget endpoints wired into Hono app, session start hook enriched with budget context when burn rate exceeds low, LM Studio three-state health rendered in dashboard health panel**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T15:37:14Z
- **Completed:** 2026-03-16T15:42:32Z
- **Tasks:** 3
- **Files modified:** 9 (5 created, 4 modified)

## Accomplishments
- Two new API endpoints: GET /api/models returns cached LM Studio status, GET /api/budget returns weekly session counts with burn rate classification and tier routing suggestion
- Session start hook (both new and resume paths) enriched with budgetContext when burn rate is moderate or hot, silent when low
- LM Studio probe timer starts on server boot and is cleaned up in shutdown sequence
- Health panel displays LM Studio three-state status (ready/loading/unavailable) with colored dot, label, and model ID
- 9 new route integration tests (3 models + 6 budget) covering API-05, API-06, GATE-03
- Full suite: 361 API tests + 68 web tests + 20 MCP tests passing, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Routes, app wiring, timer startup, and hook enrichment** - `fd692f4` (feat)
2. **Task 2: Route integration tests for models and budget** - `fa8b3a0` (test)
3. **Task 3: Health panel LM Studio status wiring (GATE-03)** - `5ee76c9` (feat)

## Files Created/Modified
- `packages/api/src/routes/models.ts` - GET /api/models endpoint returning cached LM Studio status via getLmStudioStatus()
- `packages/api/src/routes/budget.ts` - GET /api/budget endpoint returning weekly budget with tier suggestion
- `packages/api/src/app.ts` - Registered createModelRoutes and createBudgetRoutes in route chain
- `packages/api/src/index.ts` - LM Studio probe timer startup on boot and cleanup on shutdown
- `packages/api/src/routes/sessions.ts` - Budget context enrichment in hook/start for both resume and new session paths
- `packages/api/src/__tests__/routes/models.test.ts` - 3 tests for GET /api/models response shape and default state
- `packages/api/src/__tests__/routes/budget.test.ts` - 6 tests for GET /api/budget response, counts, and isEstimated flag
- `packages/web/src/hooks/use-lm-studio.ts` - React hook polling GET /api/models on 30s interval
- `packages/web/src/components/health/health-panel.tsx` - LM Studio section with three-state health dot between Uptime and Services

## Decisions Made
- Extracted budget enrichment into `buildBudgetContext` helper function for DRY reuse across both session resume and new session creation paths
- Called `useLmStudio` hook directly inside HealthPanel component rather than threading through props from App.tsx -- minimizes change surface and keeps the hook self-contained
- LM Studio probe timer cleanup runs before session reaper cleanup in the shutdown sequence (reversed from startup order for clean teardown)
- Hono RPC type chain remained stable at 16 route groups (no "excessively deep" TypeScript errors)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All Phase 13 requirements (GATE-01 through GATE-03, API-05, API-06, BUDG-02 through BUDG-04) verified by automated tests
- Phase 14 (Intelligence) can consume budget and LM Studio endpoints for intelligent routing
- Dashboard health panel ready for Phase 15 budget widget enrichment
- No blockers

---
## Self-Check: PASSED

- All 5 created files exist on disk
- All 4 modified files exist on disk
- All 3 task commits verified (fd692f4, fa8b3a0, 5ee76c9)
- 361 API tests + 68 web tests + 20 MCP tests passing
- Typecheck clean across all 4 packages

---
*Phase: 13-lm-gateway-budget*
*Completed: 2026-03-16*
