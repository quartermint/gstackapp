---
phase: 32-hybrid-search-intelligence
plan: 02
subsystem: search
tags: [rrf, reciprocal-rank-fusion, query-expansion, lm-studio, hybrid-search, fts5, vector-search]

# Dependency graph
requires:
  - phase: 32-01
    provides: sqlite-vec vector storage and embedding service
provides:
  - RRF fusion algorithm for combining ranked lists with weighted scoring
  - LM Studio query expansion replacing Gemini query rewriting
  - ProcessedQuery with typed lex/vec variants for hybrid pipeline
affects: [32-03-hybrid-search-pipeline, 32-04-search-integration]

# Tech tracking
tech-stack:
  added: ["@ai-sdk/openai (for LM Studio OpenAI-compatible API)"]
  patterns: ["RRF fusion with k=60 and weighted query variants", "LM Studio inference via AI SDK createOpenAI provider"]

key-files:
  created:
    - packages/api/src/services/rrf-fusion.ts
    - packages/api/src/__tests__/services/rrf-fusion.test.ts
  modified:
    - packages/api/src/services/ai-query-rewriter.ts
    - packages/api/src/__tests__/services/ai-query-rewriter.test.ts
    - packages/api/src/services/lm-studio.ts
    - packages/api/src/db/queries/search.ts
    - packages/api/package.json

key-decisions:
  - "RRF k=60 per original paper, formula: score = sum(weight / (k + rank + 1))"
  - "Original query gets 2x weight, expanded queries get 1x per D-04"
  - "createOpenAI from @ai-sdk/openai for LM Studio (OpenAI-compatible endpoint)"
  - "expandQuery returns null on any failure for clean fallback path"
  - "SearchFilters.type extended to include 'knowledge' source type per D-07"

patterns-established:
  - "RRF fusion as pure function with FusionCandidate interface (contentHash + rank + weight)"
  - "LM Studio provider creation via createLmStudioProvider wrapper"
  - "Query expansion with typed lexVariants (FTS5) and vecVariants (embedding) separation"

requirements-completed: [SRCH-03, SRCH-04]

# Metrics
duration: 15min
completed: 2026-03-23
---

# Phase 32 Plan 02: RRF Fusion + LM Studio Query Expansion Summary

**RRF fusion algorithm with k=60 weighted scoring and LM Studio query expansion replacing Gemini, producing typed lex/vec variants for hybrid search pipeline**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-23T08:28:17Z
- **Completed:** 2026-03-23T08:44:09Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Pure RRF fusion module computing score = sum(weight / (k + rank + 1)) with k=60 and 2x weight for original query
- Complete replacement of Gemini dependency with LM Studio for search query expansion
- ProcessedQuery interface extended with lexVariants and vecVariants arrays for downstream hybrid search pipeline
- Graceful degradation when LM Studio unavailable (falls back to direct FTS5)

## Task Commits

Each task was committed atomically:

1. **Task 1: RRF fusion module** - `af4da99` (feat) - TDD: 11 unit tests covering all RRF math scenarios
2. **Task 2: Replace Gemini query rewriting with LM Studio query expansion** - `5e4874a` (feat) - TDD: 17 tests covering expansion, fallback, and backward compatibility

## Files Created/Modified
- `packages/api/src/services/rrf-fusion.ts` - RRF fusion algorithm: fuseResults, rankByFusion, RRF_K exports
- `packages/api/src/__tests__/services/rrf-fusion.test.ts` - 11 unit tests for RRF math
- `packages/api/src/services/ai-query-rewriter.ts` - Refactored from Gemini to LM Studio, added expandQuery with typed variants
- `packages/api/src/__tests__/services/ai-query-rewriter.test.ts` - Updated mocks from Gemini/ai-categorizer to LM Studio, 17 tests
- `packages/api/src/services/lm-studio.ts` - Added createLmStudioProvider using @ai-sdk/openai
- `packages/api/src/db/queries/search.ts` - SearchOptions.sourceType extended with "knowledge"
- `packages/api/package.json` - Added @ai-sdk/openai dependency
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- Used `@ai-sdk/openai` (createOpenAI) for LM Studio provider since it exposes OpenAI-compatible API -- simpler than custom fetch wrapper and consistent with existing AI SDK usage
- RRF k=60 per original paper standard, matching qmd reference implementation
- expandQuery wraps errors in try/catch returning null, letting processSearchQuery handle fallback (clean separation)
- SearchFilters.type extended to include "knowledge" to support CLAUDE.md content in unified search index (per D-07)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added createLmStudioProvider to lm-studio.ts**
- **Found during:** Task 2 (Query expansion implementation)
- **Issue:** Plan 01 (parallel wave-1 plan) would create createLmStudioProvider, but it runs concurrently. The function was needed for expandQuery.
- **Fix:** Added createLmStudioProvider using createOpenAI from @ai-sdk/openai to lm-studio.ts
- **Files modified:** packages/api/src/services/lm-studio.ts, packages/api/package.json
- **Verification:** All tests pass, typecheck clean
- **Committed in:** 5e4874a (Task 2 commit)

**2. [Rule 1 - Bug] Fixed TypeScript type errors from SearchFilters.type extension**
- **Found during:** Task 2 (Post-implementation typecheck)
- **Issue:** SearchFilters.type now includes "knowledge" but SearchOptions.sourceType in search.ts didn't accept it, causing TS2322
- **Fix:** Extended SearchOptions.sourceType union to include "knowledge"
- **Files modified:** packages/api/src/db/queries/search.ts
- **Verification:** pnpm typecheck passes clean
- **Committed in:** 5e4874a (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- RRF fusion module ready for Plan 03 hybrid search pipeline integration
- ProcessedQuery.lexVariants and vecVariants ready for multi-query expansion in hybrid pipeline
- LM Studio provider infrastructure in place for both query expansion and embedding (Plan 01)
- All 605 API tests passing, TypeScript strict mode clean

## Self-Check: PASSED

All files verified present, both commit hashes confirmed in git log.

---
*Phase: 32-hybrid-search-intelligence*
*Completed: 2026-03-23*
