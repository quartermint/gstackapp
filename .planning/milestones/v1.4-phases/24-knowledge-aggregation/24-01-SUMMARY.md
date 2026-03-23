---
phase: 24-knowledge-aggregation
plan: 01
subsystem: api
tags: [sqlite, drizzle, hono, zod, knowledge, claude-md, staleness]

# Dependency graph
requires:
  - phase: 23-config-foundation
    provides: "idempotency keys migration pattern (0008), stale_knowledge check type in health enum"
provides:
  - "project_knowledge table with Drizzle schema and migration 0009"
  - "Knowledge query module: getKnowledge, getAllKnowledge, upsertKnowledge"
  - "Shared Zod schemas: knowledgeResponseSchema, knowledgeListResponseSchema"
  - "GET /api/knowledge and GET /api/knowledge/:slug endpoints"
  - "knowledge:updated event bus type"
  - "computeStalenessScore function (60% age / 40% commits weighting)"
affects: [24-knowledge-aggregation-plan-02, 26-convention-registry, 27-mcp-knowledge-tools]

# Tech tracking
tech-stack:
  added: []
  patterns: ["staleness score formula (linear decay: 90-day age weight 60% + 50-commit weight 40%)"]

key-files:
  created:
    - packages/api/src/db/queries/knowledge.ts
    - packages/api/drizzle/0009_knowledge.sql
    - packages/shared/src/schemas/knowledge.ts
    - packages/api/src/routes/knowledge.ts
    - packages/api/src/__tests__/db/queries/knowledge.test.ts
    - packages/api/src/__tests__/routes/knowledge.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/drizzle/meta/_journal.json
    - packages/shared/src/index.ts
    - packages/shared/src/types/index.ts
    - packages/api/src/services/event-bus.ts
    - packages/api/src/app.ts

key-decisions:
  - "ON CONFLICT DO UPDATE for upsert (preserves createdAt, simpler than SELECT-then-INSERT)"
  - "Staleness formula: 60% age (90-day linear decay) + 40% commits (50-commit decay), rounded to integer"
  - "getAllKnowledge uses Drizzle select() with explicit column projection to exclude content"

patterns-established:
  - "Knowledge query pattern: upsertKnowledge uses raw sqlite with ON CONFLICT DO UPDATE for atomic upsert"
  - "Staleness scoring: computeStalenessScore returns 0-100 integer, composable for both list and detail endpoints"

requirements-completed: [KNOW-01, KNOW-02, KNOW-03]

# Metrics
duration: 9min
completed: 2026-03-21
---

# Phase 24 Plan 01: Knowledge Data Layer Summary

**project_knowledge table, query module, shared Zod schemas, and GET /api/knowledge endpoints with linear-decay staleness scoring**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-21T16:15:48Z
- **Completed:** 2026-03-21T16:25:16Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- project_knowledge table with projectSlug PK, content, contentHash, fileSize, lastModified, commitsSinceUpdate, lastScannedAt columns and last_modified index
- Knowledge query module with getKnowledge (full record), getAllKnowledge (without content), and upsertKnowledge (atomic ON CONFLICT DO UPDATE)
- GET /api/knowledge returns list with stalenessScore, GET /api/knowledge/:slug returns full record with content and stalenessScore, 404 on unknown slug
- knowledge:updated event type registered in MCEventBus for downstream SSE integration
- 11 new tests (5 query + 6 route integration), 504 total API tests passing, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Knowledge query tests** - `bceda11` (test)
2. **Task 1 GREEN: Schema, migration, shared schemas, query module, event bus** - `bbdcf03` (feat)
3. **Task 2 RED: Knowledge route integration tests** - `2fd95cc` (test)
4. **Task 2 GREEN: Knowledge API routes with staleness scoring** - `1dcd1e7` (feat)

## Files Created/Modified
- `packages/api/src/db/schema.ts` - Added projectKnowledge table definition
- `packages/api/drizzle/0009_knowledge.sql` - CREATE TABLE and INDEX migration
- `packages/api/drizzle/meta/_journal.json` - Added idx 9 entry for 0009_knowledge migration
- `packages/shared/src/schemas/knowledge.ts` - knowledgeResponseSchema and knowledgeListResponseSchema Zod schemas
- `packages/shared/src/index.ts` - Added knowledge schema and type exports
- `packages/shared/src/types/index.ts` - Added KnowledgeResponse and KnowledgeListResponse types
- `packages/api/src/db/queries/knowledge.ts` - getKnowledge, getAllKnowledge, upsertKnowledge functions
- `packages/api/src/services/event-bus.ts` - Added knowledge:updated to MCEventType union
- `packages/api/src/routes/knowledge.ts` - createKnowledgeRoutes with computeStalenessScore
- `packages/api/src/app.ts` - Registered knowledge routes in method chain
- `packages/api/src/__tests__/db/queries/knowledge.test.ts` - 5 query unit tests
- `packages/api/src/__tests__/routes/knowledge.test.ts` - 6 route integration tests

## Decisions Made
- Used ON CONFLICT DO UPDATE instead of SELECT-then-INSERT pattern (simpler, createdAt preserved via excluded values not being applied)
- Staleness score formula: 60% age weight (linear decay over 90 days) + 40% commits weight (linear decay over 50 commits), result rounded to integer 0-100
- getAllKnowledge uses explicit Drizzle select() column projection to exclude content field at the query level (not post-processing)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Knowledge data layer ready for Plan 02's aggregator service to populate via upsertKnowledge
- knowledge:updated event type ready for SSE integration
- GET /api/knowledge endpoints ready for downstream dashboard and MCP tool consumption (Phases 26, 27)
- 504 API tests passing, typecheck clean, zero regressions

## Self-Check: PASSED

- All 6 created files exist on disk
- All 4 task commits verified in git log (bceda11, bbdcf03, 2fd95cc, 1dcd1e7)
- 504 API tests passing, typecheck clean

---
*Phase: 24-knowledge-aggregation*
*Completed: 2026-03-21*
