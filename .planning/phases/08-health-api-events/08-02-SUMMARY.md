---
phase: 08-health-api-events
plan: 02
subsystem: api
tags: [hono, sse, sprint-timeline, health-score, batch-query, segments]

# Dependency graph
requires:
  - phase: 08-health-api-events plan 01
    provides: health-checks route, risks route, copies route, health query functions
  - phase: 07-git-health-engine
    provides: git-health service with computeHealthScore, health findings, copy records
provides:
  - Sprint timeline endpoint with segment computation (GET /api/sprint-timeline)
  - Project list enriched with healthScore, riskLevel, copyCount
  - SSE hook with health:changed and copy:diverged event handlers
affects: [09-dashboard-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns: [batch query enrichment, segment gap detection, per-project density normalization]

key-files:
  created:
    - packages/api/src/routes/sprint-timeline.ts
    - packages/api/src/__tests__/routes/sprint-timeline.test.ts
  modified:
    - packages/api/src/app.ts
    - packages/api/src/routes/projects.ts
    - packages/api/src/__tests__/routes/projects.test.ts
    - packages/web/src/hooks/use-sse.ts

key-decisions:
  - "computeSegments exported as named function for direct unit testing (not just route-level integration tests)"
  - "healthScore null for projects with no findings (distinguishes unmonitored from healthy)"
  - "Batch getActiveFindings + getAllCopies fetched once per request, grouped client-side to avoid N+1"

patterns-established:
  - "Segment gap detection: walk sorted entries, split at >gapDays consecutive days with no commits"
  - "Per-project density normalization: commits / (maxDaily * daysInSegment) for meaningful cross-project comparison"
  - "Batch health enrichment: single query per table, Map-based grouping, merge in .map() loop"

requirements-completed: [RISK-04, RISK-05]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 8 Plan 02: Sprint Timeline + Health Enrichment Summary

**Sprint timeline endpoint with gap-based segmentation, project list enriched with healthScore/riskLevel/copyCount, and SSE hook extended for real-time health events**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T01:22:13Z
- **Completed:** 2026-03-15T01:28:02Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- GET /api/sprint-timeline returns project activity segments with gap detection and density normalization, ready for Phase 9 swimlane visualization
- GET /api/projects now returns healthScore, riskLevel, and copyCount per project via batch queries (no N+1)
- SSE hook handles health:changed and copy:diverged events for Phase 9 real-time refresh wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Sprint timeline route with segment computation** - `376148e` (feat, TDD)
2. **Task 2: Project list health enrichment and SSE hook extensions** - `408bea9` (feat)

## Files Created/Modified

- `packages/api/src/routes/sprint-timeline.ts` - Sprint timeline endpoint with computeSegments function
- `packages/api/src/__tests__/routes/sprint-timeline.test.ts` - 14 tests (unit + integration)
- `packages/api/src/app.ts` - Registered sprint timeline route in RPC chain
- `packages/api/src/routes/projects.ts` - Added healthScore, riskLevel, copyCount enrichment
- `packages/api/src/__tests__/routes/projects.test.ts` - 5 new health enrichment tests
- `packages/web/src/hooks/use-sse.ts` - Added health:changed and copy:diverged handlers

## Decisions Made

- computeSegments exported as a named function for direct unit testing (not hidden behind route handler)
- healthScore is null for projects with zero findings (unmonitored), distinct from scanned-healthy (100)
- Batch getActiveFindings + getAllCopies fetched once per request, grouped into Maps client-side to avoid N+1
- Used `as "unpushed_commits"` / `as "critical"` type casting for DB row strings passed to typed functions (matching existing codebase pattern)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode array index access errors**
- **Found during:** Task 1 (typecheck after GREEN phase)
- **Issue:** TypeScript strict mode flagged array index access as possibly undefined (sorted[0], sorted[i-1], etc.)
- **Fix:** Added non-null assertions (!) on array accesses where bounds were already verified by loop/length checks
- **Files modified:** packages/api/src/routes/sprint-timeline.ts, packages/api/src/__tests__/routes/sprint-timeline.test.ts
- **Verification:** pnpm typecheck passes clean
- **Committed in:** 376148e (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial fix for TypeScript strict mode compliance. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 (Health API & Events) fully complete - all API surface for health intelligence is ready
- Sprint timeline endpoint provides segment data for Phase 9's swimlane visualization
- Project list healthScore/riskLevel/copyCount ready for Phase 9's health dots on project cards
- SSE hook ready for Phase 9 to wire real-time health refresh into dashboard TanStack Query cache invalidation
- Full test suite green (296 tests), typecheck clean

---
*Phase: 08-health-api-events*
*Completed: 2026-03-15*
