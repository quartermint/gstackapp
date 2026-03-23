# Phase 32: Hybrid Search Intelligence - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace MC's basic FTS5 keyword search + Gemini query rewriting with a production-grade hybrid search pipeline: BM25 + vector + Reciprocal Rank Fusion + local query expansion via LM Studio. Inspired by tobi/qmd which uses the exact same stack (better-sqlite3, SQLite FTS5, sqlite-vec).

</domain>

<decisions>
## Implementation Decisions

### Search UI
- **D-01:** Invisible upgrade — same search box, better results behind the scenes. No new UI elements for search. User is open to evolution later if hybrid search enables it.

### Search Architecture (from v2.0-VISION.md)
- **D-02:** sqlite-vec extension for vector embeddings, using LM Studio's OpenAI-compatible embedding endpoint
- **D-03:** Content-addressable storage via SHA-256 hash dedup for all indexed content (captures, commits, knowledge)
- **D-04:** Hybrid BM25 + vector search with Reciprocal Rank Fusion: `score = sum(weight / (k + rank + 1))`, k=60, original query gets 2x weight
- **D-05:** Query expansion via LM Studio replacing Gemini query rewriting. Falls back to direct FTS5 if LM Studio unavailable.
- **D-06:** Context annotations on projects returned with search results (like qmd's context tree)
- **D-07:** CLAUDE.md content indexed in unified search_index (currently separate LIKE query in knowledge.ts)
- **D-08:** Cross-encoder reranking optional quality pass — implement if model performance allows

### Infrastructure
- **D-09:** Async job queue for embedding work: start with SQLite-based job table (not BullMQ+Redis). Upgrade if scale demands it. Inspired by project-nomad's BullMQ pattern but avoiding new dependencies.
- **D-10:** sqlite-vec two-step query pattern from qmd: vector query first (no JOINs), enrich with metadata second. sqlite-vec hangs when combined with JOINs.
- **D-11:** Start with Qwen3-Coder-30B for query expansion via LM Studio. Migrate to dedicated small model later if needed (qmd fine-tuned a 1.7B model for this).

### Claude's Discretion
- Embedding model dimensions and chunking strategy
- RRF parameter tuning (k value, weight distribution)
- Which content types get vector embeddings vs FTS5-only
- Reranking implementation details

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision & Architecture
- `.planning/v2.0-VISION.md` — Full v2.0 vision document with all architectural decisions
- `.planning/research/ARCHITECTURE.md` — v1.4 architecture patterns (extend, do not replace)

### Current Search Implementation
- `packages/api/src/db/queries/search.ts` — Current FTS5 query functions
- `packages/api/src/services/ai-query-rewriter.ts` — Current Gemini query rewriting (to be replaced)
- `packages/api/src/routes/search.ts` — Search API route
- `packages/api/drizzle/0003_commits_and_unified_search.sql` — FTS5 migration

### Current Knowledge Search
- `packages/api/src/db/queries/knowledge.ts` — LIKE-based search (to be migrated to unified index)

### LM Studio Integration
- `packages/api/src/services/lm-studio.ts` — Current health probe (to be extended for inference)

### Inspiration
- tobi/qmd (GitHub) — Hybrid search architecture, sqlite-vec patterns, RRF fusion, context tree

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `search_index` FTS5 virtual table — extend with vector columns, don't replace
- `ai-query-rewriter.ts` — swap Gemini for LM Studio, keep the interface
- `lm-studio.ts` — extend from health probe to inference client
- `enrichment.ts` — `queueMicrotask` pattern for async work (extend to job queue)
- Content-hash pattern from `knowledge.ts` — reuse for content-addressable storage

### Established Patterns
- Unified search_index mixing capture/commit/project source types
- BM25 ranking with `bm25(search_index)` — keep as one signal in fusion
- Graceful degradation when AI unavailable (search falls back to FTS5)
- SSE for real-time progress broadcasting

### Integration Points
- `GET /api/search` route — augment with hybrid results
- `packages/shared/src/schemas/` — extend search schemas for vector scores
- `app.ts` route chain — no new routes needed, enhance existing

</code_context>

<specifics>
## Specific Ideas

- qmd's position-aware blending: top results trust retrieval (75% RRF / 25% reranker), deep results trust reranker more (40% RRF / 60% reranker). Prevents reranker from destroying good keyword matches.
- qmd's content-addressable storage means renamed files don't need re-embedding. Apply to captures (content rarely changes) and commits (immutable).
- qmd's `llm_cache` table for caching query expansion and reranking results. Apply to MC for intelligence cache with TTL.

</specifics>

<deferred>
## Deferred Ideas

- Fine-tuned query expansion model (like qmd's custom Qwen3-1.7B) — optimize later
- Named indexes for multiple search contexts — not needed for single-user
- MCP search tool enhancement — after search pipeline is proven

</deferred>

---

*Phase: 32-hybrid-search-intelligence*
*Context gathered: 2026-03-22*
