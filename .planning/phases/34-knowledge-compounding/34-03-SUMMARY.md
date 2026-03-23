---
phase: 34-knowledge-compounding
plan: 03
subsystem: api, mcp, search
tags: [session-hooks, fts5, search-indexing, knowledge-digest, mcp-tools, sse-events, solution-pipeline]

# Dependency graph
requires:
  - phase: 34-knowledge-compounding/01
    provides: Solutions CRUD queries, API routes, Zod schemas
  - phase: 34-knowledge-compounding/02
    provides: Solution extractor service (significance heuristic, signal builder, content/title builders, LM Studio enrichment)
provides:
  - Session stop hook with async solution candidate generation (generateSolutionCandidate)
  - FTS5 search indexing for accepted solutions (indexSolution)
  - SearchSourceType extended with "solution" across search, hybrid-search, ai-query-rewriter
  - SSE events for solution:candidate and solution:accepted
  - Knowledge digest endpoint with relevant learnings (COMP-03)
  - POST /knowledge/digest/record-reference for startup banner tracking
  - MCP cross_project_search with solutions alongside knowledge (COMP-04)
affects: [34-04-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for solution-extractor in session hook (avoids module init cost)"
    - "Best-effort FTS5 indexing in status update route (try/catch, never fails main operation)"
    - "Parallel fetch in MCP tool with client-side sourceType filtering"

key-files:
  created: []
  modified:
    - packages/api/src/routes/sessions.ts
    - packages/api/src/routes/solutions.ts
    - packages/api/src/routes/knowledge.ts
    - packages/api/src/db/queries/search.ts
    - packages/api/src/services/hybrid-search.ts
    - packages/api/src/services/ai-query-rewriter.ts
    - packages/api/src/services/event-bus.ts
    - packages/api/src/services/solution-extractor.ts
    - packages/mcp/src/tools/cross-project-search.ts
    - packages/shared/src/schemas/api.ts

key-decisions:
  - "Dynamic import of solution-extractor in session stop hook to avoid loading AI/LM Studio modules at session route init time"
  - "generateSolutionCandidate takes _sqlite as unknown (reserved parameter) since FTS5 indexing happens on acceptance, not candidate creation"
  - "MCP cross_project_search fetches unified search and filters solutions client-side (search endpoint schema doesn't support sourceType param)"
  - "searchResultSchema sourceType extended with 'solution' to prevent Zod validation failures on solution search results"

patterns-established:
  - "Best-effort async pipeline in session hooks: queueMicrotask + try/catch for non-blocking enrichment"
  - "FTS5 index-on-acceptance pattern: indexSolution called in PATCH status handler, not on creation"

requirements-completed: [COMP-03, COMP-04, COMP-06]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 34 Plan 03: Solution Pipeline Integration Summary

**End-to-end solution extraction wired into session hooks, FTS5 search indexing on acceptance, knowledge digest learnings, and MCP cross-project search with solutions**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T11:58:04Z
- **Completed:** 2026-03-23T12:05:04Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Session stop hook triggers async generateSolutionCandidate via dynamic import, running full pipeline (signal -> significance -> commits -> content -> dedup -> create -> enrich -> emit)
- Accepted solutions indexed in FTS5 search_index, discoverable via unified search and hybrid search
- Knowledge digest endpoint returns top 3 relevant learnings for MCP startup banner with reference recording
- MCP cross_project_search returns SOLUTIONS section alongside KNOWLEDGE section for comprehensive cross-project intelligence
- SSE events for solution:candidate and solution:accepted enable real-time dashboard reactivity

## Task Commits

Each task was committed atomically:

1. **Task 1: Session stop hook wiring + search indexing + event bus** - `21c8d8b` (feat)
2. **Task 2: Knowledge digest learnings + MCP cross-project search extension** - `b5b82fc` (feat)

## Files Created/Modified
- `packages/api/src/routes/sessions.ts` - Session stop hook extended with async generateSolutionCandidate via dynamic import
- `packages/api/src/routes/solutions.ts` - PATCH /status handler indexes in FTS5 and emits solution:accepted on acceptance
- `packages/api/src/routes/knowledge.ts` - GET /digest includes learnings array; POST /digest/record-reference for tracking
- `packages/api/src/db/queries/search.ts` - SearchSourceType extended with "solution"; indexSolution function added
- `packages/api/src/services/hybrid-search.ts` - No direct changes (uses imported SearchSourceType, propagated automatically)
- `packages/api/src/services/ai-query-rewriter.ts` - SearchFilters.type and queryExpansionSchema typeFilter extended with "solution"
- `packages/api/src/services/event-bus.ts` - MCEventType extended with solution:candidate and solution:accepted
- `packages/api/src/services/solution-extractor.ts` - generateSolutionCandidate orchestration function added (10-step pipeline)
- `packages/mcp/src/tools/cross-project-search.ts` - Extended with parallel solution search and SOLUTIONS output section
- `packages/shared/src/schemas/api.ts` - searchResultSchema sourceType extended with "solution"

## Decisions Made
- Used dynamic import for solution-extractor in session stop hook to avoid loading AI/LM Studio dependencies at module init time -- keeps session route startup fast
- generateSolutionCandidate accepts `_sqlite` as reserved parameter (unknown type) since FTS5 indexing happens on acceptance, not on candidate creation
- MCP cross_project_search fetches unified search results and filters for solutions client-side rather than passing sourceType query param (search endpoint schema doesn't support it, avoiding shared schema changes for a filter)
- Extended searchResultSchema sourceType enum with "solution" (Rule 2: missing critical) to prevent Zod validation failures when solution results flow through the search pipeline

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict mode errors in generateSolutionCandidate**
- **Found during:** Task 1
- **Issue:** `string | null` not assignable to `string | undefined` for createSolution fields (projectSlug, module); unused `sqlite` parameter error
- **Fix:** Used `?? undefined` for null-to-undefined conversion; changed sqlite to `_sqlite: unknown` reserved parameter
- **Files modified:** packages/api/src/services/solution-extractor.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** 21c8d8b (Task 1 commit)

**2. [Rule 2 - Missing Critical] Extended searchResultSchema sourceType with "solution"**
- **Found during:** Task 2
- **Issue:** searchResultSchema in shared schemas only had 4 source types; solution results would fail Zod validation
- **Fix:** Added "solution" to the sourceType enum in searchResultSchema
- **Files modified:** packages/shared/src/schemas/api.ts
- **Verification:** pnpm typecheck + pnpm test (982 tests pass)
- **Committed in:** b5b82fc (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None -- plan executed smoothly after type error fixes.

## Known Stubs
None -- all endpoints return real data, no placeholders. Learnings array is empty when no accepted solutions exist (correct behavior for new installations).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- End-to-end pipeline complete: session stops -> candidate generated -> accepted solutions searchable -> learnings surfaced
- Ready for 34-04 (dashboard components to display solution candidates, compound score, learnings)
- All 982 tests pass, zero regressions

---
*Phase: 34-knowledge-compounding*
*Completed: 2026-03-23*
