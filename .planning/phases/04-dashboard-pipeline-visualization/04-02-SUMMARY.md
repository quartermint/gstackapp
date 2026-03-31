---
phase: 04-dashboard-pipeline-visualization
plan: 02
subsystem: ui
tags: [react, vite, tailwind, hono-rpc, sse, tanstack-query, design-system]

# Dependency graph
requires:
  - phase: 04-01
    provides: API routes with chained AppType export, SSE endpoint, pipeline/repo REST endpoints
provides:
  - React SPA scaffold at localhost:5173 with Vite 8 + Tailwind v4
  - Complete DESIGN.md token mapping as Tailwind @theme variables
  - Hono RPC client with AppType inference from API
  - SSE-to-TanStack-Query bridge for real-time cache invalidation
  - App shell layout (220px sidebar + main + 40px bottom strip)
  - Shared UI components (VerdictBadge, StageDot, Skeleton, EmptyState)
  - Query key factory for pipelines and repos
affects: [04-03, 04-04, 05-cross-repo-intelligence]

# Tech tracking
tech-stack:
  added: [react@19, vite@8, tailwindcss@4, @tanstack/react-query@5, hono/client, recharts@2, clsx, tailwind-merge, date-fns]
  patterns: [hono-rpc-type-inference, sse-query-invalidation, tailwind-v4-theme-tokens, cn-utility, query-key-factory]

key-files:
  created:
    - packages/web/vite.config.ts
    - packages/web/index.html
    - packages/web/src/app.css
    - packages/web/src/main.tsx
    - packages/web/src/App.tsx
    - packages/web/src/api/client.ts
    - packages/web/src/hooks/useSSE.ts
    - packages/web/src/hooks/useSSEQuerySync.ts
    - packages/web/src/components/layout/Shell.tsx
    - packages/web/src/components/layout/Sidebar.tsx
    - packages/web/src/components/layout/BottomStrip.tsx
    - packages/web/src/components/shared/VerdictBadge.tsx
    - packages/web/src/components/shared/StageDot.tsx
    - packages/web/src/components/shared/Skeleton.tsx
    - packages/web/src/components/shared/EmptyState.tsx
    - packages/web/src/lib/cn.ts
    - packages/web/src/lib/constants.ts
    - packages/web/src/types/sse.ts
  modified:
    - packages/web/package.json
    - packages/web/tsconfig.json
    - packages/api/package.json
    - package.json

key-decisions:
  - "Added main field to @gstackapp/api package.json for monorepo type resolution of AppType import"
  - "Tailwind v4 @theme block maps all DESIGN.md tokens directly — no postcss.config needed"
  - "SSE uses scoped TanStack Query invalidation (per-pipeline-detail, not broad invalidateQueries)"

patterns-established:
  - "cn() utility: clsx + tailwind-merge for conditional class composition"
  - "Query key factory: queryKeys.pipelines.all/list/detail pattern for cache scoping"
  - "SSE bridge pattern: useSSE generic hook + useSSEQuerySync domain-specific hook"
  - "Font loading: General Sans + Geist + JetBrains Mono via CDN preconnects in index.html"

requirements-completed: [DASH-08, DASH-09, DASH-10]

# Metrics
duration: 6min
completed: 2026-03-31
---

# Phase 04 Plan 02: Frontend Scaffold Summary

**React SPA with Vite 8, complete DESIGN.md Tailwind theme, Hono RPC client with AppType inference, and SSE-to-TanStack-Query cache bridge**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T03:38:12Z
- **Completed:** 2026-03-31T03:44:12Z
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments
- Complete frontend scaffold: Vite 8, React 19, Tailwind v4 with all DESIGN.md design tokens mapped to @theme CSS variables
- Hono RPC client with full AppType inference from the API package, plus TanStack Query key factory
- SSE event bridge that listens for 5 pipeline event types and performs scoped query cache invalidation
- App shell layout with 220px sidebar (gstackapp branding in electric lime), main content area, and 40px bottom intelligence strip
- 4 shared UI components ready for pipeline/feed views: VerdictBadge, StageDot, Skeleton, EmptyState

## Task Commits

Each task was committed atomically:

1. **Task 1: Vite + React + Tailwind scaffold with DESIGN.md theme** - `e1d2ce8` (feat)
2. **Task 2: Hono RPC client, SSE hooks, app shell, shared components** - `eeee18d` (feat)

## Files Created/Modified
- `packages/web/vite.config.ts` - Vite 8 config with React plugin, Tailwind CSS plugin, /api proxy to port 3000
- `packages/web/index.html` - HTML entry with font CDN preconnects (General Sans, Geist, JetBrains Mono)
- `packages/web/src/app.css` - Tailwind v4 @theme with all DESIGN.md color tokens, fonts, radii, keyframe animations
- `packages/web/src/main.tsx` - React 19 entry with QueryClientProvider (30s staleTime) and ReactQueryDevtools
- `packages/web/src/App.tsx` - Root component: establishes SSE connection, renders Shell
- `packages/web/src/api/client.ts` - Hono RPC client (hc<AppType>) and query key factory
- `packages/web/src/hooks/useSSE.ts` - Generic SSE hook with EventSource auto-reconnection
- `packages/web/src/hooks/useSSEQuerySync.ts` - SSE-to-TanStack-Query bridge for scoped cache invalidation
- `packages/web/src/components/layout/Shell.tsx` - CSS Grid app shell (sidebar + main + bottom strip)
- `packages/web/src/components/layout/Sidebar.tsx` - 220px sidebar with branding and navigation
- `packages/web/src/components/layout/BottomStrip.tsx` - 40px intelligence strip placeholder
- `packages/web/src/components/shared/VerdictBadge.tsx` - Colored pill badge for PASS/FLAG/BLOCK/SKIP/RUNNING
- `packages/web/src/components/shared/StageDot.tsx` - Stage identity color dots (CEO/Eng/Design/QA/Security)
- `packages/web/src/components/shared/Skeleton.tsx` - Loading skeleton with text and circle variants
- `packages/web/src/components/shared/EmptyState.tsx` - Empty state for no-data views
- `packages/web/src/lib/cn.ts` - clsx + tailwind-merge utility
- `packages/web/src/lib/constants.ts` - Runtime stage/verdict/severity color and label maps
- `packages/web/src/types/sse.ts` - SSE event type definitions
- `packages/web/package.json` - Added scripts (dev, build, preview) and all dependencies
- `packages/web/tsconfig.json` - Added jsx: react-jsx, project references to shared + api
- `packages/api/package.json` - Added main field for monorepo type resolution
- `package.json` - Added dev:web and dev:all workspace scripts

## Decisions Made
- Added `"main": "src/index.ts"` to @gstackapp/api package.json to enable `import type { AppType } from '@gstackapp/api'` resolution in the monorepo. Without this, TypeScript bundler resolution couldn't find the module entry point.
- Used Tailwind v4 Vite plugin directly (no PostCSS config file needed) -- @tailwindcss/vite handles everything.
- SSE hook uses scoped invalidation: pipeline-level events invalidate `queryKeys.pipelines.all`, stage-level events invalidate the specific detail and list queries. Avoids unnecessary re-fetches per D-07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added main field to API package.json**
- **Found during:** Task 2 (Hono RPC client creation)
- **Issue:** `import type { AppType } from '@gstackapp/api'` failed because API package.json had no `main` field, so TypeScript bundler resolution couldn't find the entry point
- **Fix:** Added `"main": "src/index.ts"` to packages/api/package.json
- **Files modified:** packages/api/package.json
- **Verification:** `npx tsc --noEmit --project packages/web/tsconfig.json` passes
- **Committed in:** eeee18d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for Hono RPC type inference to work. No scope creep.

## Issues Encountered
- TypeScript composite project references required `tsc --build` on shared and API packages before web could type-check. This is expected behavior for composite projects -- declarations must exist for cross-package type resolution.

## Known Stubs
- `App.tsx` renders "Pipeline visualization coming soon" -- intentional placeholder, replaced by Plan 04-03 (pipeline view)
- `Sidebar.tsx` navigation items are hardcoded links -- will be wired to routing in future plans
- `BottomStrip.tsx` shows "cross-repo insights coming in Phase 5" -- intentional, Phase 5 scope

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Frontend scaffold complete, ready for Plan 04-03 (pipeline visualization hero view) and Plan 04-04 (PR feed)
- All DESIGN.md tokens available as Tailwind utilities (bg-background, text-accent, font-display, etc.)
- SSE bridge active -- will start invalidating queries as soon as pipeline views use the query key factory
- Hono RPC client ready for type-safe API calls from any component

## Self-Check: PASSED

- All 18 created files verified present on disk
- Both task commits verified in git log (e1d2ce8, eeee18d)

---
*Phase: 04-dashboard-pipeline-visualization*
*Completed: 2026-03-31*
