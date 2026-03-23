---
phase: quick
plan: 260323-iru
subsystem: api, web
tags: [tech-debt, v2.0, hybrid-search, captures, cleanup]
dependency_graph:
  requires: [v2.0 phases 32-38]
  provides: [searchMC hybrid pipeline, captures extraction API, clean dead code]
  affects: [chat-tools, captures query, insight-generator, web capture-card]
tech_stack:
  added: []
  patterns: [batch query instead of N+1, API object return instead of JSON.stringify]
key_files:
  created: []
  modified:
    - packages/api/src/services/chat-tools.ts
    - packages/api/src/db/queries/captures.ts
    - packages/api/src/routes/captures.ts
    - packages/api/src/services/insight-generator.ts
    - packages/web/src/hooks/use-captures.ts
    - packages/web/src/components/capture/capture-card.tsx
    - packages/api/src/__tests__/services/insight-generator.test.ts
  deleted:
    - packages/api/src/services/rrf-fusion.ts
    - packages/api/src/__tests__/services/rrf-fusion.test.ts
    - packages/web/src/components/digest/daily-digest.tsx
decisions:
  - "Batch IN query in listCaptures replaces N+1 getExtractionsByCapture in route"
  - "CaptureItem.extractions typed as object array (not JSON string) end-to-end"
  - "capture-card maps extractionType/content to Extraction type/text fields"
metrics:
  duration: 34min
  completed: "2026-03-23"
  tasks: 5
  files_modified: 10
  files_deleted: 3
---

# Quick Task 260323-iru: Fix All Functional Tech Debt from v2.0 Audit

Wired searchMC to hybridSearch pipeline, batch-optimized captures extraction query, deleted 3 orphaned files, aligned stale threshold to 14 days.

## Task Results

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | Wire searchMC to hybridSearch | `9b5d019` | Replaced searchUnified with hybridSearch in chat-tools.ts; Bella now gets vector+BM25+RRF results with projectContext |
| 2 | Batch-fetch extractions in listCaptures | `0722e1c` | Moved extraction fetch from N+1 route calls to single batch IN query in captures.ts; route passthrough |
| 3 | Delete orphaned rrf-fusion.ts | `cb85e5a` | Removed dead code (48 lines) and its test (161 lines); RRF logic lives in hybrid-search.ts |
| 4 | Align stale capture threshold to 14 days | `4b28d56` | STALE_CAPTURE_DAYS 7->14 in insight-generator; aligned with getStaleCaptures default |
| 5 | Delete orphaned DailyDigestPanel | `30baf64` | Removed daily-digest.tsx (229 lines); DigestStripView is the sole digest renderer |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CaptureItem.extractions type mismatch (Task 5)**
- **Found during:** Task 5 (typecheck after deleting daily-digest.tsx)
- **Issue:** Task 2 changed the API to return extraction objects directly (instead of JSON.stringify), but the CaptureItem interface in use-captures.ts still typed `extractions` as `string | null`. This caused 4 TypeScript errors in use-captures.ts.
- **Fix:** Updated CaptureItem.extractions to typed object array; updated capture-card.tsx to map `extractionType`->`type` and `content`->`text` for ExtractionBadges.
- **Files modified:** packages/web/src/hooks/use-captures.ts, packages/web/src/components/capture/capture-card.tsx
- **Commit:** 30baf64

**2. [Rule 1 - Bug] Insight generator test seeds too young for 14-day threshold (Task 4)**
- **Found during:** Task 4 verification
- **Issue:** Test data used daysAgo(10), daysAgo(8) which are not stale at 14-day threshold. generateAllInsights integration test also seeded daysAgo(10).
- **Fix:** Updated all test seeds to daysAgo(20/16/30) to match new 14-day threshold.
- **Files modified:** packages/api/src/__tests__/services/insight-generator.test.ts
- **Commit:** 4b28d56

**3. [Rule 2 - Missing] Route still had N+1 extraction fetching after Task 2 (Task 2)**
- **Found during:** Task 2 (plan said route needs no changes, but it did)
- **Issue:** The captures route already had per-capture getExtractionsByCapture calls. Adding batch fetch to listCaptures without removing route-level fetching would duplicate work.
- **Fix:** Simplified route to passthrough listCaptures result directly; removed unused getExtractionsByCapture import.
- **Files modified:** packages/api/src/routes/captures.ts
- **Commit:** 0722e1c

## Verification

- `pnpm typecheck`: Zero errors across all 5 packages
- `pnpm test`: 1042 tests pass (929 API + 113 web) -- 11 rrf-fusion tests intentionally removed
- `pnpm build`: Clean build, web bundle 388.90 KB (main) + 139.01 KB (bella) + 21.35 KB (graph)

## Known Stubs

None -- all changes wire real data flows end-to-end.

## Self-Check: PASSED

All created/modified files verified. All 5 commit hashes confirmed in git log.
