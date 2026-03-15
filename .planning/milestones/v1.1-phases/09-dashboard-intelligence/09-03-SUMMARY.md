---
phase: 09-dashboard-intelligence
plan: 03
subsystem: ui
tags: [react, health-dot, findings-panel, sse, app-layout, tdd]

# Dependency graph
requires:
  - phase: 09-dashboard-intelligence
    provides: RiskFeed component, SEVERITY_COLORS, useRisks hook (Plan 01); SprintTimeline component (Plan 02)
  - phase: 08-health-api-events
    provides: GET /api/health-checks/:slug endpoint with per-project findings and riskLevel
provides:
  - HealthDot component with green/amber/red/gray severity and split-dot divergence indicator
  - FindingsPanel with lazy-load on expand and PreviouslyOn-style transition
  - useProjectHealth hook for on-demand per-project findings fetch
  - App.tsx fully wired layout (Capture > RiskFeed > SprintTimeline > Hero > DepartureBoard > LooseThoughts)
  - SSE health:changed triggers refetch of risks and projects
  - Document title with risk count badge
affects: [10-mcp-server-deprecation]

# Tech tracking
tech-stack:
  added: []
  patterns: [health dot severity indicator, lazy-load hook pattern (fetch only when slug is non-null), split dot for multi-copy divergence]

key-files:
  created:
    - packages/web/src/components/departure-board/health-dot.tsx
    - packages/web/src/components/departure-board/findings-panel.tsx
    - packages/web/src/hooks/use-project-health.ts
    - packages/web/src/__tests__/components/health-dot.test.tsx
  modified:
    - packages/web/src/lib/grouping.ts
    - packages/web/src/App.tsx
    - packages/web/src/components/departure-board/project-row.tsx
    - packages/web/src/components/departure-board/project-group.tsx
    - packages/web/src/components/departure-board/departure-board.tsx
    - packages/web/src/__tests__/lib/grouping.test.ts

key-decisions:
  - "HealthDot uses button element for accessibility with stopPropagation to prevent row selection"
  - "FindingsPanel uses lazy useProjectHealth hook (slug=null skips fetch) for on-demand loading"
  - "Split dot uses two half-circle divs with overflow-hidden for divergence indicator"
  - "App.tsx removes SprintHeatmap/useHeatmap, replaces with RiskFeed + SprintTimeline"

patterns-established:
  - "Lazy-fetch hook pattern: useProjectHealth(slug | null) only fetches when slug is truthy"
  - "Health dot in badge area: DirtyIndicator > HealthDot > capture-count in ProjectRow"
  - "Independent expansion states: PreviouslyOn and FindingsPanel expand separately on same row"

requirements-completed: [HDOT-01, HDOT-02, HDOT-03]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 9 Plan 03: Health Dots & App Wiring Summary

**Health dot indicators on project cards with lazy findings panel, App.tsx layout wiring (RiskFeed + SprintTimeline + SSE), and document title risk count**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T02:08:25Z
- **Completed:** 2026-03-15T02:13:34Z
- **Tasks:** 2 (Task 1 TDD, Task 2 auto)
- **Files modified:** 10

## Accomplishments
- HealthDot renders 8px severity-colored circle (green/amber/red/gray) with split-dot variant for diverged copies
- FindingsPanel lazy-loads per-project findings on expand with PreviouslyOn-style max-h transition
- App.tsx layout fully wired: Capture > RiskFeed > SprintTimeline > HeroCard > DepartureBoard > LooseThoughts
- SSE health:changed triggers refetch of risks and projects for real-time updates
- Document title shows "(N) Mission Control" when risks exist
- 8 new tests covering severity colors, split dot, click propagation, expand/collapse transitions
- ProjectItem interface extended with healthScore, riskLevel, copyCount fields

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Health dot and findings panel tests** - `a07ccb5` (test)
2. **Task 1 (GREEN): Health dot, findings panel, project health hook** - `b7af5a5` (feat)
3. **Task 2: Wire everything into App.tsx and project cards** - `c507942` (feat)

_TDD task: RED committed failing tests, GREEN committed implementation making them pass._

## Files Created/Modified
- `packages/web/src/components/departure-board/health-dot.tsx` - 8px severity dot with split-dot variant for diverged copies
- `packages/web/src/components/departure-board/findings-panel.tsx` - Expandable findings list with lazy-load and PreviouslyOn transition pattern
- `packages/web/src/hooks/use-project-health.ts` - On-demand hook fetching /api/health-checks/:slug when slug is non-null
- `packages/web/src/__tests__/components/health-dot.test.tsx` - 8 tests for HealthDot and FindingsPanel
- `packages/web/src/lib/grouping.ts` - ProjectItem extended with healthScore, riskLevel, copyCount
- `packages/web/src/App.tsx` - New layout order, RiskFeed + SprintTimeline replace heatmap, SSE wiring, document.title
- `packages/web/src/components/departure-board/project-row.tsx` - HealthDot + FindingsPanel integration with independent expansion state
- `packages/web/src/components/departure-board/project-group.tsx` - Pass divergedSlugs and riskLevel to ProjectRow
- `packages/web/src/components/departure-board/departure-board.tsx` - Accept and forward divergedSlugs prop
- `packages/web/src/__tests__/lib/grouping.test.ts` - Updated makeProject with new health fields

## Decisions Made
- HealthDot uses a button element (not div) for keyboard accessibility, with e.stopPropagation() to prevent row selection on click
- FindingsPanel uses useProjectHealth(expanded ? slug : null) pattern -- null slug skips the fetch entirely, enabling true lazy loading
- Split dot implemented with two half-circle divs inside overflow-hidden container (left = severity color, right = rust for divergence)
- App.tsx removes SprintHeatmap/useHeatmap imports entirely (files kept on disk), replaces with RiskFeed and SprintTimeline components
- SSE onScanComplete no longer refetches heatmap; onHealthChanged added to refetch risks and projects

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed grouping test to include new ProjectItem fields**
- **Found during:** Task 1 (GREEN phase typecheck)
- **Issue:** Adding healthScore, riskLevel, copyCount to ProjectItem broke existing grouping.test.ts which constructs ProjectItem objects without the new fields (TS2739)
- **Fix:** Added `healthScore: null, riskLevel: "unmonitored", copyCount: 0` to makeProject helper
- **Files modified:** packages/web/src/__tests__/lib/grouping.test.ts
- **Verification:** `pnpm typecheck` passes all 5 packages
- **Committed in:** b7af5a5 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test code)
**Impact on plan:** Test fixture update required for type compatibility. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 9 (Dashboard Intelligence) is now complete: all 3 plans executed
- Risk feed, sprint timeline, and health dots are live in the dashboard
- SSE events provide real-time updates for all health-related components
- Ready for Phase 10 (MCP Server & Deprecation)

## Self-Check: PASSED

All 10 key files verified present. All 3 task commits (a07ccb5, b7af5a5, c507942) verified in git log.

---
*Phase: 09-dashboard-intelligence*
*Completed: 2026-03-15*
