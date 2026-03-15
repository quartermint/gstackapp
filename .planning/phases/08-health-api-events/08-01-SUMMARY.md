---
phase: 08-health-api-events
plan: 01
subsystem: api
tags: [hono, health-checks, risks, copies, zod, sqlite, tdd]

# Dependency graph
requires:
  - phase: 07-git-health-engine
    provides: Health finding persistence, copy record upserts, post-scan health phase
provides:
  - GET /api/health-checks endpoint (list + per-project with riskLevel)
  - GET /api/risks endpoint with riskCount integer for browser title (RISK-04)
  - isNew boolean on all findings from scan-cycle timestamp (RISK-05)
  - GET /api/copies endpoint (list + per-project with isStale)
  - Shared response schemas and TypeScript types
  - getLastScanCycleStartedAt() exported from project-scanner
  - getAllCopies() query function
affects: [09-dashboard-intelligence, 10-mcp-server]

# Tech tracking
tech-stack:
  added: []
  patterns: [factory-function route pattern with getInstance injection, response schema extension via .extend()]

key-files:
  created:
    - packages/api/src/routes/health-checks.ts
    - packages/api/src/routes/risks.ts
    - packages/api/src/routes/copies.ts
    - packages/api/src/__tests__/routes/health-checks.test.ts
    - packages/api/src/__tests__/routes/risks.test.ts
    - packages/api/src/__tests__/routes/copies.test.ts
  modified:
    - packages/shared/src/schemas/health.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts
    - packages/api/src/db/queries/copies.ts
    - packages/api/src/services/project-scanner.ts
    - packages/api/src/app.ts

key-decisions:
  - "isNew computed via module-level lastScanCycleStartedAt timestamp comparison (not time-window heuristic)"
  - "isStale threshold set to 10 minutes (2 scan cycles) matching existing STALE_THRESHOLD_MS pattern"
  - "riskCount excludes info-severity findings (only critical + warning count as risks)"

patterns-established:
  - "Response schema extension: use .extend() on base schemas to add computed fields (isNew, isStale)"
  - "Scan-cycle timestamp pattern: set at top of scanAllProjects, read by route handlers"

requirements-completed: [RISK-04, RISK-05]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 8 Plan 01: Health API Routes Summary

**Three typed Hono endpoints (health-checks, risks, copies) exposing health findings with isNew/isStale flags and riskCount for browser title**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T01:13:47Z
- **Completed:** 2026-03-15T01:19:18Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- GET /api/health-checks returns active findings with isNew boolean derived from scan-cycle timestamp (RISK-05)
- GET /api/risks returns riskCount integer for dashboard browser title (RISK-04)
- GET /api/copies returns copy records with isStale flag for staleness detection
- 15 integration tests covering empty state, populated state, severity filtering, per-project queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Add shared schemas, query functions, and scan-cycle tracking** - `98ee550` (feat)
2. **Task 2 RED: Failing tests for health-checks, risks, copies routes** - `77d9088` (test)
3. **Task 2 GREEN: Implement health-checks, risks, copies routes** - `c055241` (feat)

## Files Created/Modified
- `packages/shared/src/schemas/health.ts` - Added 7 response schemas (healthFindingResponse, healthCheckResponse, healthCheckDetailResponse, risksResponse, copyResponse, copiesList, copiesDetail)
- `packages/shared/src/types/index.ts` - Added 4 inferred types (HealthFindingResponse, HealthCheckResponse, RisksResponse, CopyResponse)
- `packages/shared/src/index.ts` - Re-exported new schemas and types
- `packages/api/src/db/queries/copies.ts` - Added getAllCopies() function
- `packages/api/src/services/project-scanner.ts` - Added lastScanCycleStartedAt tracking and getLastScanCycleStartedAt() export
- `packages/api/src/routes/health-checks.ts` - New route file: GET /health-checks and GET /health-checks/:slug
- `packages/api/src/routes/risks.ts` - New route file: GET /risks with severity grouping and riskCount
- `packages/api/src/routes/copies.ts` - New route file: GET /copies and GET /copies/:slug
- `packages/api/src/app.ts` - Registered 3 new route factories in RPC chain
- `packages/api/src/__tests__/routes/health-checks.test.ts` - 6 integration tests
- `packages/api/src/__tests__/routes/risks.test.ts` - 4 integration tests
- `packages/api/src/__tests__/routes/copies.test.ts` - 5 integration tests

## Decisions Made
- isNew computed via module-level lastScanCycleStartedAt timestamp string comparison rather than a time-window heuristic -- more precise and matches research recommendation
- isStale threshold set to 10 minutes (2 scan cycles) consistent with existing STALE_THRESHOLD_MS pattern in post-scan divergence detection
- riskCount excludes info-severity findings because info-level findings do not represent actionable risk

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test database lifecycle in copies.test.ts**
- **Found during:** Task 2 GREEN (copies route testing)
- **Issue:** GET /api/copies/:slug tests were in a sibling describe block that ran after the "with data" describe's afterAll closed the database, causing 500 errors
- **Fix:** Moved :slug tests inside the "with data" describe block so they share the same database lifecycle
- **Files modified:** packages/api/src/__tests__/routes/copies.test.ts
- **Verification:** All 5 copies tests pass
- **Committed in:** c055241 (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test structure fix necessary for correctness. No scope creep.

## Issues Encountered
None beyond the test lifecycle issue documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 health API endpoints ready for dashboard consumption (Plan 02 SSE + dashboard integration)
- riskCount available at /api/risks for document.title update
- isNew flag available for "new finding" indicators in dashboard
- isStale flag available for copy freshness display

## Self-Check: PASSED

All 8 key files verified present. All 3 task commits (98ee550, 77d9088, c055241) verified in git log.

---
*Phase: 08-health-api-events*
*Completed: 2026-03-15*
