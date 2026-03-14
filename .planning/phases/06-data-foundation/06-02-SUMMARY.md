---
phase: 06-data-foundation
plan: 02
subsystem: database
tags: [drizzle, sqlite, tdd, vitest, upsert, health, copies, config]

# Dependency graph
requires:
  - phase: 06-data-foundation-plan-01
    provides: Drizzle table definitions (projectHealth, projectCopies), Zod health schemas, multi-host config schema
provides:
  - Health finding query functions (upsert, resolve, getActive, getRiskLevel) with detectedAt preservation
  - Project copy query functions (upsert, getByProject, getByRemoteUrl)
  - Config schema backward-compatibility tests
  - 31 unit tests covering all query and schema behaviors
affects: [07-git-health-engine, 08-health-api]

# Tech tracking
tech-stack:
  added: []
  patterns: [transactional SELECT-then-UPDATE/INSERT for conditional upsert with field preservation, onConflictDoUpdate with composite unique target for unconditional upsert, JSON metadata serialization in text columns]

key-files:
  created:
    - packages/api/src/db/queries/health.ts
    - packages/api/src/db/queries/copies.ts
    - packages/api/src/__tests__/db/queries/health.test.ts
    - packages/api/src/__tests__/db/queries/copies.test.ts
    - packages/api/src/__tests__/lib/config.test.ts
  modified:
    - packages/api/src/lib/config.ts

key-decisions:
  - "Used raw better-sqlite3 transactions for health upsert instead of Drizzle onConflictDoUpdate -- SQLite cannot target partial unique indexes in ON CONFLICT"
  - "Metadata stored as JSON text column, parsed on read -- avoids complex metadata table while keeping flexibility"
  - "Risk level 'unmonitored' not computed by getProjectRiskLevel -- deferred to API/scanner layer for GitHub-only projects"

patterns-established:
  - "Transactional SELECT-then-UPDATE/INSERT: use when upsert needs conditional WHERE (e.g., resolved_at IS NULL) that SQLite ON CONFLICT cannot express"
  - "Standard onConflictDoUpdate: use when unique constraint is unconditional (e.g., slug+host)"
  - "Config schema exports: projectEntrySchema, projectConfigEntrySchema, mcConfigSchema now exported for testing"

requirements-completed: [HLTH-09, HLTH-10, COPY-02]

# Metrics
duration: 5min
completed: 2026-03-14
---

# Phase 6 Plan 02: Query Functions Summary

**TDD health finding upsert with detectedAt preservation, project copy CRUD, and config schema backward-compatibility tests**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-14T15:17:38Z
- **Completed:** 2026-03-14T15:23:04Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Health finding upsert correctly preserves original detectedAt timestamp on re-detection, using transactional SELECT-then-UPDATE/INSERT pattern
- Project copy upsert deduplicates by (slug, host) with all-field updates, enabling multi-host discovery via getCopiesByRemoteUrl
- Config schema tests verify backward compatibility with existing single-host entries and forward compatibility with multi-host entries
- 31 new tests: 14 health query, 7 copy query, 10 config schema

## Task Commits

Each task was committed atomically:

1. **Task 1: TDD health finding query functions** - `e2ac277` (feat)
2. **Task 2: TDD project copy queries and config schema tests** - `bfacc4e` (feat)

## Files Created/Modified
- `packages/api/src/db/queries/health.ts` - Health finding CRUD: upsertHealthFinding, resolveFindings, getActiveFindings, getProjectRiskLevel
- `packages/api/src/db/queries/copies.ts` - Project copy CRUD: upsertCopy, getCopiesByProject, getCopiesByRemoteUrl
- `packages/api/src/__tests__/db/queries/health.test.ts` - 14 tests covering upsert semantics, resolution, re-detection, risk level
- `packages/api/src/__tests__/db/queries/copies.test.ts` - 7 tests covering copy upsert, deduplication, remote URL queries
- `packages/api/src/__tests__/lib/config.test.ts` - 10 tests covering single-host, multi-host, mixed arrays, backward compatibility
- `packages/api/src/lib/config.ts` - Added exports for projectEntrySchema, projectConfigEntrySchema, mcConfigSchema

## Decisions Made
- Used raw better-sqlite3 transactions for health upsert instead of Drizzle's onConflictDoUpdate -- SQLite does not support partial unique indexes (WHERE resolved_at IS NULL) in ON CONFLICT targets, making explicit SELECT-then-UPDATE/INSERT the correct approach
- Metadata stored as JSON string in text column, parsed to object on read via JSON.parse -- simple, flexible, matches existing codebase patterns
- getProjectRiskLevel maps info severity to "healthy" (not its own risk level) -- info findings are informational, not actionable risk

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported config schemas for testing**
- **Found during:** Task 2 (config schema tests)
- **Issue:** `projectEntrySchema`, `projectConfigEntrySchema`, and `mcConfigSchema` were not exported from config.ts. Tests could not import them.
- **Fix:** Added `export` keyword to all three schema declarations
- **Files modified:** packages/api/src/lib/config.ts
- **Verification:** Config tests pass, `pnpm typecheck` clean
- **Committed in:** bfacc4e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for testability. No scope creep -- schemas were already public types, just missing the export keyword.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All health query functions ready for Phase 7 git health scanner to call
- upsertHealthFinding and resolveFindings provide the scan-cycle write pattern
- getCopiesByRemoteUrl enables multi-host copy discovery
- getProjectRiskLevel available for Phase 8 health API endpoints
- Config schema tested and ready for multi-host entries in mc.config.json

## Self-Check: PASSED

All artifacts verified:
- 5/5 key files exist on disk
- 2/2 task commits found in git log

---
*Phase: 06-data-foundation*
*Completed: 2026-03-14*
