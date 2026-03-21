---
phase: 28-dashboard-highlight-mode
plan: 02
subsystem: ui
tags: [react, highlight-mode, visit-tracking, tailwind, indigo-accent]

# Dependency graph
requires:
  - phase: 28-01
    provides: Visit tracking API (GET /api/visits/last, POST /api/visits)
provides:
  - useLastVisit hook for fetching and recording visits
  - highlight.ts pure functions (computeChangedSlugs, sortWithChangedFirst)
  - Indigo left-border accent on changed projects in departure board
  - Changed projects sorted to top of each activity group
  - "N changed" badge in WhatsNewStrip
  - Click-to-clear highlight behavior via seenSlugs state
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [seenSlugs click-to-clear for per-session highlight dismissal]

key-files:
  created:
    - packages/web/src/lib/highlight.ts
    - packages/web/src/hooks/use-last-visit.ts
    - packages/web/src/__tests__/lib/highlight.test.ts
  modified:
    - packages/web/src/App.tsx
    - packages/web/src/components/departure-board/departure-board.tsx
    - packages/web/src/components/departure-board/project-group.tsx
    - packages/web/src/components/departure-board/project-row.tsx
    - packages/web/src/components/whats-new/whats-new-strip.tsx

key-decisions:
  - "seenSlugs state tracks clicked projects so highlights clear on click without API round-trip"
  - "Border priority: selected (terracotta) > stale (amber) > changed (indigo) > default (transparent)"

patterns-established:
  - "Visit-once-per-pageload: useLastVisit fetches previous visit then records new visit sequentially (not parallel)"
  - "Changed-first sorting: sortWithChangedFirst preserves recency within changed/unchanged subsets"

requirements-completed: [DASH-02, DASH-03, DASH-04]

# Metrics
duration: 4min
completed: 2026-03-21
---

# Phase 28 Plan 02: Dashboard Highlight Mode Summary

**Frontend highlight mode with indigo accent borders on changed projects, changed-first sorting, click-to-clear, and "N changed" badge in WhatsNewStrip**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T20:42:46Z
- **Completed:** 2026-03-21T20:47:22Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Pure functions for changed slug computation and changed-first sorting with 6 unit tests
- useLastVisit hook that fetches previous visit timestamp and records new visit sequentially (race-condition safe)
- Indigo left-border accent on changed projects with correct priority (selected > stale > changed > default)
- Changed projects float to top of each activity group (Active/Idle/Stale) via sortWithChangedFirst
- "N changed" badge in WhatsNewStrip with indigo styling, strip stays visible when only changedCount > 0
- Click-to-clear: clicking a highlighted project marks it as seen via seenSlugs state

## Task Commits

Each task was committed atomically:

1. **Task 1: Highlight pure functions + useLastVisit hook + tests** - `2fbc002` (test, RED) + `9beb315` (feat, GREEN)
2. **Task 2: Wire highlight mode into dashboard components** - `b2ae04e` (feat)

_Note: Task 1 used TDD with RED/GREEN commits_

## Files Created/Modified
- `packages/web/src/lib/highlight.ts` - computeChangedSlugs and sortWithChangedFirst pure functions
- `packages/web/src/hooks/use-last-visit.ts` - Hook fetching previous visit and recording new visit sequentially
- `packages/web/src/__tests__/lib/highlight.test.ts` - 6 unit tests for highlight pure functions
- `packages/web/src/App.tsx` - useLastVisit integration, changedSlugs computation, seenSlugs state, handleSelect callback
- `packages/web/src/components/departure-board/departure-board.tsx` - sortWithChangedFirst applied to each group, changedSlugs prop passthrough
- `packages/web/src/components/departure-board/project-group.tsx` - changedSlugs prop, isChanged passed to ProjectRow
- `packages/web/src/components/departure-board/project-row.tsx` - isChanged prop with indigo-400 border-l accent
- `packages/web/src/components/whats-new/whats-new-strip.tsx` - changedCount prop, indigo badge, updated null check

## Decisions Made
- seenSlugs state tracks clicked projects so highlights clear on click without API round-trip
- Border priority: selected (terracotta) > stale (amber) > changed (indigo) > default (transparent)
- useLastVisit uses plain fetch (not hc client) to avoid type complexity, matching use-discoveries pattern
- WhatsNewStrip null check includes changedCount to keep strip visible when only changed projects exist

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode error in highlight tests**
- **Found during:** Task 2 (verification)
- **Issue:** `result[0].slug` indexed access on array possibly undefined under strict mode
- **Fix:** Changed to `result.map((p) => p.slug)` with `toEqual` assertion
- **Files modified:** packages/web/src/__tests__/lib/highlight.test.ts
- **Verification:** `pnpm typecheck` exits 0
- **Committed in:** b2ae04e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** TypeScript strict mode compliance fix. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 28 complete: visit tracking API + dashboard highlight mode fully wired
- All DASH requirements (DASH-01 through DASH-04) fulfilled
- 90 web tests, 588 API tests, zero regressions

## Self-Check: PASSED

All 3 files verified present. All 3 commits verified in git log.

---
*Phase: 28-dashboard-highlight-mode*
*Completed: 2026-03-21*
