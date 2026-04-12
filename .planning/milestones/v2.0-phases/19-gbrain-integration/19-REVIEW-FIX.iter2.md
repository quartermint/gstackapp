---
phase: 19-gbrain-integration
fixed_at: 2026-04-11T12:10:00Z
review_path: .planning/phases/19-gbrain-integration/19-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-04-11T12:10:00Z
**Source review:** .planning/phases/19-gbrain-integration/19-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (4 warnings)
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Race condition -- prefetch fires then cache is read immediately

**Files modified:** `packages/api/src/routes/operator.ts`
**Commit:** fdccbba
**Applied fix:** Removed the dead `getGbrainCache()` call that would always return null (prefetch is still in-flight). Set `gbrainContext` directly to `null` with an explicit comment documenting that the first clarification question intentionally runs without gbrain context, and subsequent `clarify-answer` calls pick up the cached result.

### WR-02: Cache insert throws on duplicate requestId

**Files modified:** `packages/api/src/gbrain/cache.ts`
**Commit:** 205b194
**Applied fix:** Added `.onConflictDoUpdate()` targeting `gbrainCache.requestId` so duplicate inserts (retry scenarios, concurrent calls) upsert instead of throwing a unique constraint violation. Updates `available`, `searchResults`, `entities`, and `fetchedAt` on conflict.

### WR-03: Retry-timeout path drops gbrain knowledgeContext

**Files modified:** `packages/api/src/routes/operator.ts`
**Commit:** ae5de77
**Applied fix:** Added `getGbrainCache(requestId)` call before `spawnPipeline` in the timeout-retry path, passing `knowledgeContext` when available -- matching the approve-brief pattern.

### WR-04: Provider-exhaustion retry path also drops gbrain knowledgeContext

**Files modified:** `packages/api/src/routes/operator.ts`
**Commit:** ae5de77
**Applied fix:** Same pattern as WR-03 -- added `getGbrainCache(requestId)` call before `spawnPipeline` in the `/:requestId/retry` route, passing `knowledgeContext` when available.

---

_Fixed: 2026-04-11T12:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
