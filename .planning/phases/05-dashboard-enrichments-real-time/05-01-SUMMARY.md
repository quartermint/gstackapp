---
phase: 05-dashboard-enrichments-real-time
plan: 01
subsystem: api
tags: [sse, event-emitter, heatmap, health-monitor, real-time, streaming]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Hono API server, SQLite database, project scanner, commit storage
  - phase: 03-capture-pipeline
    provides: Capture CRUD routes, enrichment service
provides:
  - SSE event bus singleton for domain event dispatch
  - /api/events SSE endpoint for real-time push
  - /api/heatmap endpoint with commit aggregation by project and day
  - /api/health/system endpoint with CPU, memory, disk, uptime, and service checks
  - Config schema extension with optional services array
affects: [05-02-dashboard-sse-heatmap, 05-03-health-pulse-stale-nudges]

# Tech tracking
tech-stack:
  added: []
  patterns: [event-bus-singleton, sse-streaming, factory-health-routes, port-check-service-monitor]

key-files:
  created:
    - packages/api/src/services/event-bus.ts
    - packages/api/src/routes/events.ts
    - packages/api/src/services/health-monitor.ts
    - packages/api/src/routes/heatmap.ts
    - packages/api/src/__tests__/services/event-bus.test.ts
    - packages/api/src/__tests__/routes/heatmap.test.ts
    - packages/api/src/__tests__/services/health-monitor.test.ts
  modified:
    - packages/api/src/app.ts
    - packages/api/src/routes/captures.ts
    - packages/api/src/services/enrichment.ts
    - packages/api/src/services/project-scanner.ts
    - packages/api/src/routes/health.ts
    - packages/api/src/lib/config.ts
    - packages/api/src/db/queries/commits.ts

key-decisions:
  - "MCEventBus extends EventEmitter with typed overloads for mc:event channel"
  - "Hono streamSSE with while-true sleep loop for SSE keepalive"
  - "Health routes converted from plain constant to factory function for config injection"
  - "checkPort uses net.createConnection with timeout for service availability detection"
  - "Legacy healthRoutes export preserved for backward compatibility with existing tests"
  - "getHeatmapData uses raw Drizzle sql template for GROUP BY aggregation"

patterns-established:
  - "Event bus singleton: eventBus.emit('mc:event', {type, id}) for all domain events"
  - "SSE endpoint pattern: streamSSE + eventBus.on + stream.onAbort cleanup"
  - "Service health check: TCP port probe with configurable timeout via net.createConnection"

requirements-completed: [DASH-05, DASH-08, DASH-09]

# Metrics
duration: 7min
completed: 2026-03-10
---

# Phase 5 Plan 1: Backend SSE, Heatmap, and Health APIs Summary

**Event bus singleton with SSE streaming, commit heatmap aggregation API, and system health monitor with per-service port checks**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-10T04:59:02Z
- **Completed:** 2026-03-10T05:06:34Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- Event bus singleton emits typed domain events (capture:created/enriched/archived, scan:complete) with SSE endpoint at /api/events using Hono streamSSE
- Heatmap API at /api/heatmap aggregates commit counts by project and day over configurable 1-52 week window
- System health monitor at /api/health/system reports CPU load, memory, disk, uptime, and per-service port check status with overall health status
- Config schema extended with optional services array for health monitoring port checks
- 16 new tests (5 event bus, 5 heatmap, 6 health monitor) -- all 107 API tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Event bus, SSE endpoint, and event emission wiring** - `24b1e68` (feat)
2. **Task 2: Heatmap aggregation query and API endpoint** - `9aa0cc9` (feat)
3. **Task 3: Health system monitor and API endpoint with config extension** - `417aab1` (feat)

_Note: TDD tasks committed test + implementation together after GREEN passed_

## Files Created/Modified
- `packages/api/src/services/event-bus.ts` - MCEventBus typed EventEmitter singleton with MCEvent interface
- `packages/api/src/routes/events.ts` - SSE endpoint using Hono streamSSE with event bus forwarding
- `packages/api/src/services/health-monitor.ts` - System metrics collection (CPU, memory, disk, uptime) + TCP port checks
- `packages/api/src/routes/heatmap.ts` - Heatmap API endpoint with configurable weeks window
- `packages/api/src/db/queries/commits.ts` - getHeatmapData aggregation query using Drizzle sql template
- `packages/api/src/routes/health.ts` - Converted to factory function, added /health/system endpoint with overallStatus
- `packages/api/src/lib/config.ts` - Added serviceEntrySchema and services array to mcConfigSchema
- `packages/api/src/app.ts` - Registered event, heatmap, and health routes; switched to createHealthRoutes factory
- `packages/api/src/routes/captures.ts` - Emit capture:created and capture:archived events
- `packages/api/src/services/enrichment.ts` - Emit capture:enriched event after processing
- `packages/api/src/services/project-scanner.ts` - Emit scan:complete event after scan cycle
- `packages/api/src/__tests__/services/event-bus.test.ts` - 5 event bus unit tests
- `packages/api/src/__tests__/routes/heatmap.test.ts` - 5 heatmap tests covering aggregation and endpoint
- `packages/api/src/__tests__/services/health-monitor.test.ts` - 6 health monitor tests including live port checks

## Decisions Made
- MCEventBus uses `any[]` in implementation overload signatures for TypeScript compatibility with EventEmitter base class
- Health routes preserved backward-compatible `healthRoutes` constant export for existing tests while adding `createHealthRoutes` factory
- Heatmap query uses `date()` SQLite function for day-level aggregation without timezone complexity
- SSE keepalive uses 30-second sleep loop (standard SSE heartbeat interval)
- Service port check timeout set to 2 seconds (fast enough for LAN services, generous enough for Mac Mini)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript overload signature compatibility in MCEventBus**
- **Found during:** Task 1 (Event bus implementation)
- **Issue:** `override on` and `override removeListener` overload signatures used `unknown[]` which was incompatible with EventEmitter's `any[]` base signature
- **Fix:** Changed implementation overload to use `any[]` parameter type with eslint disable comment
- **Files modified:** packages/api/src/services/event-bus.ts
- **Verification:** pnpm typecheck passes clean
- **Committed in:** 24b1e68 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type compatibility fix. No scope creep.

## Issues Encountered
None -- all three tasks executed smoothly with TDD RED-GREEN cycle.

## User Setup Required
None - no external service configuration required. The services array in mc.config.json is optional and defaults to empty.

## Next Phase Readiness
- All three backend APIs are operational for frontend consumption in Plan 05-02 (dashboard SSE + heatmap) and Plan 05-03 (health pulse + stale nudges)
- SSE event bus is ready for real-time dashboard updates without polling
- Heatmap data API returns properly aggregated commit intensity data
- Health monitor is configurable via mc.config.json services array

## Self-Check: PASSED

All 8 created files verified on disk. All 3 task commits (24b1e68, 9aa0cc9, 417aab1) verified in git log.

---
*Phase: 05-dashboard-enrichments-real-time*
*Completed: 2026-03-10*
