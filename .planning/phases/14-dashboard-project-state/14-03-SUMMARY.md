---
phase: 14-dashboard-project-state
plan: 03
subsystem: web
tags: [react, dashboard, project-cards, infrastructure, carryover, sidebar, routing]

requires:
  - phase: 14-dashboard-project-state
    provides: "Plan 01 projects API and shared schemas"
  - phase: 14-dashboard-project-state
    provides: "Plan 02 design-docs, worklog, infra API routes"
provides:
  - "Dashboard landing page with project cards grid, status indicators, carryover section, infra panel"
  - "Rewired app shell with 6-view navigation: projects, pr-reviews, trends, repos, design-docs, session"
  - "React Query hooks for projects, carryover, infra status, and design docs endpoints"
  - "DesignDocBrowser component with text-only rendering (no HTML injection)"
affects: [14-04-PLAN, dashboard-polish]

tech-stack:
  added: []
  patterns: [dashboard-composition, status-dot-indicators, collapsible-section, view-routing-switch]

key-files:
  created:
    - packages/web/src/hooks/useProjects.ts
    - packages/web/src/hooks/useDashboard.ts
    - packages/web/src/components/dashboard/StatusDot.tsx
    - packages/web/src/components/dashboard/ProjectCard.tsx
    - packages/web/src/components/dashboard/ProjectGrid.tsx
    - packages/web/src/components/dashboard/ServiceStatus.tsx
    - packages/web/src/components/dashboard/InfraPanel.tsx
    - packages/web/src/components/dashboard/CarryoverItem.tsx
    - packages/web/src/components/dashboard/CarryoverSection.tsx
    - packages/web/src/components/dashboard/DashboardView.tsx
    - packages/web/src/components/dashboard/DesignDocBrowser.tsx
  modified:
    - packages/api/src/index.ts
    - packages/web/src/api/client.ts
    - packages/web/src/components/layout/Sidebar.tsx
    - packages/web/src/App.tsx

key-decisions:
  - "Dashboard is default landing page via 'projects' view in AppView union type"
  - "Existing v1.0 PR pipeline accessible as 'pr-reviews' view preserving backward compatibility (PREV-01)"
  - "DesignDocBrowser renders markdown as text only, not dangerouslySetInnerHTML, per T-14-10 threat model"
  - "Project card click creates new session (handleNewSession) since session-project linking is Phase 12 territory"

patterns-established:
  - "Dashboard composition: DashboardView orchestrates ProjectGrid + CarryoverSection + InfraPanel"
  - "StatusDot component handles both project status (active/stale/ideating) and service health (healthy/degraded/down)"
  - "NavButton extracted as shared component in Sidebar for consistent navigation styling"

requirements-completed: [DASH-01, DASH-02, DASH-04, DASH-05, DASH-06, PREV-01]

duration: 4min
completed: 2026-04-08
---

# Phase 14 Plan 03: Dashboard Frontend & App Shell Summary

**Project cards grid with status indicators, infrastructure panel, carryover section, and rewired app shell with dashboard as landing page across 6 navigation views**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T15:21:55Z
- **Completed:** 2026-04-08T15:25:49Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- Mounted all Phase 14 API routes (design-docs, worklog, infra) in API index alongside existing projects route
- Created React Query hooks for all dashboard data: useProjects, useCarryover, useInfraStatus, useDesignDocs
- Built 11 dashboard components following UI spec: StatusDot, ProjectCard, ProjectGrid, ServiceStatus, InfraPanel, CarryoverItem, CarryoverSection, DashboardView, DesignDocBrowser
- Project cards display status dots (green active, amber hollow stale with pulse, purple ideating), GSD phase summary, git branch + uncommitted count, last activity timestamp
- Carryover section is collapsible with staleness badges (Recent/Aging/Stale) color-coded per UI spec
- Rewired AppView type from 4 views to 6: projects, pr-reviews, trends, repos, design-docs, session
- Dashboard is now the landing page (default view = 'projects')
- Existing v1.0 PR pipeline preserved as 'pr-reviews' view in sidebar
- Sidebar reorganized: Dashboard > Sessions > Trends/Repos/Design Docs > PR Reviews

## Task Commits

Each task was committed atomically:

1. **Task 1: Mount API routes, create hooks, build dashboard components** - `d03ee72` (feat)
2. **Task 2: Rewire app shell with dashboard as landing page** - `daa0e05` (feat)

## Files Created/Modified
- `packages/api/src/index.ts` - Mount design-docs, worklog, infra routes
- `packages/web/src/api/client.ts` - Add query keys for projects, infra, worklog, designDocs
- `packages/web/src/hooks/useProjects.ts` - React Query hook for /api/projects
- `packages/web/src/hooks/useDashboard.ts` - React Query hooks for carryover, infra, design docs
- `packages/web/src/components/dashboard/StatusDot.tsx` - 4px colored circle for status
- `packages/web/src/components/dashboard/ProjectCard.tsx` - Project card with status dot, phase, git info
- `packages/web/src/components/dashboard/ProjectGrid.tsx` - CSS grid with sorting and empty/loading/error states
- `packages/web/src/components/dashboard/ServiceStatus.tsx` - Service health card
- `packages/web/src/components/dashboard/InfraPanel.tsx` - Mac Mini infrastructure panel
- `packages/web/src/components/dashboard/CarryoverItem.tsx` - Single carryover item with staleness badge
- `packages/web/src/components/dashboard/CarryoverSection.tsx` - Collapsible carryover list
- `packages/web/src/components/dashboard/DashboardView.tsx` - Top-level dashboard composition
- `packages/web/src/components/dashboard/DesignDocBrowser.tsx` - Design doc list with text-only rendering
- `packages/web/src/components/layout/Sidebar.tsx` - Updated with 6 nav items and NavButton helper
- `packages/web/src/App.tsx` - Rewired with switch-based routing, dashboard as default

## Decisions Made
- Dashboard is the default landing page via `useState<AppView>('projects')` replacing the old 'dashboard' view name
- Existing v1.0 PR pipeline view is preserved under 'pr-reviews' nav item per PREV-01 requirement
- DesignDocBrowser uses text content rendering (`.slice(0, 200)`) rather than HTML rendering per T-14-10 threat mitigation
- Project card click navigates to session view via handleNewSession since direct session-project linking is Phase 12 scope

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dashboard frontend complete with all components rendering API data
- All 6 navigation views operational with proper routing
- Plan 04 (Cmd+K palette, polish, interactions) can build on this foundation
- 286 tests passing, TypeScript compiles cleanly

---
*Phase: 14-dashboard-project-state*
*Completed: 2026-04-08*

## Self-Check: PASSED

All 11 created files verified on disk. Both commit hashes (d03ee72, daa0e05) verified in git log.
