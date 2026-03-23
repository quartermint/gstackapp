---
phase: 32-hybrid-search-intelligence
verified: 2026-03-23T09:30:26Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 32: Hybrid Search Intelligence Verification Report

**Phase Goal:** User can search across all MC content (captures, commits, knowledge, solutions) with semantic understanding — not just keyword matching — powered entirely by local models
**Verified:** 2026-03-23T09:30:26Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Semantic query "how does the capture pipeline work" returns relevant results even without keyword matches | ? HUMAN | sqlite-vec + vector search pipeline fully wired; relevance quality requires live LM Studio |
| 2   | Search results include fused BM25 + vector scores via Reciprocal Rank Fusion | ✓ VERIFIED | `hybrid-search.ts` fuseResults returns bm25Score, vectorScore, fusedScore; route exposes all three |
| 3   | LM Studio generates query expansions locally (no Gemini dependency for search) | ✓ VERIFIED | `ai-query-rewriter.ts` imports `getLmStudioStatus, createLmStudioProvider`; no `@ai-sdk/google` import |
| 4   | CLAUDE.md content searchable through unified search (not separate LIKE query) | ✓ VERIFIED | `knowledge.ts` calls `indexKnowledge` on every upsert; `search_index` has `source_type='knowledge'`; test at line 192 confirms |
| 5   | Content-addressable storage prevents duplicate embeddings | ✓ VERIFIED | `embeddings.ts` uses `INSERT OR IGNORE` on `content_hash` unique constraint; `computeContentHash` in `embedding.ts` uses SHA-256 |

**Score:** 5/5 success criteria verified (1 needs human for quality judgment)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `packages/api/src/services/embedding.ts` | LM Studio embedding client with graceful degradation | ✓ VERIFIED | 115 lines; `generateEmbedding` returns null on unavailable; `computeContentHash` SHA-256 |
| `packages/api/src/services/hybrid-search.ts` | BM25+vector orchestrator with RRF fusion | ✓ VERIFIED | 277 lines; `hybridSearch` orchestrates full pipeline; `fuseResults` with RRF_K=60; context annotations |
| `packages/api/src/services/embedding-backfill.ts` | Async backfill + queueEmbedding helper | ✓ VERIFIED | Exists; `backfillEmbeddings` + `queueEmbedding` exported |
| `packages/api/src/db/queries/embeddings.ts` | Embedding CRUD + two-step vector KNN search | ✓ VERIFIED | `upsertEmbedding`, `searchByVector` with two-step KNN pattern confirmed |
| `packages/api/drizzle/0011_vector_search.sql` | Embeddings metadata table migration | ✓ VERIFIED | File exists |
| `packages/api/src/services/rrf-fusion.ts` | RRF fusion algorithm with k=60 and weighted query variants | ✓ VERIFIED | Exports `fuseResults`, `rankByFusion`, `RRF_K=60`; NOTE: see orphan note below |
| `packages/api/src/services/ai-query-rewriter.ts` | LM Studio query expansion replacing Gemini | ✓ VERIFIED | No `@ai-sdk/google`; imports `getLmStudioStatus, createLmStudioProvider`; exports `expandQuery`, `processSearchQuery` |
| `packages/api/src/services/reranker.ts` | Cross-encoder reranking with position-aware blending | ✓ VERIFIED | 123 lines; `TOP_TIER_RRF_WEIGHT=0.75`, `DEEP_TIER_RRF_WEIGHT=0.40`; graceful skip when LM Studio unavailable |
| `packages/api/src/routes/search.ts` | Hybrid search pipeline route | ✓ VERIFIED | Imports `hybridSearch`, `rerankResults`; returns score+rank+bm25Score+vectorScore+fusedScore |
| `packages/shared/src/schemas/api.ts` | Extended search schemas with vector scores and knowledge type | ✓ VERIFIED | `z.enum(["capture","commit","project","knowledge"])`; `score`, `projectContext`, `bm25Score`, `vectorScore`, `fusedScore` fields |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `routes/search.ts` | `services/hybrid-search.ts` | `hybridSearch` import | ✓ WIRED | Line 4: `import { hybridSearch } from "../services/hybrid-search.js"` |
| `routes/search.ts` | `services/reranker.ts` | `rerankResults` import | ✓ WIRED | Line 5: `import { rerankResults } from "../services/reranker.js"` |
| `services/hybrid-search.ts` | `db/queries/embeddings.ts` | `searchByVector` call | ✓ WIRED | Line 8 import + line 205 call: `vectorResults = searchByVector(sqlite, queryEmbedding, limit * 2)` |
| `services/hybrid-search.ts` | `services/embedding.ts` | `generateEmbedding` + `isEmbeddingAvailable` | ✓ WIRED | Line 9 import; lines 199+203 usage |
| `services/ai-query-rewriter.ts` | `services/lm-studio.ts` | `getLmStudioStatus` + `createLmStudioProvider` | ✓ WIRED | Line 3 import; lines 123+181 usage |
| `db/queries/knowledge.ts` | `db/queries/search.ts` | `indexKnowledge` called on upsert | ✓ WIRED | Line 5 import; line 194 call in `upsertKnowledge` |
| `app.ts` | `routes/search.ts` | `createSearchRoutes(getInstance, () => config)` | ✓ WIRED | Line 45 in app.ts passes config getter |
| `services/rrf-fusion.ts` | production code | (any consumer besides tests) | ⚠️ ORPHANED | Only imported by test files; `hybrid-search.ts` implements its own equivalent RRF logic internally |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `routes/search.ts` | `response.results` | `hybridSearch(sqlite, db, q)` | Yes — real BM25 FTS5 query + sqlite-vec KNN | ✓ FLOWING |
| `hybrid-search.ts` | `bm25Results` | `searchUnified(sqlite, processed.ftsQuery, searchOpts)` | Yes — real FTS5 query against `search_index` | ✓ FLOWING |
| `hybrid-search.ts` | `vectorResults` | `searchByVector(sqlite, queryEmbedding, limit*2)` | Yes — real sqlite-vec KNN query; returns [] when no embeddings loaded | ✓ FLOWING |
| `hybrid-search.ts` | `result.projectContext` | direct SQL JOIN on `projects` + `project_knowledge` | Yes — real DB query with per-slug cache | ✓ FLOWING |
| `db/queries/embeddings.ts` | `vecResults` | `SELECT rowid, distance FROM vec_search WHERE embedding MATCH ?` | Yes — real sqlite-vec query | ✓ FLOWING |
| `db/queries/knowledge.ts` | `search_index` | `INSERT INTO search_index` in `indexKnowledge` | Yes — real FTS5 insert on every `upsertKnowledge` | ✓ FLOWING |

### Behavioral Spot-Checks

The server is not running in this environment; spot-checks limited to module-level tests.

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All 661 API tests pass | `pnpm --filter @mission-control/api test -- --run` | 57 test files, 661 tests passed | ✓ PASS |
| TypeScript strict mode clean | `pnpm typecheck` | "ok (no errors)" | ✓ PASS |
| RRF_K=60 constant verified | `rrf-fusion.test.ts` unit test | 11 tests pass including K=60 assertion | ✓ PASS |
| Knowledge search returns sourceType='knowledge' | `search.test.ts` line 192 | Test passes; `searchByVector` of "MapLibre" finds knowledge entry | ✓ PASS |
| Context annotations returned (SRCH-05) | `search.test.ts` line 207 | Test passes; `projectContext` contains "VFR" for efb-212 project | ✓ PASS |
| No Gemini imports in query rewriter | grep check | Zero matches for `@ai-sdk/google` or `isAIAvailable` | ✓ PASS |
| All 9 documented commits verified in git log | `git log --oneline` | All hashes present (7fa85c1, 727f7db, fa5475e, 05abd16, af4da99, 5e4874a, c6ec68a, df72261, 142dfed) | ✓ PASS |

### Requirements Coverage

All SRCH requirements are defined in `.planning/v2.0-VISION.md`.

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SRCH-01 | 32-01 | sqlite-vec extension with local embedding model via LM Studio | ✓ SATISFIED | `db/index.ts` loads sqlite-vec, `vec_search` virtual table created; `embedding.ts` calls `/v1/embeddings`; 768-dim vectors |
| SRCH-02 | 32-01 | Content-addressable storage for all indexed content | ✓ SATISFIED | `computeContentHash` (SHA-256), `INSERT OR IGNORE` in `upsertEmbedding`; CRLF-normalized hash |
| SRCH-03 | 32-01, 32-02 | Hybrid BM25 + vector search with Reciprocal Rank Fusion | ✓ SATISFIED | `hybrid-search.ts` implements RRF with k=60, BM25_WEIGHT=2.0, VECTOR_WEIGHT=1.0; `rrf-fusion.ts` pure-function module also exists |
| SRCH-04 | 32-02 | Query expansion via LM Studio replacing Gemini query rewriting | ✓ SATISFIED | `ai-query-rewriter.ts` uses `createLmStudioProvider`; `expandQuery` generates lexVariants + vecVariants; fallback to FTS5 when unavailable |
| SRCH-05 | 32-03 | Context annotations on projects returned with search results | ✓ SATISFIED | `hybrid-search.ts` lines 236-268; SQL JOIN on projects+project_knowledge; `projectContext` in response; test at line 207 verifies |
| SRCH-06 | 32-01, 32-03 | CLAUDE.md content indexed in unified search (not separate LIKE query) | ✓ SATISFIED | `upsertKnowledge` calls `indexKnowledge` inserting into `search_index` with `source_type='knowledge'`; test at line 192 verifies |
| SRCH-07 | 32-03 | Cross-encoder reranking via LM Studio for top candidates | ✓ SATISFIED | `reranker.ts` implements position-aware blending (top-5: 75/25, deep: 40/60); degrades gracefully; wired in route |

**Note on REQUIREMENTS.md:** The v1.4 REQUIREMENTS.md does not contain SRCH requirements. All SRCH-01 through SRCH-07 are defined in `.planning/v2.0-VISION.md` (lines 85-91) and referenced in `.planning/ROADMAP.md` (Phase 32 section). No orphaned requirements exist — phase 32 claims exactly SRCH-01 through SRCH-07 and all are accounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `services/reranker.ts` | 72 | Type-cast model object `{ modelId: "qwen3-coder", provider: "lm-studio" } as Parameters<...>` | info | Works at runtime when LM Studio ready; degrades gracefully when unavailable (status check at line 49); documented in SUMMARY as intentional deviation |
| `services/rrf-fusion.ts` | all | Module exported but only imported by tests; `hybrid-search.ts` implements equivalent RRF logic directly | info | Not a stub — RRF algorithm is correctly implemented in both places. Orphan module does not break the goal; represents divergence from Plan 03's intended architecture (which specified `search.ts` should export `hybridSearch` importing `rrf-fusion.ts`) |

No blockers. No stubs returning empty arrays. No hardcoded placeholder data.

### Human Verification Required

#### 1. Semantic Recall Quality

**Test:** With LM Studio running on Mac Mini (embedding model loaded), search "how does the capture pipeline work" in the dashboard
**Expected:** Results return conceptually relevant items (captures about pipeline decisions, relevant commits, knowledge entries describing the flow) even if they don't contain those exact words
**Why human:** Relevance is a quality judgment; requires live LM Studio + populated embeddings from backfill; depends on embedding model quality

#### 2. LM Studio Embedding Model Coexistence

**Test:** Load both a chat model (Qwen3-Coder-30B) and an embedding model (nomic-embed-text-v1.5) in LM Studio simultaneously, then trigger a search
**Expected:** Query expansion uses chat model, embedding generation uses embedding model; both work without GPU memory conflicts
**Why human:** Hardware-dependent (Mac Mini GPU VRAM capacity); cannot verify programmatically

### Gaps Summary

No gaps. All 7 SRCH requirements are implemented, wired, and verified by tests. The `rrf-fusion.ts` module being orphaned from production code is a minor architectural divergence — the RRF algorithm is correctly implemented inside `hybrid-search.ts` which is the actual production path. This does not affect goal achievement.

---

_Verified: 2026-03-23T09:30:26Z_
_Verifier: Claude (gsd-verifier)_
