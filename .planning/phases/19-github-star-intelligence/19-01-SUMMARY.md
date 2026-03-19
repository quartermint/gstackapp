---
phase: 19-github-star-intelligence
plan: 01
subsystem: api
tags: [github, stars, sqlite, drizzle, gh-cli, sync, upsert]

# Dependency graph
requires:
  - phase: 16-schema-config-migration
    provides: stars table schema and Zod schemas
provides:
  - Star database query module (CRUD, upsert, list with filters, pagination)
  - Star sync service (GitHub API fetch, rate limit guard, incremental sync)
  - Event bus star event types (star:synced, star:categorized)
affects: [19-02 star categorizer, 19-03 star routes/UI]

# Tech tracking
tech-stack:
  added: []
  patterns: [gh api --paginate with star+json Accept header, epoch-to-Date conversion for sql aggregates]

key-files:
  created:
    - packages/api/src/db/queries/stars.ts
    - packages/api/src/services/star-service.ts
    - packages/api/src/__tests__/db/queries/stars.test.ts
    - packages/api/src/__tests__/services/star-service.test.ts
  modified:
    - packages/api/src/services/event-bus.ts

key-decisions:
  - "sql max() aggregate bypasses Drizzle mode:timestamp conversion -- manually convert epoch seconds to Date"
  - "upsertStar onConflictDoUpdate excludes intent/aiConfidence/userOverride to preserve categorization"
  - "Rate limit threshold set to 500 remaining calls before aborting sync"
  - "Star fetch uses 120s timeout and 50MB maxBuffer for large star lists"

patterns-established:
  - "Star upsert pattern: persist metadata on conflict, preserve AI/user categorization fields"
  - "Incremental sync: compare starred_at against max in DB, only process newer entries"

requirements-completed: [STAR-01]

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 19 Plan 01: Star Sync Service & DB Query Layer Summary

**GitHub star sync via gh CLI with paginated fetch, rate limit guard, incremental sync, and upsert that preserves AI/user categorization**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T22:15:20Z
- **Completed:** 2026-03-16T22:21:09Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Star database query module with 7 exported functions (upsert, get, list, updateIntent, getUncategorized, getLatestStarredAt, getStarCount)
- Star sync service with GitHub API fetch, rate limit guard, incremental sync, and recurring timer
- 24 new tests across DB queries (14) and sync service (10), all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create star database query module** - `5f1fe2c` (feat)
2. **Task 2: Create star sync service** - `d9c552c` (feat)
3. **Task 3: Create star query and sync service tests** - `a091228` (test, bundled with 19-02 metadata by concurrent agent)

## Files Created/Modified
- `packages/api/src/db/queries/stars.ts` - Star CRUD queries with JSON topics serialization, upsert preserving categorization
- `packages/api/src/services/star-service.ts` - GitHub star sync with rate limit guard, incremental sync, event emission
- `packages/api/src/services/event-bus.ts` - Added star:synced and star:categorized event types
- `packages/api/src/__tests__/db/queries/stars.test.ts` - 14 DB query tests
- `packages/api/src/__tests__/services/star-service.test.ts` - 10 sync service tests (mocked gh CLI)

## Decisions Made
- sql `max()` aggregate returns raw epoch seconds from SQLite, bypassing Drizzle's `mode:"timestamp"` conversion. Fixed by manually converting `epoch * 1000` to Date.
- upsertStar's onConflictDoUpdate deliberately excludes intent, aiConfidence, and userOverride fields to prevent sync from overwriting AI or user categorization.
- Rate limit threshold set at 500 remaining API calls -- conservative to leave headroom for other gh CLI operations.
- fetchStarsFromGitHub uses 120s timeout and 50MB maxBuffer since paginated star lists can be large.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getLatestStarredAt returning raw epoch instead of Date**
- **Found during:** Task 3 (tests revealed sql max() returns raw number)
- **Issue:** `sql<Date | null>\`max()\`` returns epoch seconds, not Date object. syncStars called `.getTime()` on it, causing TypeError.
- **Fix:** Changed return type to `sql<number | null>`, manually convert with `new Date(epoch * 1000)`
- **Files modified:** packages/api/src/db/queries/stars.ts
- **Verification:** All 439 tests pass
- **Committed in:** a091228 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential bugfix for correct incremental sync. No scope creep.

## Issues Encountered
- Concurrent 19-02 executor picked up Task 3 files into its metadata commit (a091228). Files are correct at HEAD, no data loss.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Star sync service and DB queries are ready for Plan 02 (AI intent categorizer) and Plan 03 (routes + UI)
- Event bus supports star:synced and star:categorized events for SSE streaming
- No blockers

## Self-Check: PASSED

All 6 files verified present. All 3 commit hashes found. 439 tests passing.

---
*Phase: 19-github-star-intelligence*
*Completed: 2026-03-16*
