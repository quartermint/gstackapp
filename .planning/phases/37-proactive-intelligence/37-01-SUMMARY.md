---
phase: 37-proactive-intelligence
plan: 01
subsystem: api, database
tags: [insights, sqlite, drizzle, hono, dedup, content-hash, proactive-intelligence]

# Dependency graph
requires:
  - phase: 35-intelligence-daemon
    provides: intelligence routes and cache infrastructure
provides:
  - insights table with content-hash dedup
  - CRUD queries (create, getActive, dismiss, snooze, getById)
  - 3 API endpoints (GET list, POST dismiss, POST snooze)
  - event bus events for insight lifecycle
  - Insight shared type for dashboard consumption
affects: [37-02 insight generator, 37-03 pattern detectors, 37-04 dashboard insights panel]

# Tech tracking
tech-stack:
  added: []
  patterns: [ON CONFLICT DO NOTHING for content-hash dedup, epoch-second snooze comparison]

key-files:
  created:
    - packages/api/src/db/queries/insights.ts
    - packages/api/drizzle/0015_insights.sql
    - packages/shared/src/schemas/insight.ts
    - packages/api/src/__tests__/db/queries/insights.test.ts
    - packages/api/src/__tests__/routes/intelligence-insights.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/src/services/event-bus.ts
    - packages/api/src/routes/intelligence.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts
    - packages/api/drizzle/meta/_journal.json

key-decisions:
  - "ON CONFLICT DO NOTHING for content-hash dedup (not DO UPDATE) -- insights are immutable once created"
  - "Epoch-second comparison for snooze filtering via raw SQL bind param (Drizzle timestamp mode stores epoch seconds)"
  - "Insight routes placed before :slug/narrative to avoid Hono param-matching conflicts"

patterns-established:
  - "Insight dedup pattern: content-hash SHA-256 with ON CONFLICT DO NOTHING, returns null on duplicate"
  - "Snooze pattern: snoozedUntil epoch compared at query time, no background reaper needed"

requirements-completed: [PROACT-06]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 37 Plan 01: Insights Persistence Summary

**Insights table with content-hash dedup, CRUD queries, and 3 API endpoints for proactive intelligence dismiss/snooze lifecycle**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T14:20:11Z
- **Completed:** 2026-03-23T14:27:14Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Insights SQLite table with 4 indexes including content-hash unique constraint
- CRUD query layer with dedup (createInsight returns null on duplicate), active filtering, dismiss, snooze
- Three API endpoints: GET /intelligence/insights (with type filter), POST dismiss, POST snooze (with 404 handling)
- Event bus extended with insight_created and insight_dismissed events for SSE
- Shared Insight type and schema for dashboard consumption
- 18 new tests (11 query + 7 route integration), 898 total API tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Insights schema, migration, and CRUD queries with tests** - `ed89828` (feat)
2. **Task 2: Insight API routes with tests** - `bf0e053` (feat)

## Files Created/Modified
- `packages/api/src/db/schema.ts` - Added insights table definition with 4 indexes
- `packages/api/drizzle/0015_insights.sql` - SQL migration for insights table
- `packages/api/drizzle/meta/_journal.json` - Migration journal entry for 0015
- `packages/api/src/db/queries/insights.ts` - CRUD operations with content-hash dedup
- `packages/api/src/services/event-bus.ts` - insight_created and insight_dismissed event types
- `packages/api/src/routes/intelligence.ts` - 3 new insight endpoints
- `packages/shared/src/schemas/insight.ts` - Zod schema for Insight type
- `packages/shared/src/types/index.ts` - InsightType and Insight type exports
- `packages/shared/src/index.ts` - Schema and type barrel exports
- `packages/api/src/__tests__/db/queries/insights.test.ts` - 11 query tests
- `packages/api/src/__tests__/routes/intelligence-insights.test.ts` - 7 route tests

## Decisions Made
- ON CONFLICT DO NOTHING for content-hash dedup: insights are immutable once created, unlike intelligence cache which uses DO UPDATE
- Epoch-second comparison for snooze filtering: Drizzle stores timestamps as epoch seconds in integer columns, so comparison uses raw epoch bind param
- Insight routes placed before :slug/narrative: same pattern as Phase 35 digest route placement to avoid Hono slug-matching conflicts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused eventBus import from routes**
- **Found during:** Task 2 (Route implementation)
- **Issue:** TypeScript strict mode flagged unused import of eventBus in intelligence.ts (events are emitted in query layer, not route layer)
- **Fix:** Removed the unused import
- **Files modified:** packages/api/src/routes/intelligence.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** bf0e053 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial cleanup, no scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Insights persistence layer is complete and ready for Plan 02 (insight generator) to write insights
- Plan 04 (dashboard) can read from GET /intelligence/insights endpoint
- All 898 API tests passing, typecheck clean
- Migration 0015 ready for production deployment

---
*Phase: 37-proactive-intelligence*
*Completed: 2026-03-23*
