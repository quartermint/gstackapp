---
phase: 04-search-intelligence
plan: 02
subsystem: api
tags: [ai, search, fts5, query-rewriting, gemini, vercel-ai-sdk, hono]

# Dependency graph
requires:
  - phase: 04-search-intelligence
    plan: 01
    provides: Unified FTS5 search_index, searchUnified function, sanitizeFtsQuery
  - phase: 03-capture-pipeline
    provides: AI categorizer pattern (isAIAvailable, generateText + Output.object + google)
provides:
  - AI query rewriter with smart detection heuristic (needsAIRewrite)
  - processSearchQuery orchestrator with graceful AI fallback
  - Enhanced search route returning sourceType, snippet, rewrittenQuery, filters
  - Updated shared schemas (searchResultSchema, searchResponseSchema)
affects: [04-03, 05-enrichments]

# Tech tracking
tech-stack:
  added: []
  patterns: [AI query rewriting with smart keyword/NL detection, graceful AI fallback in search path, searchResponseSchema with metadata]

key-files:
  created:
    - packages/api/src/services/ai-query-rewriter.ts
    - packages/api/src/__tests__/services/ai-query-rewriter.test.ts
  modified:
    - packages/api/src/routes/search.ts
    - packages/shared/src/schemas/api.ts
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts
    - packages/api/src/__tests__/routes/search.test.ts

key-decisions:
  - "Smart detection heuristic: 1-2 words without question indicators go to FTS5 fast path, 3+ words or question patterns route through AI"
  - "processSearchQuery as single orchestrator: encapsulates fast-path, AI rewrite, and fallback in one function"
  - "searchResponseSchema adds rewrittenQuery and filters metadata for frontend transparency"

patterns-established:
  - "AI query rewriter pattern: needsAIRewrite heuristic -> rewriteQuery AI call -> processSearchQuery orchestrator"
  - "Graceful AI degradation in search: same pattern as capture enrichment (isAIAvailable guard + try/catch fallback)"
  - "Search result id field: sourceId promoted to id for client convenience"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03]

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 04 Plan 02: AI Query Rewriter Summary

**AI query rewriter turning natural language into optimized FTS5 queries with project/type/date filters, smart keyword detection fast path, and graceful fallback**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T21:01:12Z
- **Completed:** 2026-03-09T21:05:13Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Smart detection heuristic routes short keywords directly to FTS5 (fast path) and natural language questions through AI rewriter
- AI query rewriter uses Vercel AI SDK + Gemini structured output to extract FTS5 terms, project filter, type filter, and date range from natural language
- Enhanced search route integrates processSearchQuery orchestrator with full graceful fallback chain
- Updated shared schemas with unified result shape (sourceType, snippet, projectSlug) and response metadata (rewrittenQuery, filters)
- All 91 tests pass (12 new AI rewriter unit tests + 3 new search route tests), typecheck clean

## Task Commits

Each task was committed atomically (TDD: test then feat):

1. **Task 1: AI query rewriter service with smart detection heuristic**
   - `0097c93` test(04-02): add failing tests for AI query rewriter
   - `d357594` feat(04-02): AI query rewriter with smart detection heuristic
2. **Task 2: Enhanced search route and updated shared schemas**
   - `cfa69fb` feat(04-02): enhanced search route with AI rewriter integration

## Files Created/Modified

- `packages/api/src/services/ai-query-rewriter.ts` - AI query rewriter: needsAIRewrite heuristic, rewriteQuery AI call, processSearchQuery orchestrator
- `packages/api/src/__tests__/services/ai-query-rewriter.test.ts` - 12 unit tests: heuristic, fast path, fallback, AI success, null output
- `packages/api/src/routes/search.ts` - Rewired to use processSearchQuery with AI rewriting and unified search
- `packages/shared/src/schemas/api.ts` - Updated searchResultSchema (sourceType, snippet, sourceId, projectSlug), added searchResponseSchema
- `packages/shared/src/types/index.ts` - Added SearchResponse type
- `packages/shared/src/index.ts` - Exported searchResponseSchema and SearchResponse
- `packages/api/src/__tests__/routes/search.test.ts` - Updated for new response shape, added 3 tests for rewrittenQuery/filters/sourceType

## Decisions Made

- **Smart detection heuristic boundaries:** 1-2 words without question indicators are keywords (fast path). 3+ words always route through AI. Question words (what/find/show/etc.) and patterns (related to/working on/etc.) trigger AI regardless of length.
- **processSearchQuery as single entry point:** Encapsulates all routing logic so the search route only calls one function. Makes testing straightforward.
- **searchResponseSchema metadata:** rewrittenQuery and filters exposed at top level for frontend to display AI transparency (filter chips, "showing results for..." text).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - AI query rewriting requires the same GEMINI_API_KEY already used by the capture categorizer. When no key is set, search falls back gracefully to keyword FTS5.

## Next Phase Readiness

- AI query rewriter and enhanced search route complete, ready for Plan 03 (search UI enhancements)
- Command palette already fetches from /api/search -- Plan 03 can update result mapping to use new sourceType/snippet fields
- Filter chips can use the filters metadata from searchResponseSchema

## Self-Check: PASSED

- All 7 files verified (2 created, 5 modified)
- All 3 commits verified (0097c93, d357594, cfa69fb)
- 91/91 tests passing
- Typecheck clean across all packages

---
*Phase: 04-search-intelligence*
*Completed: 2026-03-09*
