---
phase: 20-session-enrichment
plan: 04
subsystem: ui
tags: [react, sse, convergence, hooks, dashboard]

# Dependency graph
requires:
  - phase: 20-session-enrichment (plan 01)
    provides: convergence detection algorithm
  - phase: 20-session-enrichment (plan 03)
    provides: convergence API endpoint and ConvergenceBadge component
provides:
  - useConvergence hook fetching convergence data from API
  - deriveConvergenceCounts pure function for per-project convergence counts
  - SSE convergence:detected handler for real-time updates
  - Complete data flow chain: API -> hook -> App -> DepartureBoard -> ProjectGroup -> ProjectRow -> ConvergenceBadge
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [fetchCounter hook pattern reused for convergence data]

key-files:
  created:
    - packages/web/src/hooks/use-convergence.ts
  modified:
    - packages/web/src/hooks/use-sse.ts
    - packages/web/src/App.tsx
    - packages/web/src/components/departure-board/departure-board.tsx
    - packages/web/src/components/departure-board/project-group.tsx

key-decisions:
  - "Used raw fetch() for convergence endpoint since it lives on sessions sub-router (not in typed Hono client)"
  - "Added refetchConvergence to onScanComplete and onSessionStopped SSE handlers (convergence may change during scans or when sessions end)"

patterns-established:
  - "Convergence data flow follows same prop-threading pattern as sessionCounts and captureCounts"

requirements-completed: [SESS-05]

# Metrics
duration: 7min
completed: 2026-03-16
---

# Phase 20 Plan 04: Convergence Badge Data Wiring Summary

**useConvergence hook + SSE handler wiring convergence data through DepartureBoard to ConvergenceBadge on project cards**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-16T23:07:20Z
- **Completed:** 2026-03-16T23:14:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created useConvergence hook with fetchCounter pattern matching existing hooks (use-sessions.ts)
- Wired convergence:detected SSE event through to refetch, enabling real-time badge updates
- Threaded convergenceCounts prop through App.tsx -> DepartureBoard -> ProjectGroup -> ProjectRow, closing the SESS-05 gap

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useConvergence hook and add SSE handler** - `099d1d5` (feat)
2. **Task 2: Thread convergenceCounts through DepartureBoard -> ProjectGroup -> ProjectRow** - `f17b913` (feat)

## Files Created/Modified
- `packages/web/src/hooks/use-convergence.ts` - New hook: useConvergence + deriveConvergenceCounts
- `packages/web/src/hooks/use-sse.ts` - Added onConvergenceDetected callback and convergence:detected event listener
- `packages/web/src/App.tsx` - Imports, hook call, useMemo, SSE handlers, and DepartureBoard prop
- `packages/web/src/components/departure-board/departure-board.tsx` - convergenceCounts prop added and threaded to ProjectGroup
- `packages/web/src/components/departure-board/project-group.tsx` - convergenceCounts prop added and mapped to ProjectRow convergence prop

## Decisions Made
- Used raw fetch() for convergence endpoint since it lives on the sessions sub-router and is not in the typed Hono client
- Added refetchConvergence to onScanComplete and onSessionStopped SSE handlers since convergence may change during scans or when sessions end

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing flaky grouping test (time-boundary sensitive at exactly 7 days) intermittently failed during turbo test runs. Not caused by convergence changes -- passed consistently when run directly via vitest.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- SESS-05 gap fully closed: convergence badge renders on project cards when convergence is detected
- Phase 20 (Session Enrichment) is now complete with all gaps closed
- Ready for remaining v1.3 phases (21-cli-client, 22-final-polish)

---
*Phase: 20-session-enrichment*
*Completed: 2026-03-16*

## Self-Check: PASSED
