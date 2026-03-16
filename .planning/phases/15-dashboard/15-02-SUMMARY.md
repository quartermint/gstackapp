---
phase: 15-dashboard
plan: 02
subsystem: ui
tags: [react, sessions, budget, dropdown, badges, sse]

# Dependency graph
requires:
  - phase: 15-dashboard-01
    provides: "useSessions, useBudget, deriveSessionCounts hooks, formatElapsedTime, SSE session listeners"
  - phase: 14-intelligence-layer
    provides: "Conflict detection, risk feed cards, SSE session:conflict events"
provides:
  - "SessionsIndicator header component with expandable dropdown"
  - "SessionCard rendering tool icon, project name, tier badge, elapsed time"
  - "BudgetWidget with burn rate colors and tier session counts"
  - "Budget suggestion tip in sessions dropdown"
  - "Session count badges on departure board project cards"
  - "Complete prop threading from App through DashboardLayout and DepartureBoard"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sessions dropdown follows HealthPanel click-outside/Escape pattern"
    - "Blue pill badge for session counts differentiates from terracotta capture badges"
    - "Burn rate color mapping: sage (low) / gold-status (moderate) / rust (hot)"
    - "Budget suggestion tip conditionally rendered when suggestedTier is non-null"

key-files:
  created:
    - packages/web/src/components/sessions/session-card.tsx
    - packages/web/src/components/sessions/budget-widget.tsx
    - packages/web/src/components/sessions/sessions-indicator.tsx
  modified:
    - packages/web/src/components/layout/dashboard-layout.tsx
    - packages/web/src/components/departure-board/departure-board.tsx
    - packages/web/src/components/departure-board/project-group.tsx
    - packages/web/src/components/departure-board/project-row.tsx
    - packages/web/src/app.tsx

key-decisions:
  - "Sessions indicator placed between health dot and nav pills in header left section"
  - "Session count badges use blue-500 to visually differentiate from terracotta capture badges"
  - "Budget suggestion tip only shows when suggestedTier is non-null (no noise for healthy usage)"

patterns-established:
  - "Component dropdown pattern: useState toggle + useRef + click-outside with setTimeout(0) + Escape key"
  - "Tier color mapping: opus=terracotta, sonnet=amber-warm, local=sage, unknown=text-muted"
  - "Prop threading pattern: App -> DashboardLayout (header) and App -> DepartureBoard -> ProjectGroup -> ProjectRow (badges)"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05]

# Metrics
duration: 4min
completed: 2026-03-16
---

# Phase 15 Plan 02: Session Dashboard UI Summary

**Sessions indicator with dropdown panel in header, budget widget with burn rate colors, budget suggestion tip, and per-project session count badges on departure board**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T16:50:27Z
- **Completed:** 2026-03-16T16:54:36Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Created three session UI components: SessionCard (tool icon, project name, tier badge, elapsed time), BudgetWidget (burn rate with sage/gold/rust colors, tier counts), and SessionsIndicator (header compact indicator with expandable dropdown panel)
- Integrated sessions indicator into dashboard header between health dot and nav pills with budget suggestion tip
- Added session count badges (blue pill with terminal icon) on departure board project cards
- Threaded all session/budget props from App.tsx through the complete component hierarchy

## Task Commits

Each task was committed atomically:

1. **Task 1: Create sessions indicator, session card, and budget widget components** - `6ca9d26` (feat)
2. **Task 2: Thread session data through dashboard layout and add session badges on project cards** - `6b0d949` (feat)

## Files Created/Modified
- `packages/web/src/components/sessions/session-card.tsx` - Individual session row with tool icon, project name, tier badge, elapsed time
- `packages/web/src/components/sessions/budget-widget.tsx` - Burn rate indicator with tier session counts
- `packages/web/src/components/sessions/sessions-indicator.tsx` - Header compact indicator with expandable dropdown panel
- `packages/web/src/components/layout/dashboard-layout.tsx` - Added SessionsIndicator and session/budget props
- `packages/web/src/components/departure-board/departure-board.tsx` - Added sessionCounts prop threading
- `packages/web/src/components/departure-board/project-group.tsx` - Added sessionCounts prop threading
- `packages/web/src/components/departure-board/project-row.tsx` - Added session count badge (blue pill)
- `packages/web/src/app.tsx` - Passed session/budget/sessionCounts to DashboardLayout and DepartureBoard

## Decisions Made
- Sessions indicator placed between health dot and nav pills in header -- groups system indicators on the left side
- Session count badges use blue-500 color to visually differentiate from terracotta capture count badges
- Budget suggestion tip only rendered when suggestedTier is non-null -- avoids noise for healthy usage patterns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- This completes Phase 15 (Dashboard Session Views) -- all session UI is now wired
- All 5 phases of v1.2 (Session Orchestrator + Local LLM Gateway) are complete
- Full test suite passes (442 tests across all packages), typecheck clean, build succeeds

---
*Phase: 15-dashboard*
*Completed: 2026-03-16*
