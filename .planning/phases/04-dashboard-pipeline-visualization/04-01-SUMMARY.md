---
phase: 04-dashboard-pipeline-visualization
plan: 01
subsystem: api
tags: [hono, sse, drizzle, event-bus, rpc, pipeline-api]

# Dependency graph
requires:
  - phase: 02-pipeline-engine
    provides: pipeline orchestrator, stage runner, DB schema (pipeline_runs, stage_results, findings)
  - phase: 03-review-output-signal-quality
    provides: feedback route pattern, comment renderer
provides:
  - Event bus singleton for real-time pipeline events
  - SSE streaming endpoint at /api/sse
  - Pipeline list and detail API routes at /api/pipelines
  - Repository list API route at /api/repos
  - AppType export for Hono RPC client type inference
  - Orchestrator event emission at all 5 lifecycle transitions
affects: [04-02-frontend-shell, 04-03-pipeline-detail, 04-04-quality-trends]

# Tech tracking
tech-stack:
  added: [node:events EventEmitter, hono/streaming streamSSE]
  patterns: [event bus singleton, SSE streaming with heartbeat, chained Hono route mounting for RPC types, mount-point-aware sub-app routing]

key-files:
  created:
    - packages/api/src/events/bus.ts
    - packages/api/src/routes/sse.ts
    - packages/api/src/routes/pipelines.ts
    - packages/api/src/routes/repos.ts
    - packages/api/src/__tests__/pipelines-route.test.ts
    - packages/api/src/__tests__/sse.test.ts
  modified:
    - packages/api/src/pipeline/orchestrator.ts
    - packages/api/src/index.ts
    - packages/api/src/routes/feedback.ts

key-decisions:
  - "Chained Hono route mounting for AppType RPC inference — method chaining required for type propagation"
  - "Mount-point-aware sub-app routing — routes use / and /:id instead of /pipelines and /pipelines/:id"
  - "EventEmitter singleton with 50-listener capacity for SSE fanout"
  - "15-second SSE heartbeat interval to keep connections alive"

patterns-established:
  - "Event bus pattern: pipelineBus.emit('pipeline:event', { type, runId, ... }) for all lifecycle events"
  - "SSE pattern: streamSSE with onAbort cleanup and heartbeat loop"
  - "API route pattern: sub-app Hono instances with root-relative paths, mounted via apiRoutes chain"

requirements-completed: [DASH-03, DASH-06, DASH-07]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 4 Plan 1: Backend API Routes and SSE Event Bus Summary

**Pipeline API routes with SSE real-time streaming, event bus for orchestrator lifecycle events, and AppType export for Hono RPC client**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T03:30:13Z
- **Completed:** 2026-03-31T03:34:36Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Event bus singleton with typed pipeline events for real-time SSE fanout to dashboard clients
- Pipeline list/detail API endpoints with full PR/repo/stage/finding joins for dashboard consumption
- Orchestrator now emits events at all 5 lifecycle points (started, stage running, stage completed, completed, failed)
- AppType export via chained route mounting enables end-to-end type-safe Hono RPC client on frontend

## Task Commits

Each task was committed atomically:

1. **Task 1: Event bus, SSE route, pipeline/repos API routes** - `e8afef6` (feat)
2. **Task 2: Orchestrator event emission, AppType export, and tests** - `e7fde01` (feat)

## Files Created/Modified
- `packages/api/src/events/bus.ts` - EventEmitter singleton for pipeline lifecycle events
- `packages/api/src/routes/sse.ts` - SSE streaming endpoint with 15s heartbeat and pipeline event delivery
- `packages/api/src/routes/pipelines.ts` - GET /pipelines (list) and GET /pipelines/:id (detail with findings)
- `packages/api/src/routes/repos.ts` - GET /repos returning active repositories
- `packages/api/src/pipeline/orchestrator.ts` - Added pipelineBus.emit at 5 lifecycle transitions
- `packages/api/src/index.ts` - Refactored to chained route mounting with AppType export
- `packages/api/src/routes/feedback.ts` - Updated route path for mount-point-aware routing
- `packages/api/src/__tests__/pipelines-route.test.ts` - 4 tests for pipeline list and detail endpoints
- `packages/api/src/__tests__/sse.test.ts` - 2 tests for SSE content-type and event delivery

## Decisions Made
- Used chained Hono route mounting (`.route().route()`) for AppType — method chaining is required for Hono's RPC type inference to propagate route types correctly
- Sub-app routes use root-relative paths (`/`, `/:id`) since the mount point prefix is handled by `apiRoutes.route('/pipelines', pipelinesApp)` — avoids double-prefixing
- EventEmitter with setMaxListeners(50) for concurrent SSE clients — simple, proven in-process fanout
- 15-second heartbeat interval chosen to keep SSE connections alive through typical proxy timeouts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed double-prefixed route paths in sub-apps**
- **Found during:** Task 2 (test execution)
- **Issue:** Sub-app routes used `/pipelines` and `/pipelines/:id` which became `/api/pipelines/pipelines` after mount-point routing
- **Fix:** Changed to `/` and `/:id` in pipelinesApp, reposApp, and feedbackApp since the prefix is handled by apiRoutes.route()
- **Files modified:** packages/api/src/routes/pipelines.ts, packages/api/src/routes/repos.ts, packages/api/src/routes/feedback.ts
- **Verification:** All 145 tests pass including existing feedback tests
- **Committed in:** e7fde01 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential fix for correct route mounting. No scope creep.

## Issues Encountered
None beyond the route path issue captured above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all endpoints return real data from database queries. No placeholder or mock data.

## Next Phase Readiness
- Backend API surface complete for dashboard frontend consumption
- AppType export ready for Hono RPC client (hc) in frontend package
- SSE endpoint ready for real-time pipeline status updates in UI
- All 145 tests passing (139 existing + 6 new)

## Self-Check: PASSED

All 7 created files verified on disk. Both task commit hashes (e8afef6, e7fde01) found in git log.

---
*Phase: 04-dashboard-pipeline-visualization*
*Completed: 2026-03-31*
