---
phase: 20-ryan-power-dashboard
plan: 01
subsystem: web/api
tags: [dashboard, navigation, health-score, project-overview]
dependency_graph:
  requires: []
  provides: [ProjectOverview, HealthBadge, ProjectDetailDrawer, computeHealthScore, extended-navigation]
  affects: [Sidebar, Shell, App, projects-api, shared-schemas]
tech_stack:
  added: []
  patterns: [admin-gated-nav, health-score-computation, slide-in-drawer]
key_files:
  created:
    - packages/web/src/components/power/ProjectOverview.tsx
    - packages/web/src/components/power/HealthBadge.tsx
    - packages/web/src/components/power/ProjectDetailDrawer.tsx
  modified:
    - packages/web/src/components/layout/Sidebar.tsx
    - packages/web/src/components/layout/Shell.tsx
    - packages/web/src/App.tsx
    - packages/web/src/api/client.ts
    - packages/api/src/routes/projects.ts
    - packages/shared/src/schemas/projects.ts
decisions:
  - "Dashboard default view changed from PipelineHero to ProjectOverview for admin users"
  - "Pipeline view moved to 'repos' case in switch"
  - "Health score base 20 points for tracked projects, pipeline rate replaced with base points"
metrics:
  duration: 255s
  completed: "2026-04-12T01:16:21Z"
  tasks: 2
  files_created: 3
  files_modified: 6
---

# Phase 20 Plan 01: Multi-Project Overview and Navigation Summary

Multi-project overview with health scores, admin-only power navigation, and detail drawer for project inspection.

## What Was Built

### Task 1: Extended Navigation, Types, and Health Score API
- Extended `AppView` union type with `topology`, `knowledge`, `intelligence`
- Added `role` prop to Sidebar and Shell, gating Power nav section behind `role === 'admin'`
- Implemented `computeHealthScore()` server-side: 40pts recency + 20pts clean tree + 20pts GSD progress + 20pts base
- Extended `ProjectState` schema with optional `healthScore` field
- Added `projects` query keys to `client.ts`
- Changed admin default dashboard view to render `ProjectOverview`
- Added placeholder views for topology/knowledge/intelligence

### Task 2: ProjectOverview, HealthBadge, ProjectDetailDrawer
- `HealthBadge`: color-coded pill badge (green >= 80, amber >= 50, red < 50) using DESIGN.md status colors
- `ProjectOverview`: card grid with health summary bar (healthy/attention/critical counts), responsive 1/2/3 column layout, loading skeletons, empty state
- `ProjectDetailDrawer`: right-side slide-in (480px) with overlay backdrop blur, showing project name + health, git status, GSD progress bar, recent pipeline runs with stage verdict badges
- Escape key and overlay click close the drawer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pipeline view relocated to 'repos' case**
- **Found during:** Task 1
- **Issue:** Changing the default switch case from PipelineHero to ProjectOverview would have lost the pipeline view entirely
- **Fix:** Moved PipelineHero + PRFeed + PRDetail rendering to `case 'repos'` so it remains accessible via Repositories nav
- **Files modified:** packages/web/src/App.tsx
- **Commit:** 3fb39d6

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3fb39d6 | feat(20-01): extend navigation, types, and health score API |
| 2 | 38008ff | feat(20-01): build ProjectOverview, HealthBadge, and ProjectDetailDrawer |

## Verification

- TypeScript compiles clean for both web and shared packages (no code errors)
- All acceptance criteria grep checks pass
- Admin-only nav items gated by `role === 'admin'` (T-20-01 mitigated)
- Health scores computed server-side from authoritative data (T-20-03 accepted)

## Self-Check: PASSED

All 9 files verified present. Both commits (3fb39d6, 38008ff) verified in git log.
