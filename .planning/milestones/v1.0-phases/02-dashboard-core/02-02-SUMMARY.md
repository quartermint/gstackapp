---
phase: 02-dashboard-core
plan: 02
subsystem: ui
tags: [react, tailwind-v4, responsive, dark-mode, departure-board, hero-card, dashboard-components]

# Dependency graph
requires:
  - phase: 02-dashboard-core
    plan: 01
    provides: "Warm theme tokens, React hooks (useProjects, useProjectDetail, useTheme), utility functions (formatRelativeTime, groupProjectsByActivity)"
provides:
  - "Complete dashboard UI: hero card, departure board, project rows, theme toggle"
  - "Responsive layout with mobile-condensed project rows"
  - "Interactive hero swapping on project row click"
  - "Loading skeletons and error/empty states"
  - "11 reusable UI components with typed props and dark mode support"
affects: [capture-pipeline, dashboard-enrichments]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Component composition: DashboardLayout > HeroCard + DepartureBoard > ProjectGroup > ProjectRow", "Responsive hiding via hidden sm:inline pattern", "Inline SVG icons (no icon library dependency)", "Auto-select first active project as hero on data load"]

key-files:
  created:
    - packages/web/src/components/layout/dashboard-layout.tsx
    - packages/web/src/components/hero/hero-card.tsx
    - packages/web/src/components/hero/commit-timeline.tsx
    - packages/web/src/components/departure-board/departure-board.tsx
    - packages/web/src/components/departure-board/project-group.tsx
    - packages/web/src/components/departure-board/project-row.tsx
    - packages/web/src/components/ui/host-badge.tsx
    - packages/web/src/components/ui/gsd-badge.tsx
    - packages/web/src/components/ui/dirty-indicator.tsx
    - packages/web/src/components/ui/loading-skeleton.tsx
    - packages/web/src/components/ui/theme-toggle.tsx
  modified:
    - packages/web/src/App.tsx

key-decisions:
  - "Component composition over monolith: 11 focused components with typed props instead of one large dashboard file"
  - "Inline SVG for theme toggle icons: avoids icon library dependency for two icons"
  - "Auto-select first active project as hero: immediate value on load without user interaction"
  - "No animation on hero swap: instant response per CONTEXT.md directive"

patterns-established:
  - "Dashboard layout pattern: DashboardLayout shell > content sections (hero + board)"
  - "Activity group rendering: skip empty groups, always expanded (no collapsible sections)"
  - "Responsive mobile pattern: hidden sm:inline to hide secondary metadata on small screens"
  - "Loading skeleton pattern: HeroSkeleton and BoardSkeleton with animate-pulse"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-10, DASH-11]

# Metrics
duration: 15min
completed: 2026-03-09
---

# Phase 2 Plan 02: Dashboard UI Components Summary

**Complete departure board dashboard with hero card, commit timeline, project rows grouped by activity, warm theme with dark toggle, responsive layout, and instant hero swapping on click**

## Performance

- **Duration:** 15 min (across two execution sessions with visual checkpoint)
- **Started:** 2026-03-09T16:24:32Z
- **Completed:** 2026-03-09T16:45:12Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 12 (11 created, 1 modified)

## Accomplishments
- Built 11 dashboard UI components with typed props and full dark mode support using warm theme tokens
- Wired App.tsx as dashboard orchestrator: auto-selects most active project as hero, instant hero swap on row click, loading/error/empty states
- Visual verification approved at all breakpoints: warm light default, dark toggle with persistence, mobile-condensed layout, no horizontal scroll
- Phase 2 complete: the "smarter in 3 seconds" departure board is fully functional

## Task Commits

Each task was committed atomically:

1. **Task 1: Dashboard UI components** - `fb406b3` (feat) -- 11 component files created
2. **Task 2: Wire App.tsx with state management** - `dcc0dfd` (feat) -- App.tsx rewritten as dashboard orchestrator
3. **Task 3: Visual verification** - checkpoint approved, no code changes

## Files Created/Modified

**Created:**
- `packages/web/src/components/layout/dashboard-layout.tsx` - Page shell with header, health indicator, theme toggle, max-width container
- `packages/web/src/components/hero/hero-card.tsx` - Expanded project hero with commit timeline, GSD badge, dirty indicator
- `packages/web/src/components/hero/commit-timeline.tsx` - Vertical commit list with terracotta left border accent
- `packages/web/src/components/departure-board/departure-board.tsx` - Groups container rendering Active/Idle/Stale sections
- `packages/web/src/components/departure-board/project-group.tsx` - Single activity group with count badge and color variant
- `packages/web/src/components/departure-board/project-row.tsx` - Clickable project row with two-line layout, responsive hiding
- `packages/web/src/components/ui/host-badge.tsx` - Local vs Mac Mini pill badge
- `packages/web/src/components/ui/gsd-badge.tsx` - GSD phase state badge with amber styling
- `packages/web/src/components/ui/dirty-indicator.tsx` - Uncommitted changes rust-colored indicator
- `packages/web/src/components/ui/loading-skeleton.tsx` - HeroSkeleton and BoardSkeleton with pulse animation
- `packages/web/src/components/ui/theme-toggle.tsx` - Sun/moon toggle with inline SVG, accessible labels

**Modified:**
- `packages/web/src/App.tsx` - Rewritten as dashboard orchestrator wiring all hooks, components, and state

## Decisions Made
- **Component composition:** 11 focused components with typed props rather than a monolithic dashboard file. Enables reuse in future phases.
- **Inline SVG for toggle icons:** Two icons (sun/moon) don't justify an icon library dependency.
- **Auto-select first active project:** Hero card shows most recently active project immediately on load -- user gets value in under 1 second.
- **No hero swap animation:** Instant response on click per CONTEXT.md directive. The data fetch may show a brief loading state but the UI is never blocked.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 complete: dashboard is the daily-driver "smarter in 3 seconds" surface
- All project data renders with real API data through hooks built in Plan 01
- Component architecture ready for Phase 3 additions (capture field, command palette)
- DashboardLayout provides the shell that capture UI will integrate into
- ProjectRow click handler demonstrates the interaction pattern for future capture interactions
- 61+ tests passing, typecheck clean, production build succeeds

## Self-Check: PASSED

All 12 files verified on disk (11 created, 1 modified). Both task commits (fb406b3, dcc0dfd) verified in git log.

---
*Phase: 02-dashboard-core*
*Completed: 2026-03-09*
