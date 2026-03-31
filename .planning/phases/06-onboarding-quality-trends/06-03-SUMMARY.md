---
phase: 06-onboarding-quality-trends
plan: 03
subsystem: web
tags: [react, recharts, tanstack-query, charts, trends, dashboard]

# Dependency graph
requires:
  - phase: 06-onboarding-quality-trends
    plan: 01
    provides: trend API endpoints (scores, verdicts, findings), repos endpoint
provides:
  - quality trend chart components (QualityScoreChart, VerdictRateChart, FindingTrendChart)
  - TrendsView container with repo selector
  - sidebar navigation between Dashboard and Trends views
  - trend data hooks (useQualityScores, useVerdictRates, useFindingTrends, useRepos)
affects:
  - packages/web/src/App.tsx (view routing)
  - packages/web/src/components/layout/Sidebar.tsx (navigation)
  - packages/web/src/components/layout/Shell.tsx (navigation props)
  - packages/web/src/api/client.ts (query keys)

# Tech stack
added: []
patterns:
  - shared chart theme constant (chartTheme.ts) for Recharts dark theme tokens
  - per-stage verdict chart wrapper with own data hook for lazy loading
  - view routing via state (no react-router for 2 views)
  - Shell/Sidebar prop threading for navigation state

# Key files
created:
  - packages/web/src/components/trends/QualityScoreChart.tsx
  - packages/web/src/components/trends/VerdictRateChart.tsx
  - packages/web/src/components/trends/FindingTrendChart.tsx
  - packages/web/src/components/trends/TrendsView.tsx
  - packages/web/src/components/trends/RepoSelector.tsx
  - packages/web/src/components/trends/chartTheme.ts
  - packages/web/src/hooks/useTrends.ts
  - packages/web/src/hooks/useRepos.ts
modified:
  - packages/web/src/api/client.ts
  - packages/web/src/components/layout/Sidebar.tsx
  - packages/web/src/components/layout/Shell.tsx
  - packages/web/src/App.tsx

# Decisions
decisions:
  - Shared chartTheme.ts constant over inline hex values for DRY Recharts theming
  - Per-stage VerdictRateChart wrapper component with own hook for lazy data fetching
  - Buttons instead of anchors for sidebar nav (no URL routing, just state)

# Metrics
duration: 3min
completed: "2026-03-31T05:12:00Z"
tasks_completed: 3
tasks_total: 3
files_created: 8
files_modified: 4
---

# Phase 06 Plan 03: Quality Trend Charts Summary

Recharts-based quality trend visualizations with DESIGN.md dark theme, repo selector, and sidebar navigation for dashboard/trends view routing.

## What Was Built

### Task 1: Trend data hooks, repo selector, and three chart components

Created the foundational data layer and chart components:

- **useTrends.ts**: Three TanStack Query hooks (`useQualityScores`, `useVerdictRates`, `useFindingTrends`) fetching from Plan 01 API endpoints with 60s stale time
- **useRepos.ts**: Hook for fetching connected repository list
- **client.ts**: Extended queryKeys with `trends.scores`, `trends.verdicts`, `trends.findings` keys
- **QualityScoreChart**: Recharts LineChart with electric lime (#C6FF3B) line, 0-100 Y axis, h-[240px] explicit height, dark theme grid/tooltip
- **VerdictRateChart**: Stacked AreaChart with stackOffset="expand" for pass/flag/block normalized to 100%, stage spectral color accent on heading
- **FindingTrendChart**: Stacked AreaChart for critical/notable/minor severity counts
- **RepoSelector**: Dropdown styled with DESIGN.md tokens
- **chartTheme.ts**: Shared Recharts theme constants (grid, axis, tooltip, accent colors)

**Commit:** f97d13c

### Task 2: TrendsView container, sidebar navigation, and App.tsx routing

Wired the charts into the app:

- **TrendsView**: Full page container with Quality Score section (full width), Verdict Rates by Stage (2-column grid, 5 charts), Finding Frequency (full width). Auto-selects first repo. Empty state for no repos.
- **Sidebar**: Converted hardcoded links to buttons with `activeView`/`onNavigate` props. Dashboard and Trends nav items with active state styling (text-accent bg-accent-muted).
- **Shell**: Updated interface to accept and forward `activeView` and `onNavigate` props to Sidebar.
- **App.tsx**: Added view state ('dashboard' | 'trends'). Onboarding wizard takes priority, then routes to TrendsView or dashboard based on view state.

**Commit:** 0bc2246

### Task 3: Visual checkpoint (auto-approved)

Auto-approved in autonomous mode.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. All chart components are wired to real API endpoints from Plan 01. Data rendering is functional, not stubbed.

## Verification

- TypeScript compiles clean (`npx tsc --noEmit`)
- All 8 trend component files created
- Both hooks exist with correct exports
- Sidebar contains "Trends" navigation
- App.tsx routes between dashboard and trends views
- Charts use DESIGN.md colors via shared chartTheme constant
- Empty states shown for insufficient data (< 2 data points)
- Explicit parent heights prevent ResponsiveContainer collapse

## Self-Check: PASSED

All 12 files verified present. Both commit hashes (f97d13c, 0bc2246) confirmed in git log.
