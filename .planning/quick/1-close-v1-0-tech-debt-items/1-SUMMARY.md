---
phase: quick
plan: 1
subsystem: api, ui
tags: [hono-rpc, tech-debt, fetch-migration, dead-code-removal]

# Dependency graph
requires:
  - phase: 05-dashboard-enrichments-real-time
    provides: All v1.0 features complete; tech debt items identified in milestone audit
provides:
  - Typed Hono RPC client calls in all 7 frontend hooks (zero plain fetch)
  - Dead searchCaptures code removed from search.ts
  - CAPT-08 archive behavior documented in captures route
  - GEMINI_API_KEY naming standardized with env var mapping comment
  - Triage modal animation intentionality documented
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hono RPC client (hc<AppType>) for all frontend API calls -- typed responses"
    - "Route chaining in app.ts to preserve type graph for RPC client"
    - "Explicit type annotation on hc client to avoid TS2742 deep type reference errors"

key-files:
  created: []
  modified:
    - packages/web/src/hooks/use-projects.ts
    - packages/web/src/hooks/use-project-detail.ts
    - packages/web/src/hooks/use-captures.ts
    - packages/web/src/hooks/use-capture-submit.ts
    - packages/web/src/hooks/use-search.ts
    - packages/web/src/hooks/use-heatmap.ts
    - packages/web/src/hooks/use-health.ts
    - packages/api/src/app.ts
    - packages/web/src/api/client.ts
    - packages/api/src/db/queries/search.ts
    - packages/api/src/routes/captures.ts
    - packages/api/src/index.ts
    - packages/web/src/app.css

key-decisions:
  - "Route chaining in app.ts (not imperative app.route()) to preserve Hono type graph for RPC client"
  - "Explicit Client type annotation on hc<AppType> to avoid TS2742 cross-package type reference errors"
  - "Middleware applied after route chaining to keep route types intact"

patterns-established:
  - "All new hooks must use client.api.* from ../api/client.js -- no plain fetch()"
  - "app.ts routes must be chained (not imperative) to maintain RPC type safety"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-10
---

# Quick Task 1: Close v1.0 Tech Debt Items Summary

**Migrated all 7 hooks to typed Hono RPC client and closed 4 surgical tech debt items from milestone audit**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T14:42:30Z
- **Completed:** 2026-03-10T14:48:09Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- All 7 frontend hooks now use typed Hono RPC client instead of plain fetch()
- Deprecated searchCaptures function and SearchResult interface removed (dead code)
- CAPT-08 archive behavior documented with clear intent comment
- GEMINI_API_KEY env var mapping documented at startup
- Triage modal CSS animation intentionality documented

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate all hooks from plain fetch() to Hono RPC client** - `f4f339c` (refactor)
2. **Task 2: Close 4 surgical tech debt items** - `dcc2050` (chore)

## Files Created/Modified
- `packages/web/src/hooks/use-projects.ts` - Replaced fetch() with client.api.projects.$get()
- `packages/web/src/hooks/use-project-detail.ts` - Replaced fetch() with client.api.projects[":slug"].$get()
- `packages/web/src/hooks/use-captures.ts` - Replaced fetch() in 6 hooks with client.api.captures.*
- `packages/web/src/hooks/use-capture-submit.ts` - Replaced fetch() POST with client.api.captures.$post()
- `packages/web/src/hooks/use-search.ts` - Replaced fetch() with client.api.search.$get()
- `packages/web/src/hooks/use-heatmap.ts` - Replaced fetch() with client.api.heatmap.$get()
- `packages/web/src/hooks/use-health.ts` - Replaced fetch() with client.api.health.system.$get()
- `packages/api/src/app.ts` - Chained route registration for RPC type preservation
- `packages/web/src/api/client.ts` - Added explicit Client type annotation
- `packages/api/src/db/queries/search.ts` - Removed deprecated searchCaptures + SearchResult
- `packages/api/src/routes/captures.ts` - Added CAPT-08 archive behavior comment
- `packages/api/src/index.ts` - Added GEMINI_API_KEY mapping comment, updated warning message
- `packages/web/src/app.css` - Added triage animation intentionality comment

## Decisions Made
- Used method chaining for route registration in app.ts instead of imperative `app.route()` calls. This is required for Hono's type system to propagate route types through to the RPC client (`hc<AppType>`). Without chaining, AppType resolves to plain `Hono` and the client becomes `unknown`.
- Added explicit `type Client = ReturnType<typeof hc<AppType>>` annotation to avoid TS2742 error where TypeScript cannot name the inferred type without referencing internal API modules.
- Moved middleware application after route chaining to keep route types intact (middleware doesn't affect the RPC type graph).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Hono RPC type inference (app.ts route chaining)**
- **Found during:** Task 1 (Hook migration)
- **Issue:** `AppType = typeof app` was `Hono` (no route types) because `createApp()` used imperative `app.route()` calls. Hono RPC client produced `unknown` client.
- **Fix:** Refactored to method chaining pattern (`new Hono().route().route()...`) so TypeScript preserves the full route type graph. Also added explicit type annotation to client.ts.
- **Files modified:** packages/api/src/app.ts, packages/web/src/api/client.ts
- **Verification:** `pnpm typecheck` passes clean, all 135 tests pass
- **Committed in:** f4f339c (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for RPC client to function. No scope creep -- purely enabling the planned migration.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 tech debt items from v1.0 milestone audit are closed
- Zero tech debt remaining from v1.0
- Codebase ready for v2 feature development

---
*Quick Task: 1-close-v1-0-tech-debt-items*
*Completed: 2026-03-10*
