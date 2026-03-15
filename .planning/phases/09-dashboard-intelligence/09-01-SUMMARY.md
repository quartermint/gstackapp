---
phase: 09-dashboard-intelligence
plan: 01
subsystem: ui
tags: [react, tailwind, risk-feed, health-colors, clipboard, tdd]

# Dependency graph
requires:
  - phase: 08-health-api-events
    provides: GET /api/risks endpoint with severity-grouped findings, isNew flag, riskCount
provides:
  - RiskFeed component rendering severity-grouped cards (critical first) or clean bar
  - RiskCard component with severity icon, project name, detail, duration, copy-command action hint
  - SEVERITY_COLORS shared utility for warm palette (rust/gold-status/sage) Tailwind classes
  - severityIcon function returning inline SVG React elements per severity level
  - getActionCommand function mapping 7 check types to git commands with metadata-aware branch
  - useRisks hook fetching /api/risks with fetchCounter refetch pattern
affects: [09-dashboard-intelligence plan 03 (health dots wiring)]

# Tech tracking
tech-stack:
  added: []
  patterns: [severity color mapping with multi-variant Tailwind class sets, copy-to-clipboard action hints with visual feedback]

key-files:
  created:
    - packages/web/src/lib/health-colors.ts
    - packages/web/src/lib/action-hints.ts
    - packages/web/src/hooks/use-risks.ts
    - packages/web/src/components/risk-feed/risk-feed.tsx
    - packages/web/src/components/risk-feed/risk-card.tsx
    - packages/web/src/__tests__/lib/health-colors.test.ts
    - packages/web/src/__tests__/components/risk-feed.test.tsx
  modified: []

key-decisions:
  - "SEVERITY_COLORS uses multi-variant object (text, bg, border, dot, icon) for flexible component styling"
  - "severityIcon uses createElement instead of JSX for pure utility function without .tsx dependency"
  - "getActionCommand returns empty string for unknown check types (graceful degradation)"

patterns-established:
  - "Severity color lookup: SEVERITY_COLORS[severity].variant for consistent warm palette across risk-related components"
  - "Action hint pattern: getActionCommand(checkType, metadata) returns copyable git command"

requirements-completed: [RISK-01, RISK-02, RISK-03]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 9 Plan 01: Risk Feed Summary

**Risk feed with severity-grouped cards (critical first), warm palette health colors, copy-command action hints, and useRisks data hook**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T02:00:08Z
- **Completed:** 2026-03-15T02:05:10Z
- **Tasks:** 2 (both TDD)
- **Files modified:** 7

## Accomplishments
- SEVERITY_COLORS maps critical/warning/healthy to rust/gold-status/sage Tailwind class sets (text, bg, border, dot, icon)
- getActionCommand maps all 7 health check types to git commands with metadata-aware branch substitution
- RiskFeed renders severity-grouped cards (critical first) or "All projects healthy" clean bar
- RiskCard shows severity icon, project name, detail, duration, "new" badge, and copy-command action hint
- No dismiss buttons on any cards (RISK-03 compliance)
- 25 tests (16 utility + 9 component) covering colors, action commands, rendering, ordering, and clipboard behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared health utilities and risk data hook** - `8db77f6` (feat, TDD)
2. **Task 2: Risk feed components with tests** - `34978e7` (feat, TDD)

## Files Created/Modified
- `packages/web/src/lib/health-colors.ts` - SEVERITY_COLORS constant and severityIcon function with warm palette Tailwind classes
- `packages/web/src/lib/action-hints.ts` - getActionCommand mapping check types to git commands
- `packages/web/src/hooks/use-risks.ts` - useRisks hook fetching /api/risks with fetchCounter pattern
- `packages/web/src/components/risk-feed/risk-feed.tsx` - Container rendering severity-grouped risk cards or clean healthy bar
- `packages/web/src/components/risk-feed/risk-card.tsx` - Single-line finding card with copy-command action hint
- `packages/web/src/__tests__/lib/health-colors.test.ts` - 16 tests for SEVERITY_COLORS, severityIcon, and getActionCommand
- `packages/web/src/__tests__/components/risk-feed.test.tsx` - 9 tests for RiskFeed and RiskCard rendering and behavior

## Decisions Made
- SEVERITY_COLORS uses a multi-variant object shape (text, bg, border, dot, icon strings) rather than single class -- enables flexible consumption across risk feed, health dots, and findings panel
- severityIcon uses React.createElement instead of JSX so the utility file stays .ts (not .tsx), maintaining pure utility separation
- getActionCommand returns empty string for unknown check types rather than throwing -- graceful degradation for forward compatibility with new check types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed clipboard test mock in component tests**
- **Found during:** Task 2 (RiskCard clipboard test)
- **Issue:** `vi.fn()` assigned via `Object.assign(navigator, ...)` was not recognized as a spy by vitest in jsdom environment
- **Fix:** Used `Object.defineProperty` with `configurable: true` for navigator.clipboard, and `fireEvent.click` with `act()` wrapper for proper React lifecycle handling
- **Files modified:** packages/web/src/__tests__/components/risk-feed.test.tsx
- **Verification:** All 9 component tests pass with no act() warnings
- **Committed in:** 34978e7 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed TypeScript strict mode error in test assertions**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** `getAllByTestId()` return type has possibly-undefined elements under strict mode, causing TS2532 on array index access
- **Fix:** Added non-null assertions (`!`) and `toHaveLength(2)` guard assertion before element access
- **Files modified:** packages/web/src/__tests__/components/risk-feed.test.tsx
- **Verification:** `pnpm typecheck` passes all 5 packages
- **Committed in:** 34978e7 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs, both in test code)
**Impact on plan:** Test infrastructure fixes required for correctness. No scope creep.

## Issues Encountered
None beyond the test mock issues documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RiskFeed component ready for App.tsx wiring in Plan 03 (health dots + final integration)
- useRisks hook ready for SSE-triggered refetch integration
- SEVERITY_COLORS and getActionCommand available for Plan 03 health dot indicators on project cards
- All shared utilities exported and tested

## Self-Check: PASSED

All 7 key files verified present. Both task commits (8db77f6, 34978e7) verified in git log.

---
*Phase: 09-dashboard-intelligence*
*Completed: 2026-03-15*
