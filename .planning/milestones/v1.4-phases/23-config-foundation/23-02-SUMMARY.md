---
phase: 23-config-foundation
plan: 02
subsystem: api
tags: [idempotency, sqlite, drizzle, hono, captures, offline-queue]

# Dependency graph
requires:
  - phase: 05-capture
    provides: "captures POST route, captures query module, search indexing"
provides:
  - "idempotency_keys table with Drizzle schema and migration"
  - "checkIdempotencyKey, storeIdempotencyKey, purgeExpiredKeys query functions"
  - "Idempotency-Key header handling on POST /api/captures"
affects: [29-ios-capture, cli-offline-queue]

# Tech tracking
tech-stack:
  added: []
  patterns: ["idempotency key pattern for safe retries on POST endpoints"]

key-files:
  created:
    - packages/api/src/db/queries/idempotency.ts
    - packages/api/drizzle/0008_idempotency.sql
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/drizzle/meta/_journal.json
    - packages/api/src/routes/captures.ts
    - packages/api/src/__tests__/routes/captures.test.ts

key-decisions:
  - "Idempotency key check before body validation to short-circuit early on retries"
  - "24-hour TTL for idempotency keys via purgeExpiredKeys (wired by downstream scan cycle)"

patterns-established:
  - "Idempotency pattern: check header -> return cached if exists -> create -> store key -> continue"

requirements-completed: [FOUND-01]

# Metrics
duration: 6min
completed: 2026-03-21
---

# Phase 23 Plan 02: Idempotency Keys Summary

**Server-side Idempotency-Key header support on POST /api/captures with Drizzle schema, migration, and TDD tests**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-21T15:30:50Z
- **Completed:** 2026-03-21T15:37:21Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Idempotency keys table with key (PK), capture_id, created_at columns and created_at index
- POST /api/captures deduplicates repeated submissions when Idempotency-Key header is present
- Backward compatible: requests without the header behave identically to before
- 5 new TDD tests covering normal creation, deduplication, backward compat, different keys, and case-insensitive headers
- purgeExpiredKeys function ready for downstream scan cycle integration (24h TTL)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create idempotency keys table schema, migration, and query module** - `bb8a2a6` (feat)
2. **Task 2 RED: Add failing idempotency tests** - `c8e0eb2` (test)
3. **Task 2 GREEN: Wire idempotency key handling into captures POST route** - `fd343c2` (feat)

## Files Created/Modified
- `packages/api/src/db/schema.ts` - Added idempotencyKeys table definition
- `packages/api/src/db/queries/idempotency.ts` - checkIdempotencyKey, storeIdempotencyKey, purgeExpiredKeys functions
- `packages/api/drizzle/0008_idempotency.sql` - CREATE TABLE and INDEX migration
- `packages/api/drizzle/meta/_journal.json` - Added idx 8 entry for 0008_idempotency migration
- `packages/api/src/routes/captures.ts` - Idempotency-Key header check before create, store after create
- `packages/api/src/__tests__/routes/captures.test.ts` - 5 new idempotency tests in dedicated describe block

## Decisions Made
- Idempotency key check runs before body validation to short-circuit early on retries (avoids unnecessary validation/creation work)
- 24-hour TTL for purge function matches standard idempotency key lifetime (configurable via parameter)
- No foreign key constraint from idempotency_keys.capture_id to captures.id to avoid cascading complications

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing typecheck failures in config.test.ts and health.test.ts from parallel agent (plan 23-01) work. These are out of scope for this plan and do not affect the idempotency implementation. All 493 API tests pass, all 76 web tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Idempotency infrastructure ready for iOS offline queue (Phase 29) to use Idempotency-Key headers on retries
- purgeExpiredKeys available for scan cycle integration in downstream phases
- All existing capture tests continue to pass (493 API tests, 76 web tests)

## Self-Check: PASSED

- All 3 created files exist on disk
- All 3 task commits verified in git log (bb8a2a6, c8e0eb2, fd343c2)
- 493 API tests passing, 76 web tests passing

---
*Phase: 23-config-foundation*
*Completed: 2026-03-21*
