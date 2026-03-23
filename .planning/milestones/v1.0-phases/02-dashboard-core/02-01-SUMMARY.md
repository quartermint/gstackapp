---
phase: 02-dashboard-core
plan: 01
subsystem: ui, api
tags: [tailwind-v4, react-hooks, intl-relativeTimeFormat, iso-8601, dark-mode, vitest, jsdom, testing-library]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "Hono API with project scanner, TTL cache, project routes, web scaffold"
provides:
  - "ISO timestamps (lastCommitDate) on project list and detail API endpoints"
  - "Tailwind v4 warm theme with @theme tokens and @custom-variant dark"
  - "FOUC prevention script for dark mode persistence"
  - "Web test infrastructure (Vitest + jsdom + testing-library)"
  - "formatRelativeTime utility using Intl.RelativeTimeFormat"
  - "groupProjectsByActivity utility with 7/30 day thresholds"
  - "useTheme hook with localStorage persistence"
  - "useProjects hook with activity grouping via useMemo"
  - "useProjectDetail hook with AbortController cancellation and in-memory cache"
affects: [02-02-PLAN, dashboard-components, capture-pipeline]

# Tech tracking
tech-stack:
  added: ["@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event", "jsdom", "vitest (web package)"]
  patterns: ["Tailwind v4 CSS-native @theme (no config file)", "Intl.RelativeTimeFormat for time formatting", "useMemo for derived state (not useEffect+setState)", "AbortController for fetch cancellation", "FOUC prevention via inline script"]

key-files:
  created:
    - packages/web/vitest.config.ts
    - packages/web/src/lib/time.ts
    - packages/web/src/lib/grouping.ts
    - packages/web/src/hooks/use-theme.ts
    - packages/web/src/hooks/use-projects.ts
    - packages/web/src/hooks/use-project-detail.ts
    - packages/web/src/__tests__/lib/time.test.ts
    - packages/web/src/__tests__/lib/grouping.test.ts
    - packages/web/src/__tests__/hooks/use-theme.test.ts
  modified:
    - packages/api/src/services/project-scanner.ts
    - packages/api/src/routes/projects.ts
    - packages/api/src/__tests__/services/project-scanner.test.ts
    - packages/api/src/__tests__/routes/projects.test.ts
    - packages/shared/src/schemas/project.ts
    - packages/web/src/app.css
    - packages/web/index.html
    - packages/web/package.json
    - vitest.config.ts
    - pnpm-lock.yaml

key-decisions:
  - "Tailwind v4 CSS-native @theme with @custom-variant dark -- no tailwind.config.js file (v3 pattern)"
  - "FOUC prevention via inline script reading mc-theme from localStorage before CSS loads"
  - "Lightweight TypeScript interfaces in web package for API response shapes -- no runtime import from @mission-control/shared"
  - "useMemo for grouped projects derived from raw list state (avoids useEffect+setState anti-pattern)"
  - "AbortController for fetch cancellation in useProjectDetail on slug change"
  - "In-memory Map cache for recently viewed project details"

patterns-established:
  - "Web test pattern: Vitest + jsdom + @testing-library/react with forks pool"
  - "Theme toggle pattern: useTheme hook + .dark class on documentElement + localStorage persistence"
  - "Activity grouping: Active (<=7d), Idle (7-30d), Stale (30d+) based on lastCommitDate ISO string"
  - "API timestamp contract: lastCommitDate (ISO 8601) for machine use, lastCommitTime (relative string) for display fallback"

requirements-completed: [DASH-01, DASH-11]

# Metrics
duration: 6min
completed: 2026-03-09
---

# Phase 2 Plan 01: Dashboard Data Foundations Summary

**ISO timestamps on project API, Tailwind v4 warm theme with dark mode, web test infrastructure, and React hooks for grouping/formatting/fetching**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T16:18:01Z
- **Completed:** 2026-03-09T16:24:32Z
- **Tasks:** 3
- **Files modified:** 19 (9 created, 10 modified)

## Accomplishments
- API now returns ISO 8601 `lastCommitDate` on project list and `date` on individual commits in detail, enabling client-side time-based grouping
- Tailwind v4 warm theme established with all locked color tokens (terracotta, amber-warm, sage, gold-status, rust) and dark mode surfaces
- Web test infrastructure operational: Vitest + jsdom + testing-library, 18 tests passing
- Complete data layer for dashboard: formatRelativeTime, groupProjectsByActivity, useTheme, useProjects, useProjectDetail

## Task Commits

Each task was committed atomically:

1. **Task 1: Add ISO timestamps to scanner and project API** - `15a2f56` (feat) + TDD: RED->GREEN in same commit
2. **Task 2: Tailwind v4 warm theme, FOUC prevention, web test infra** - `4769a64` (feat)
3. **Task 3: Utility functions and React hooks** - `ac3a0f6` (test: RED) + `8b06dfd` (feat: GREEN)

## Files Created/Modified

**Created:**
- `packages/web/vitest.config.ts` - Vitest config with jsdom environment for React component tests
- `packages/web/src/lib/time.ts` - formatRelativeTime using Intl.RelativeTimeFormat
- `packages/web/src/lib/grouping.ts` - groupProjectsByActivity with 7/30 day thresholds and ProjectItem type
- `packages/web/src/hooks/use-theme.ts` - Dark/light toggle with localStorage persistence
- `packages/web/src/hooks/use-projects.ts` - Fetch + group projects via useMemo
- `packages/web/src/hooks/use-project-detail.ts` - Fetch detail with AbortController cancellation and cache
- `packages/web/src/__tests__/lib/time.test.ts` - 6 tests for relative time formatting
- `packages/web/src/__tests__/lib/grouping.test.ts` - 7 tests for activity grouping
- `packages/web/src/__tests__/hooks/use-theme.test.ts` - 5 tests for theme hook

**Modified:**
- `packages/api/src/services/project-scanner.ts` - Added `date` field to GitCommit, `%aI` to git log format, `lastCommitDate` to getProjectWithScanData
- `packages/api/src/routes/projects.ts` - Added `lastCommitDate` to list endpoint merge logic
- `packages/shared/src/schemas/project.ts` - Added `lastCommitDate` to projectSchema
- `packages/web/src/app.css` - Replaced with Tailwind v4 @theme warm color system
- `packages/web/index.html` - Added FOUC prevention inline script
- `packages/web/package.json` - Added test script and testing dependencies
- `vitest.config.ts` - Added web package to root projects list
- `pnpm-lock.yaml` - Updated with new dependencies

## Decisions Made
- **Tailwind v4 CSS-native config:** Used `@theme` and `@custom-variant dark` instead of JavaScript config file (v3 pattern). This is the correct Tailwind v4 approach.
- **Lightweight frontend types:** Defined `ProjectItem` interface locally in `grouping.ts` rather than importing from `@mission-control/shared` at runtime. Shared schemas are for API boundary validation only.
- **useMemo for derived grouping:** useProjects stores raw project list in state, derives GroupedProjects via useMemo -- avoids the useEffect+setState derived state anti-pattern flagged in research.
- **In-memory cache for project detail:** Simple Map cache in useProjectDetail avoids refetching when switching back to recently viewed projects. No TTL needed for single-user.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data foundations ready for Plan 02 (visible dashboard components)
- API returns lastCommitDate enabling client-side grouping into Active/Idle/Stale
- Theme system ready for component styling (bg-surface, text-terracotta, dark:bg-surface-dark, etc.)
- Hooks ready: useProjects provides grouped data, useProjectDetail provides hero card data, useTheme provides toggle
- Web test infrastructure ready for component tests in Plan 02
- 61 total tests passing (43 API + 18 web), all type checks clean

## Self-Check: PASSED

All 10 created files verified on disk. All 4 task commits (15a2f56, 4769a64, ac3a0f6, 8b06dfd) verified in git log.

---
*Phase: 02-dashboard-core*
*Completed: 2026-03-09*
