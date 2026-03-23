---
phase: 14-intelligence-layer
plan: 01
subsystem: api
tags: [conflict-detection, session-tracking, sse, health-findings, sqlite]

# Dependency graph
requires:
  - phase: 11-data-foundation
    provides: sessions table, health findings infrastructure, event bus
  - phase: 12-session-ingestion
    provides: session hook routes, heartbeat debounce, session reaper
provides:
  - File-level conflict detection across active sessions
  - session_file_conflict health check type in risk feed
  - Rich SSE payloads with data field on MCEvent
  - Auto-resolution of conflicts on session end/abandon
  - Session relationship metadata on list endpoint
affects: [14-02-PLAN, dashboard-intelligence, risk-feed]

# Tech tracking
tech-stack:
  added: []
  patterns: [best-effort conflict detection in heartbeat path, raw SQL for metadata-aware resolution, relationship metadata pattern on list endpoints]

key-files:
  created:
    - packages/api/src/services/conflict-detector.ts
    - packages/api/src/__tests__/services/conflict-detector.test.ts
  modified:
    - packages/shared/src/schemas/health.ts
    - packages/api/src/services/event-bus.ts
    - packages/api/src/routes/sessions.ts
    - packages/api/src/routes/events.ts
    - packages/api/src/services/session-service.ts
    - packages/api/src/db/queries/sessions.ts
    - packages/api/src/index.ts
    - packages/web/src/lib/action-hints.ts
    - packages/api/src/__tests__/routes/sessions.test.ts

key-decisions:
  - "Conflict detection is best-effort in heartbeat path -- never fails the heartbeat response"
  - "resolveSessionConflicts uses raw SQL with json_extract for metadata-aware finding resolution"
  - "Reaper signature extended with optional sqlite param for backward compatibility"
  - "SSE serializes full MCEvent object (not just type+id) to support rich data payloads"
  - "Relationship metadata only computed when projectSlug filter is present (performance optimization)"

patterns-established:
  - "Best-effort secondary logic: wrap in try/catch inside existing handlers, never block primary operation"
  - "Optional parameter extension: add sqlite? param to existing functions for backward compatibility"
  - "Relationship metadata pattern: compute aggregate counts only when filtered by entity (projectSlug)"

requirements-completed: [INTL-01, INTL-02, INTL-03]

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 14 Plan 01: Conflict Detection Summary

**File-level conflict detector across active sessions with health finding persistence, SSE events, auto-resolution, and relationship metadata**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T16:05:33Z
- **Completed:** 2026-03-16T16:13:15Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Pure conflict detection service that finds file-level overlaps between active sessions on the same project
- Conflict findings persisted to project_health table and surfaced through existing risk feed infrastructure
- SSE events emit rich data payloads (sessionB, projectSlug, conflictingFiles) via updated MCEvent interface
- Auto-resolution when sessions end (stop handler) or are abandoned (reaper)
- Session list endpoint returns relationship metadata (activeCount, recentCompletedCount, summary) when filtered by project
- 13 new tests (10 unit + 3 integration) with zero regressions on 374 total API tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend shared schemas, MCEvent interface, and create conflict detector service** - `faa36ee` (feat)
2. **Task 2: Wire conflict detection into heartbeat, stop, reaper, fix SSE serialization, add relationship metadata** - `6d070a1` (feat)
3. **Task 3: Comprehensive tests for conflict detection, integration, and relationship metadata** - `28dc7f5` (test)

## Files Created/Modified
- `packages/api/src/services/conflict-detector.ts` - Pure conflict detection logic with path normalization, detection, emission, and resolution
- `packages/shared/src/schemas/health.ts` - Extended healthCheckTypeEnum with session_file_conflict
- `packages/api/src/services/event-bus.ts` - MCEvent interface gains optional data field for rich payloads
- `packages/api/src/routes/sessions.ts` - Heartbeat triggers conflict detection, stop resolves conflicts
- `packages/api/src/routes/events.ts` - SSE serializes full MCEvent object (not just type+id)
- `packages/api/src/services/session-service.ts` - Reaper resolves conflicts on abandoned sessions
- `packages/api/src/db/queries/sessions.ts` - listSessions returns relationship metadata when filtered by project
- `packages/api/src/index.ts` - Passes sqlite handle to session reaper for conflict resolution
- `packages/web/src/lib/action-hints.ts` - Handles session_file_conflict check type (returns empty string)
- `packages/api/src/__tests__/services/conflict-detector.test.ts` - 10 unit tests covering all detection and resolution scenarios
- `packages/api/src/__tests__/routes/sessions.test.ts` - 3 new integration tests for conflict detection and relationships

## Decisions Made
- Conflict detection is best-effort in heartbeat path -- wrapped in try/catch, never fails the heartbeat response
- resolveSessionConflicts uses raw SQL with json_extract to match session ID in metadata (sessionA or sessionB)
- Reaper signature extended with optional `sqlite?: Database.Database` for backward compatibility
- SSE serializes full MCEvent object to support the new data field (backward-compatible for existing events)
- Relationship metadata only computed when projectSlug filter is present (avoids unnecessary queries)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode violations in test files**
- **Found during:** Task 3 (test writing)
- **Issue:** Accessing `conflicts[0].property` without non-null assertion fails TypeScript strict mode
- **Fix:** Added non-null assertions (`conflicts[0]!`) for array element access after length assertions
- **Files modified:** conflict-detector.test.ts, sessions.test.ts
- **Verification:** `pnpm typecheck` and `pnpm test` both pass clean
- **Committed in:** 28dc7f5 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** TypeScript strict mode compliance fix. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Conflict detection infrastructure complete, ready for dashboard surfacing in 14-02
- session_file_conflict findings already flow through GET /api/risks endpoint
- SSE data field enables rich real-time notifications in dashboard
- Relationship metadata available for session panel in dashboard

---
*Phase: 14-intelligence-layer*
*Completed: 2026-03-16*
