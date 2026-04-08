---
phase: 14-dashboard-project-state
plan: 02
subsystem: api
tags: [hono, zod, ssh, filesystem, markdown-parsing, worklog, design-docs, infra-health]

# Dependency graph
requires:
  - phase: 14-dashboard-project-state
    provides: "Plan 01 established project scanning pattern and shared schemas"
provides:
  - "GET /api/design-docs endpoint scanning ~/.gstack/projects/ for design documents"
  - "GET /api/worklog/carryover endpoint parsing worklog.md with staleness classification"
  - "GET /api/infra/status endpoint querying Mac Mini health via SSH with timeout"
  - "Shared Zod schemas: designDocSchema, carryoverItemSchema, serviceHealthSchema, infraStatusSchema"
affects: [14-03-PLAN, 14-04-PLAN, dashboard-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns: [filesystem-backed-api-route, ssh-with-timeout, markdown-regex-parsing, graceful-degradation]

key-files:
  created:
    - packages/shared/src/schemas/dashboard.ts
    - packages/api/src/routes/design-docs.ts
    - packages/api/src/routes/worklog.ts
    - packages/api/src/routes/infra.ts
    - packages/api/src/__tests__/design-docs-route.test.ts
    - packages/api/src/__tests__/worklog-route.test.ts
    - packages/api/src/__tests__/infra-route.test.ts
  modified:
    - packages/shared/src/index.ts

key-decisions:
  - "Exported parseWorklogCarryover and computeStaleness as named exports for direct unit testing"
  - "SSH uses execFile (not exec) with BatchMode=yes for non-interactive operation"
  - "Design doc project names extracted by stripping org prefix from directory name"

patterns-established:
  - "Filesystem-backed API route: read on every request, no caching, graceful empty-state"
  - "SSH health query: 3s connect timeout + 5s overall, never throw, return degraded state"
  - "Markdown regex parsing: session header pattern + section extraction for worklog"

requirements-completed: [DASH-03, DASH-04, DASH-05]

# Metrics
duration: 4min
completed: 2026-04-08
---

# Phase 14 Plan 02: Supporting Dashboard APIs Summary

**Three filesystem/SSH API endpoints for design doc browsing, worklog carryover parsing, and Mac Mini infrastructure health with 21 unit tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T15:16:23Z
- **Completed:** 2026-04-08T15:20:05Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Design docs endpoint scans ~/.gstack/projects/ for markdown documents, strips org prefix, sorts by modification time
- Worklog endpoint parses carryover sections from worklog.md with staleness classification (recent/aging/stale)
- Infra endpoint queries Mac Mini via SSH with 3-second connect timeout, returns service health for known services
- All endpoints gracefully handle missing data sources (empty arrays, reachable=false)
- 21 new unit tests covering all routes, parsing logic, staleness computation, and error handling

## Task Commits

Each task was committed atomically:

1. **Task 1: Design docs and worklog API routes with shared schemas** - `c4055cb` (feat)
2. **Task 2: Infrastructure status API route** - `389d684` (feat)

## Files Created/Modified
- `packages/shared/src/schemas/dashboard.ts` - Zod schemas for DesignDoc, CarryoverItem, ServiceHealth, InfraStatus
- `packages/shared/src/index.ts` - Added dashboard schema re-export
- `packages/api/src/routes/design-docs.ts` - GET / scans ~/.gstack/projects/ for design documents
- `packages/api/src/routes/worklog.ts` - GET /carryover parses worklog.md carryover sections
- `packages/api/src/routes/infra.ts` - GET /status queries Mac Mini health via SSH
- `packages/api/src/__tests__/design-docs-route.test.ts` - 4 tests for design docs endpoint
- `packages/api/src/__tests__/worklog-route.test.ts` - 10 tests for worklog parsing and endpoint
- `packages/api/src/__tests__/infra-route.test.ts` - 7 tests for infra status and SSH handling

## Decisions Made
- Exported `parseWorklogCarryover` and `computeStaleness` as named exports for direct unit testing without needing HTTP route tests
- Used `execFile` (not `exec`) for SSH commands with `BatchMode=yes` to prevent interactive prompts
- Design doc project names strip org prefix from directory name (e.g., `quartermint-gstackapp` -> `gstackapp`)
- Routes are NOT mounted in index.ts yet -- Plan 03 (Wave 2) will mount all new routes together

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Three API routes ready, exported as default Hono apps
- Plan 03 will mount these routes in index.ts alongside the projects route from Plan 01
- All shared schemas available via @gstackapp/shared for frontend consumption in Plan 04

---
*Phase: 14-dashboard-project-state*
*Completed: 2026-04-08*
