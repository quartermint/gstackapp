---
phase: 17-auto-discovery-engine-local
plan: 02
subsystem: api
tags: [hono, zod, discovery, routes, rest-api]

# Dependency graph
requires:
  - phase: 17-auto-discovery-engine-local/01
    provides: "Discovery DB queries, scanner service (scanForDiscoveries, promoteDiscovery, dismissDiscovery)"
  - phase: 16-shared-schemas-and-migrations
    provides: "Zod schemas (listDiscoveriesQuerySchema, updateDiscoveryStatusSchema), discovery DB migration"
provides:
  - "GET /api/discoveries endpoint with status/host filtering"
  - "PATCH /api/discoveries/:id for promote and dismiss workflows"
  - "POST /api/discoveries/scan for manual scan trigger"
  - "Discovery routes registered in Hono RPC type chain"
affects: [17-auto-discovery-engine-local/03, dashboard-discovery-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: ["async 202 response for scan trigger", "Date-to-ISO serialization in route handler"]

key-files:
  created:
    - packages/api/src/routes/discoveries.ts
  modified:
    - packages/api/src/app.ts

key-decisions:
  - "Timestamps serialized to ISO strings in route handler (Drizzle returns Date objects from timestamp mode)"
  - "Promote error (already tracked/dismissed) returns 400 VALIDATION_ERROR, not 409 Conflict"

patterns-established:
  - "Discovery route factory: createDiscoveryRoutes(getInstance, getConfig) matches existing pattern"

requirements-completed: [DISC-01, DISC-03, DISC-04, DISC-10]

# Metrics
duration: 3min
completed: 2026-03-16
---

# Phase 17 Plan 02: Discovery API Routes Summary

**Discovery API routes exposing list, promote/dismiss, and manual scan via Hono with Zod-validated inputs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T20:52:41Z
- **Completed:** 2026-03-16T20:55:21Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created discovery route handlers with GET (list), PATCH (status update), and POST (manual scan) endpoints
- All inputs validated via Zod schemas from @mission-control/shared
- Routes registered in app.ts Hono chain preserving RPC type safety for AppType

## Task Commits

Each task was committed atomically:

1. **Task 1: Create discovery route handlers** - `96a0d0a` (feat)
2. **Task 2: Register discovery routes in app.ts** - `63aac06` (feat)

## Files Created/Modified
- `packages/api/src/routes/discoveries.ts` - Discovery API route handlers (GET list, PATCH status, POST scan)
- `packages/api/src/app.ts` - Added import and route registration for discovery routes

## Decisions Made
- Timestamps serialized to ISO strings in the route handler since Drizzle returns Date objects from integer timestamp columns
- Promote/dismiss errors for already-processed discoveries return 400 VALIDATION_ERROR (not 409) to match the existing error pattern
- POST /discoveries/scan runs async and returns 202, matching POST /projects/refresh pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discovery API routes are live and ready for the dashboard UI (Plan 03)
- All three endpoints (list, status update, scan trigger) operational
- Hono RPC type chain includes discovery routes for typed client usage

## Self-Check: PASSED

- FOUND: packages/api/src/routes/discoveries.ts
- FOUND: 17-02-SUMMARY.md
- FOUND: 96a0d0a (Task 1)
- FOUND: 63aac06 (Task 2)

---
*Phase: 17-auto-discovery-engine-local*
*Completed: 2026-03-16*
