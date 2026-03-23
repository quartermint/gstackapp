---
phase: 35-active-intelligence-daemon
plan: 01
subsystem: api
tags: [sqlite, drizzle, cache, ttl, llm, context-window, intelligence]

# Dependency graph
requires:
  - phase: 34-knowledge-compounding
    provides: solutions table pattern, embedding service, lm-studio health probe
provides:
  - intelligence_cache table with TTL-based expiration and slug+type unique constraint
  - Cache CRUD queries (upsert, get, purge) with ON CONFLICT DO UPDATE pattern
  - Cache service with TTL-aware read/write and in-memory generation lock
  - Adaptive context adapter with model-tier-aware token budgets
  - Intelligence event types on event bus (narrative_generated, digest_generated, cache_refreshed)
affects: [35-02-narrative-generator, 35-03-digest-generator, 35-04-routing-intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns: [intelligence-cache-ttl, generation-lock, model-tier-budgets, proportional-context-allocation]

key-files:
  created:
    - packages/api/drizzle/0014_intelligence_cache.sql
    - packages/api/src/db/queries/intelligence-cache.ts
    - packages/api/src/services/intelligence-cache.ts
    - packages/api/src/services/context-adapter.ts
    - packages/api/src/__tests__/db/queries/intelligence-cache.test.ts
    - packages/api/src/__tests__/services/context-adapter.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/src/services/event-bus.ts
    - packages/api/drizzle/meta/_journal.json

key-decisions:
  - "ON CONFLICT(project_slug, generation_type) DO UPDATE for cache upsert -- same pattern as knowledge upsert (Phase 24)"
  - "In-memory Set for generation lock with 60s auto-release timeout to prevent permanent locks on crash"
  - "Model tier detection via regex patterns: 70b/72b=large, 30b/32b/qwen3-coder=medium, default=small"
  - "Context budget allocation: 40% commits, 30% captures, 30% sessions with line-boundary truncation"

patterns-established:
  - "Intelligence cache: TTL-based expiration with per-type TTL constants (1h narrative, 12h digest, 30min routing, 24h weekly)"
  - "Generation lock: in-memory lock map preventing duplicate concurrent LLM calls for the same cache key"
  - "Context adapter: model-tier-aware token budgets with proportional section allocation"

requirements-completed: [DAEMON-06, DAEMON-07, DAEMON-08]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 35 Plan 01: Intelligence Cache Foundation Summary

**Intelligence cache with TTL expiration, generation lock, and model-tier-aware adaptive context budgets for all downstream LLM generators**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T12:40:39Z
- **Completed:** 2026-03-23T12:46:30Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Intelligence cache table with slug+type unique index, TTL expiration, and migration 0014
- Cache service providing TTL-aware getFromCache/writeToCache with in-memory generation lock (60s auto-release)
- Adaptive context adapter returning model-tier budgets (4K/8K/16K tokens) with proportional section allocation
- 21 tests covering cache CRUD, TTL expiration, purge, lock semantics, model tiers, truncation, and narrative assembly

## Task Commits

Each task was committed atomically:

1. **Task 1: Intelligence cache schema + migration + CRUD queries + cache service** - `75b85e3` (feat)
2. **Task 2: Adaptive context injection service** - `0e536d2` (feat)

## Files Created/Modified
- `packages/api/drizzle/0014_intelligence_cache.sql` - Migration creating intelligence_cache table with indexes
- `packages/api/src/db/schema.ts` - Added intelligenceCache table definition
- `packages/api/drizzle/meta/_journal.json` - Added migration entry idx 14
- `packages/api/src/db/queries/intelligence-cache.ts` - CRUD: upsertCacheEntry, getCacheEntry, purgeExpiredEntries
- `packages/api/src/services/intelligence-cache.ts` - Cache service with TTL, generation lock, purge wrapper
- `packages/api/src/services/context-adapter.ts` - Model-tier budgets, truncation, narrative context builder
- `packages/api/src/services/event-bus.ts` - Added intelligence event types
- `packages/api/src/__tests__/db/queries/intelligence-cache.test.ts` - 12 tests for cache queries + service
- `packages/api/src/__tests__/services/context-adapter.test.ts` - 9 tests for context adapter

## Decisions Made
- ON CONFLICT(project_slug, generation_type) DO UPDATE for cache upsert -- same pattern as knowledge upsert (Phase 24)
- In-memory Set for generation lock with 60s auto-release timeout to prevent permanent locks on crash
- Model tier detection via regex patterns: 70b/72b=large, 30b/32b/qwen3-coder=medium, default=small
- Context budget allocation: 40% commits, 30% captures, 30% sessions with line-boundary truncation
- SQLite integer timestamp precision: cache TTL tests use 2s tolerance for sub-second rounding

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed truncation edge case where zero lines kept**
- **Found during:** Task 2 (context adapter implementation)
- **Issue:** truncateContext with very small budgets could result in empty output when marker length exceeded remaining budget
- **Fix:** Added guard to always keep at least one line before checking budget overflow
- **Files modified:** packages/api/src/services/context-adapter.ts
- **Verification:** All 9 context adapter tests pass
- **Committed in:** 0e536d2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor edge case fix. No scope creep.

## Issues Encountered
- SQLite integer timestamps lose sub-second precision, causing exact-millisecond TTL assertions to fail. Resolved by adding 2s tolerance to timestamp comparison tests.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Intelligence cache foundation ready for narrative generator (35-02), digest generator (35-03), and routing intelligence (35-04)
- Cache service exports (getFromCache, writeToCache, acquireGenerationLock, releaseGenerationLock) are the shared API
- Context adapter exports (getContextBudget, truncateContext, buildNarrativeContext) enable model-aware prompt construction

## Self-Check: PASSED

All 9 created/modified files verified on disk. Both task commits (75b85e3, 0e536d2) confirmed in git log. 21 tests passing, typecheck clean.

---
*Phase: 35-active-intelligence-daemon*
*Completed: 2026-03-23*
