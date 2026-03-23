---
phase: 32-hybrid-search-intelligence
plan: "01"
subsystem: api, database, search
tags: [sqlite-vec, vector-search, bm25, rrf, embeddings, lm-studio, hybrid-search]

# Dependency graph
requires:
  - phase: v1.4
    provides: FTS5 search_index, knowledge aggregation, LM Studio health probe
provides:
  - sqlite-vec vector infrastructure (embeddings table + vec_search virtual table)
  - content-addressable embedding storage (SHA-256 hash dedup)
  - LM Studio embedding client with graceful degradation
  - hybrid BM25 + vector search with Reciprocal Rank Fusion
  - CLAUDE.md knowledge indexed in unified FTS5 search_index
  - embedding backfill service for existing content
affects: [33-capture-intelligence-engine, 34-knowledge-compounding, 35-active-intelligence-daemon]

# Tech tracking
tech-stack:
  added: [sqlite-vec 0.1.7]
  patterns: [two-table vector pattern (embeddings+vec_search), RRF fusion, content-addressable storage, BigInt rowid for sqlite-vec]

key-files:
  created:
    - packages/api/src/services/embedding.ts
    - packages/api/src/services/hybrid-search.ts
    - packages/api/src/services/embedding-backfill.ts
    - packages/api/src/db/queries/embeddings.ts
    - packages/api/drizzle/0011_vector_search.sql
    - packages/api/src/__tests__/services/embedding.test.ts
    - packages/api/src/__tests__/services/hybrid-search.test.ts
    - packages/api/src/__tests__/services/embedding-backfill.test.ts
    - packages/api/src/__tests__/db/queries/embeddings.test.ts
  modified:
    - packages/api/src/db/index.ts
    - packages/api/src/db/schema.ts
    - packages/api/src/db/queries/search.ts
    - packages/api/src/db/queries/knowledge.ts
    - packages/api/src/routes/search.ts
    - packages/api/src/services/event-bus.ts
    - packages/shared/src/schemas/api.ts
    - packages/web/src/hooks/use-search.ts
    - packages/api/package.json

key-decisions:
  - "sqlite-vec requires BigInt for rowid insertions (JS number rejected, only bigint accepted)"
  - "Two-table pattern from qmd: embeddings (metadata) + vec_search (vectors) joined by integer rowid"
  - "RRF k=60, BM25 weight=2x, vector weight=1x for original query relevance priority"
  - "768-dim float vectors matching nomic-embed-text-v1.5 model dimensions"
  - "Content-addressable via SHA-256 with CRLF normalization for cross-platform consistency"
  - "vec_search created programmatically (not in SQL migration) because it requires sqlite-vec extension loaded"
  - "knowledge source_type added to search_index for CLAUDE.md content in unified search"

patterns-established:
  - "Two-step KNN pattern: vector query first (no JOINs), metadata enrich second — sqlite-vec hangs with JOINs"
  - "Content-addressable embedding dedup: INSERT OR IGNORE on content_hash unique constraint"
  - "queueEmbedding for fire-and-forget async embedding generation via queueMicrotask"
  - "Graceful degradation: null embedding when LM Studio unavailable, BM25-only search fallback"

requirements-completed: [SRCH-01, SRCH-02, SRCH-03, SRCH-06]

# Metrics
duration: 31min
completed: 2026-03-23
---

# Phase 32 Plan 01: Vector Infrastructure + Hybrid Search Pipeline Summary

**sqlite-vec vector infrastructure with hybrid BM25+vector search via Reciprocal Rank Fusion, content-addressable embedding storage, and CLAUDE.md unified search indexing**

## Performance

- **Duration:** 31 min
- **Started:** 2026-03-23T08:29:06Z
- **Completed:** 2026-03-23T09:00:09Z
- **Tasks:** 4
- **Files modified:** 18
- **Tests:** 632 total (43 new)

## Accomplishments

- Installed sqlite-vec 0.1.7 and integrated into database setup, loading the extension before any queries
- Built content-addressable embedding storage with SHA-256 hash dedup preventing duplicate embeddings
- Implemented hybrid search pipeline: BM25 via FTS5 + vector via sqlite-vec, fused with Reciprocal Rank Fusion (k=60, BM25 2x weight)
- CLAUDE.md knowledge content now indexed in unified FTS5 search_index (previously separate LIKE query)
- Created embedding backfill service for processing existing content asynchronously
- Search route returns hybrid results with individual BM25/vector/fused scores for tuning visibility

## Task Commits

Each task was committed atomically:

1. **Task 1: sqlite-vec installation + embedding tables** - `7fa85c1` (feat)
2. **Task 2: LM Studio embedding client + content-addressable storage** - `727f7db` (feat)
3. **Task 3: Hybrid search with Reciprocal Rank Fusion** - `fa5475e` (feat)
4. **Task 4: Index CLAUDE.md knowledge + embedding backfill** - `05abd16` (feat)

## Files Created/Modified

**Created:**
- `packages/api/src/services/embedding.ts` — LM Studio embedding client with graceful degradation
- `packages/api/src/services/hybrid-search.ts` — BM25+vector orchestrator with RRF fusion
- `packages/api/src/services/embedding-backfill.ts` — Async backfill + queueEmbedding helper
- `packages/api/src/db/queries/embeddings.ts` — Embedding CRUD + two-step vector KNN search
- `packages/api/drizzle/0011_vector_search.sql` — Embeddings metadata table migration
- `packages/api/src/__tests__/services/embedding.test.ts` — 12 tests
- `packages/api/src/__tests__/services/hybrid-search.test.ts` — 9 tests
- `packages/api/src/__tests__/services/embedding-backfill.test.ts` — 6 tests
- `packages/api/src/__tests__/db/queries/embeddings.test.ts` — 16 tests

**Modified:**
- `packages/api/src/db/index.ts` — Load sqlite-vec extension, create vec_search virtual table
- `packages/api/src/db/schema.ts` — Add embeddings table to Drizzle schema
- `packages/api/src/db/queries/search.ts` — Add knowledge source type + indexKnowledge function
- `packages/api/src/db/queries/knowledge.ts` — Hook upsertKnowledge to indexKnowledge
- `packages/api/src/routes/search.ts` — Replace processSearchQuery+searchUnified with hybridSearch
- `packages/api/src/services/event-bus.ts` — Add embedding:backfill event type
- `packages/shared/src/schemas/api.ts` — Add knowledge source type + vector score fields
- `packages/web/src/hooks/use-search.ts` — Update types for knowledge source + vector scores
- `packages/api/package.json` — Add sqlite-vec dependency

## Decisions Made

- **sqlite-vec BigInt rowid requirement:** Discovered during Task 1 that sqlite-vec only accepts BigInt (not JS number) for explicit rowid insertions. All embedding operations use BigInt coercion.
- **Two-table pattern (not partition key):** sqlite-vec's vec0 text partition key didn't work as expected. Adopted qmd's two-table pattern: integer-keyed embeddings table + vec_search joined by rowid.
- **vec_search created programmatically:** vec0 virtual tables require the sqlite-vec extension loaded, which can't happen in SQL migration files. Created in db/index.ts after extension load with IF NOT EXISTS guard.
- **768 dimensions:** Matched to nomic-embed-text-v1.5 embedding model dimensions for LM Studio.
- **RRF weights:** BM25 gets 2x weight (trust keyword matches), vector gets 1x weight. Original query relevance takes priority over semantic similarity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed web SearchResult types to match updated schema**
- **Found during:** Task 4 (knowledge indexing)
- **Issue:** Web hook `use-search.ts` had hardcoded source types without "knowledge", would miss new result types
- **Fix:** Added "knowledge" to sourceType union and vector score fields to SearchResult/SearchFilters interfaces
- **Files modified:** packages/web/src/hooks/use-search.ts
- **Committed in:** 05abd16 (Task 4 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential type alignment. No scope creep.

## Issues Encountered

- sqlite-vec rejects JavaScript `number` type for rowid insertions — only accepts `bigint`. Discovered through experimentation; `Number(info.lastInsertRowid)` fails, `BigInt(info.lastInsertRowid)` works. This is a better-sqlite3 + sqlite-vec interaction detail not documented in either library.
- Pre-existing web typecheck errors in `use-search.ts` (implicit any on promise chains) and `use-force-simulation.ts` (missing d3-force types) are out of scope for this plan.

## User Setup Required

None - no external service configuration required. LM Studio embedding model needs to be loaded for vector search to activate, but the system gracefully falls back to BM25-only when unavailable.

## Next Phase Readiness

- Vector infrastructure ready for Phase 33 (capture intelligence) and Phase 34 (knowledge compounding)
- Remaining Phase 32 work: query expansion via LM Studio (SRCH-04), context annotations (SRCH-05), cross-encoder reranking (SRCH-07)
- Embedding backfill can be triggered manually or scheduled once LM Studio embedding model is loaded

## Self-Check: PASSED

All 11 created files verified present. All 4 commit hashes verified in git log.

---
*Phase: 32-hybrid-search-intelligence*
*Completed: 2026-03-23*
