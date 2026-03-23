---
phase: 05-dashboard-enrichments-real-time
plan: 03
subsystem: ui
tags: [stale-nudge, previously-on, health-panel, react-hooks, dashboard-enrichments]

# Dependency graph
requires:
  - phase: 05-dashboard-enrichments-real-time
    provides: SSE event bus, /api/health/system endpoint, heatmap API (Plan 05-01)
  - phase: 05-dashboard-enrichments-real-time
    provides: useSSE hook, useHeatmap hook, SprintHeatmap components (Plan 05-02)
  - phase: 02-dashboard-core
    provides: Dashboard layout, project rows, hero card, theme system
provides:
  - Stale nudge utility detecting projects idle 2+ weeks with dirty files
  - Amber/gold visual treatment on stale project rows with tooltip explanation
  - "Previously on..." expandable inline breadcrumbs showing last 3-5 commits and GSD state
  - useHealth polling hook fetching /api/health/system every 30 seconds
  - Clickable health dot expanding full system metrics panel (CPU, memory, disk, uptime, services)
  - Health dot color mapping: green (healthy), amber (degraded), red (unhealthy/unreachable)
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [stale-project-detection, expandable-inline-breadcrumbs, health-polling-hook, click-outside-dismiss]

key-files:
  created:
    - packages/web/src/lib/stale-nudge.ts
    - packages/web/src/components/departure-board/previously-on.tsx
    - packages/web/src/components/health/health-panel.tsx
    - packages/web/src/hooks/use-health.ts
    - packages/web/src/__tests__/lib/stale-nudge.test.ts
  modified:
    - packages/web/src/components/departure-board/project-row.tsx
    - packages/web/src/components/departure-board/departure-board.tsx
    - packages/web/src/components/departure-board/project-group.tsx
    - packages/web/src/components/layout/dashboard-layout.tsx
    - packages/web/src/App.tsx

key-decisions:
  - "Stale nudge uses 14-day threshold with dirty files check (not just idle)"
  - "Previously On collapsed by default per locked decision -- expand chevron reveals breadcrumbs"
  - "Only selected project row shows full Previously On (avoids N+1 API calls for detail data)"
  - "useHealth polls /api/health/system every 30 seconds with unreachable fallback"
  - "Health panel dismisses on click-outside, Escape key, or re-click of health dot"
  - "Health dot color derived from overallStatus: healthy=green, degraded=amber, unhealthy/unreachable=red"

patterns-established:
  - "Stale detection pattern: pure function checking lastCommitDate age + dirtyFiles presence"
  - "Inline expandable pattern: local useState + chevron rotation + conditional child render"
  - "Health polling pattern: useEffect + setInterval with immediate first fetch and cleanup"

requirements-completed: [DASH-06, DASH-07, DASH-08]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 5 Plan 3: Stale Nudges, Previously On Breadcrumbs, and Health Panel Summary

**Amber stale nudges on idle projects with dirty files, inline expandable "Previously on..." commit breadcrumbs, and clickable health dot expanding full system metrics panel**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T05:13:30Z
- **Completed:** 2026-03-10T05:17:28Z
- **Tasks:** 3 (2 auto + 1 visual checkpoint)
- **Files modified:** 13

## Accomplishments
- Stale project detection highlights projects idle 2+ weeks with uncommitted work using subtle amber border and background tint, with tooltip explaining why
- "Previously on..." breadcrumbs expand inline per project row showing last 3-5 commits with hash, message, and relative time, plus GSD state if present
- Health panel expands from clickable header dot showing CPU load, memory usage, disk usage, uptime, and per-service status with green/amber/red indicators
- useHealth hook polls /api/health/system every 30 seconds with graceful unreachable fallback
- All 135 tests pass, typecheck clean, build succeeds

## Task Commits

Each task was committed atomically:

1. **Task 1: Stale nudge utility, Previously On breadcrumbs, and project row extensions** - `21316b8` (feat)
2. **Task 2: Health polling hook, health panel, dashboard layout extension, and App.tsx wiring** - `163545d` (feat)
3. **Task 3: Visual verification checkpoint** - auto-approved (no commit, checkpoint only)

_Note: Task 1 was TDD -- test + implementation committed together after GREEN passed_

## Files Created/Modified
- `packages/web/src/lib/stale-nudge.ts` - Pure functions: isStaleWithDirty (14-day threshold + dirty check) and getStaleNudgeMessage
- `packages/web/src/__tests__/lib/stale-nudge.test.ts` - 5 unit tests covering all stale detection edge cases
- `packages/web/src/components/departure-board/previously-on.tsx` - Inline expandable commit breadcrumbs with GSD state line
- `packages/web/src/components/health/health-panel.tsx` - Dropdown panel with CPU, memory, disk, uptime, services sections
- `packages/web/src/hooks/use-health.ts` - Polling hook for /api/health/system with 30s interval and unreachable fallback
- `packages/web/src/components/departure-board/project-row.tsx` - Extended with stale styling, expand chevron, and PreviouslyOn integration
- `packages/web/src/components/departure-board/departure-board.tsx` - Passes detail data through to project rows
- `packages/web/src/components/departure-board/project-group.tsx` - Forwards commits and gsdState props to ProjectRow
- `packages/web/src/components/layout/dashboard-layout.tsx` - Clickable health dot with color mapping and HealthPanel toggle
- `packages/web/src/App.tsx` - Wired useHealth hook, health panel state, removed manual health fetch

## Decisions Made
- Stale nudge threshold set at 14 days with dirty files requirement (not just idle time)
- Previously On collapsed by default per locked decision from CONTEXT.md
- Only the currently selected project shows full Previously On breadcrumbs (pragmatic choice avoiding N+1 API calls)
- Health panel uses click-outside + Escape key dismissal pattern
- Replaced manual healthOk boolean fetch in App.tsx with useHealth hook for richer status data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None -- all tasks executed smoothly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- This is the final plan of Phase 5, which is the final phase of the v1 milestone
- All 34 v1 requirements are now complete
- Mission Control is ready for daily use as a personal operating environment

## Self-Check: PASSED

All 5 created files verified on disk. All 2 task commits (21316b8, 163545d) verified in git log.

---
*Phase: 05-dashboard-enrichments-real-time*
*Completed: 2026-03-10*
