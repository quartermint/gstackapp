---
phase: 05-dashboard-enrichments-real-time
plan: 02
subsystem: ui
tags: [sse, heatmap, react-hooks, real-time, event-source, contribution-grid]

# Dependency graph
requires:
  - phase: 05-dashboard-enrichments-real-time
    provides: SSE event bus, /api/events endpoint, /api/heatmap endpoint (Plan 05-01)
  - phase: 02-dashboard-core
    provides: App.tsx, useProjects hook, dashboard layout, theme system
  - phase: 03-capture-pipeline
    provides: useCaptures hooks with refetch, capture field, command palette
provides:
  - useSSE hook with auto-reconnect and exponential backoff for real-time updates
  - useHeatmap hook for fetching commit intensity data
  - useProjects refetch capability for SSE-triggered project list refresh
  - SprintHeatmap component with GitHub-style contribution grid (5-level terracotta scale)
  - HeatmapGrid and HeatmapCell components for per-project row rendering
  - SSE event dispatch wired into App.tsx for capture and scan refetches
affects: [05-03-health-pulse-stale-nudges]

# Tech tracking
tech-stack:
  added: []
  patterns: [sse-event-source-hook, useref-callback-pattern, fetchcounter-refetch, heatmap-contribution-grid]

key-files:
  created:
    - packages/web/src/hooks/use-sse.ts
    - packages/web/src/hooks/use-heatmap.ts
    - packages/web/src/components/heatmap/sprint-heatmap.tsx
    - packages/web/src/components/heatmap/heatmap-grid.tsx
    - packages/web/src/components/heatmap/heatmap-cell.tsx
  modified:
    - packages/web/src/hooks/use-projects.ts
    - packages/web/src/App.tsx

key-decisions:
  - "useSSE uses useRef for options to avoid stale closures (same pattern as useKeyboardShortcuts)"
  - "Custom reconnection with exponential backoff + jitter rather than relying on browser auto-reconnect"
  - "Heatmap sorted by total commits descending (most active project at top)"
  - "Display names derived from slugs via capitalize+split (no additional API field needed)"
  - "Month labels positioned absolutely by day offset for accurate alignment"

patterns-established:
  - "SSE hook pattern: EventSource + useRef callbacks + exponential backoff reconnect"
  - "fetchCounter pattern for exposing refetch on hooks without it (useProjects extension)"
  - "Heatmap intensity scale: 0/1/2-3/4-6/7+ commits mapped to 5 terracotta opacity levels"

requirements-completed: [DASH-05, DASH-09]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 5 Plan 2: Sprint Heatmap and SSE Real-Time Dashboard Summary

**GitHub-style contribution heatmap showing 12-week commit intensity per project with SSE real-time refetch wiring for live dashboard updates**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T05:10:16Z
- **Completed:** 2026-03-10T05:13:30Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Sprint heatmap renders above departure board with one row per project, 12-week window, 5-level terracotta intensity scale
- useSSE hook connects to /api/events with custom exponential backoff reconnection (1s-30s with jitter)
- SSE events trigger automatic refetches: capture events refresh captures/counts, scan events refresh projects and heatmap
- useProjects extended with refetch capability for SSE-triggered project list refresh
- Mobile responsive via overflow-x-auto with min-width constraint on grid content

## Task Commits

Each task was committed atomically:

1. **Task 1: useSSE hook, useHeatmap hook, and useProjects refetch extension** - `0be3547` (feat)
2. **Task 2: Sprint heatmap components and App.tsx wiring** - `2a492a9` (feat)

## Files Created/Modified
- `packages/web/src/hooks/use-sse.ts` - SSE connection hook with typed callbacks and exponential backoff reconnect
- `packages/web/src/hooks/use-heatmap.ts` - Fetch hook for /api/heatmap with fetchCounter-based refetch
- `packages/web/src/hooks/use-projects.ts` - Extended with fetchCounter + refetch for SSE-triggered refresh
- `packages/web/src/components/heatmap/sprint-heatmap.tsx` - Full-width container with month labels, loading skeleton, project grouping
- `packages/web/src/components/heatmap/heatmap-grid.tsx` - Single project row with day-by-day cell rendering
- `packages/web/src/components/heatmap/heatmap-cell.tsx` - Individual intensity cell with tooltip and 5-level color scale
- `packages/web/src/App.tsx` - Wired useSSE, useHeatmap, SprintHeatmap; extracted refetchProjects from useProjects

## Decisions Made
- useSSE callbacks dispatched via useRef to avoid stale closure issues (matching useKeyboardShortcuts pattern)
- Custom reconnection rather than browser default -- EventSource auto-reconnect doesn't support exponential backoff
- Heatmap projects sorted by total commit count descending so most active appears at top
- Non-null assertion on month name array access (getMonth returns 0-11, always within bounds)
- Display names derived from project slugs via capitalize + split on hyphens (avoids extra API field)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode array indexing**
- **Found during:** Task 2 (SprintHeatmap month labels)
- **Issue:** `months[month]` returned `string | undefined` under strict TypeScript noUncheckedIndexedAccess
- **Fix:** Used non-null assertion with comment explaining getMonth() always returns 0-11
- **Files modified:** packages/web/src/components/heatmap/sprint-heatmap.tsx
- **Verification:** pnpm typecheck passes clean
- **Committed in:** 2a492a9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type safety fix. No scope creep.

## Issues Encountered
None -- both tasks executed smoothly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All SSE and heatmap frontend components are operational
- Dashboard now updates in real-time via SSE event stream
- Plan 05-03 (health pulse, stale nudges, "previously on") is the final plan and can consume the SSE infrastructure

## Self-Check: PASSED

All 5 created files verified on disk. All 2 task commits (0be3547, 2a492a9) verified in git log.

---
*Phase: 05-dashboard-enrichments-real-time*
*Completed: 2026-03-10*
