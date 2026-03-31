---
phase: 05-cross-repo-intelligence
plan: 01
subsystem: embeddings
tags: [sqlite-vec, voyage-ai, embeddings, cross-repo, knn-search]
dependency_graph:
  requires: [pipeline-orchestrator, findings-table, better-sqlite3]
  provides: [embedding-module, vec0-table, cross-repo-search, embedPipelineFindings]
  affects: [pipeline-orchestrator, db-client, test-db-helper]
tech_stack:
  added: [sqlite-vec@0.1.8, voyageai@0.2.1]
  patterns: [vec0-virtual-table, fire-and-forget-async, cosine-knn-search, post-query-filtering]
key_files:
  created:
    - packages/api/src/embeddings/client.ts
    - packages/api/src/embeddings/embed.ts
    - packages/api/src/embeddings/store.ts
    - packages/api/src/embeddings/search.ts
    - packages/api/src/embeddings/index.ts
    - packages/api/src/__tests__/embeddings.test.ts
    - packages/api/src/__tests__/cross-repo-search.test.ts
  modified:
    - packages/api/package.json
    - packages/api/src/db/client.ts
    - packages/api/src/lib/config.ts
    - packages/api/src/pipeline/orchestrator.ts
    - packages/api/src/__tests__/helpers/test-db.ts
decisions:
  - "Voyage AI voyage-code-3 as embedding provider (Anthropic has no embedding API; D-01 discrepancy resolved per research)"
  - "Float32Array passed as Uint8Array(buffer) to sqlite-vec (Pitfall 5 prevention)"
  - "voyageai module mocked globally in test-db.ts to avoid ESM directory import issues in test runner"
  - "Post-query JOIN for feedbackVote filtering (feedbackVote can change after embedding)"
metrics:
  duration: 8min
  completed: "2026-03-31T04:21:00Z"
  tasks: 2
  files: 12
  tests_added: 21
  tests_total: 166
---

# Phase 5 Plan 1: Embedding Infrastructure & Cross-Repo Search Summary

sqlite-vec vec0 virtual table with 1024-dim cosine distance, Voyage AI client singleton, fire-and-forget embedding after pipeline completion, KNN cross-repo search with repo exclusion and false positive filtering.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Embedding infrastructure -- deps, sqlite-vec loading, config, embedding module | `2655a5e`, `c43beab` | embeddings/*, client.ts, config.ts, test-db.ts |
| 2 | Wire embeddings into pipeline orchestrator and add integration tests | `d72b316` | orchestrator.ts, embeddings.test.ts, cross-repo-search.test.ts |

## What Was Built

### Embedding Module (5 files)
- **client.ts**: Voyage AI client singleton with graceful null fallback when VOYAGE_API_KEY not set
- **embed.ts**: `normalizeFindingText()` for structured embedding input, `embedTexts()` for batch Voyage API calls, `embedPipelineFindings()` as top-level orchestrator entry point
- **store.ts**: vec0 virtual table creation (`initVecTable`), single and batch insert operations with proper Float32Array buffer handling
- **search.ts**: `findCrossRepoMatches()` with KNN query, repo exclusion, cosine threshold filter, and false positive exclusion via findings table JOIN
- **index.ts**: Barrel exports

### Infrastructure Changes
- **sqlite-vec loaded at startup** in both production (`db/client.ts`) and test (`test-db.ts`)
- **voyageApiKey** added to config schema with `VOYAGE_API_KEY` env var
- **vec_findings virtual table** created at startup via `initVecTable()`
- **Pipeline orchestrator** calls `embedPipelineFindings()` as fire-and-forget after COMPLETED status

### Test Coverage
- 21 new tests across 2 test files
- sqlite-vec loading verification
- normalizeFindingText structured output (3 tests)
- vec0 table creation and insert operations (2 tests)
- KNN search: sorted distance, same-repo exclusion, threshold filtering, false positive exclusion (4 tests)
- Cross-repo search: above/below threshold, same-repo exclusion, false positives, top-k, distance field (6 tests)
- Integration: batch ingestion, metadata storage, failure handling, null client, empty findings (5 tests)
- All 166 tests passing (16 test files), zero regressions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] voyageai ESM directory import broken in Vitest**
- **Found during:** Task 1 GREEN phase
- **Issue:** The voyageai npm package has broken ESM directory imports that cause `Directory import not supported` errors when Vitest resolves modules
- **Fix:** Added global voyageai mock in test-db.ts setup file
- **Files modified:** packages/api/src/__tests__/helpers/test-db.ts
- **Commit:** c43beab

**2. [Rule 3 - Blocking] Float32Array.buffer not accepted directly by better-sqlite3**
- **Found during:** Task 1 GREEN phase
- **Issue:** better-sqlite3 does not accept ArrayBuffer directly; needs Uint8Array wrapper
- **Fix:** Used `new Uint8Array(embedding.buffer)` instead of `embedding.buffer` in store.ts
- **Files modified:** packages/api/src/embeddings/store.ts
- **Commit:** c43beab

**3. [Rule 1 - Bug] INSERT OR IGNORE does not suppress FK constraint violations**
- **Found during:** Task 2 integration tests
- **Issue:** SQLite's INSERT OR IGNORE does not catch FK constraint errors, causing test seed functions to fail
- **Fix:** Rewrote seed function to use explicit INSERT with proper IDs and ordering
- **Files modified:** packages/api/src/__tests__/embeddings.test.ts
- **Commit:** d72b316

## Known Stubs

None -- all functions are fully implemented with real logic. The Voyage AI client returns null when VOYAGE_API_KEY is not set, which is intentional graceful degradation (not a stub).

## Verification Results

```
Test Files  16 passed (16)
Tests       166 passed (166)
```

All acceptance criteria verified:
- sqlite-vec in package.json, sqliteVec.load in client.ts and test-db.ts
- voyageApiKey in config.ts with VOYAGE_API_KEY env var
- normalizeFindingText, vec_findings, distance_metric=cosine, float[1024] in embeddings module
- repo exclusion, feedbackVote filtering, CrossRepoMatch in search.ts
- embedPipelineFindings with .catch() in orchestrator.ts (fire-and-forget)
- embedPipelineFindings and findCrossRepoMatches exported from index.ts

## Self-Check: PASSED

All 7 created files verified on disk. All 3 commit hashes (2655a5e, c43beab, d72b316) found in git log.
