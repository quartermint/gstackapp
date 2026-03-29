---
phase: 16-data-foundation
plan: 01
subsystem: database
tags: [drizzle, sqlite, zod, schemas, migrations]

# Dependency graph
requires: []
provides:
  - discoveries Drizzle table definition and migration
  - stars Drizzle table definition and migration
  - Discovery and Star Zod schemas in shared package
  - TypeScript types for discoveries and stars
  - mc.config.json discovery configuration schema
affects: [17-discovery-service, 18-star-sync, 19-discovery-ui, 21-star-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "discoveryConfigSchema with .default({}) for backward-compatible config extension"
    - "JSON text column for star topics, parsed to array in Zod schema"

key-files:
  created:
    - packages/api/drizzle/0007_discoveries_and_stars.sql
    - packages/shared/src/schemas/discovery.ts
    - packages/shared/src/schemas/star.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/api/drizzle/meta/_journal.json
    - packages/shared/src/types/index.ts
    - packages/shared/src/index.ts
    - packages/api/src/lib/config.ts

key-decisions:
  - "Hand-wrote migration SQL rather than generating via drizzle-kit, matching all prior migrations"
  - "Stars use githubId (integer) as primary key rather than nanoid, matching GitHub's numeric repo ID"
  - "Discovery config uses .default({}) so existing mc.config.json parses without changes"

patterns-established:
  - "discoveryConfigSchema nested in mcConfigSchema with .default({}) for backward-compatible config sections"
  - "Zod schemas include entity, create, update, list query, and ID schemas per domain"

requirements-completed: [DISC-02, STAR-02]

# Metrics
duration: 15min
completed: 2026-03-16
---

# Phase 16 Plan 01: Data Foundation Summary

**Drizzle discoveries + stars tables, Zod shared schemas, and mc.config.json discovery config extension with full backward compatibility**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-16T20:21:51Z
- **Completed:** 2026-03-16T20:37:28Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Two new SQLite tables (discoveries, stars) with indexes and unique constraints defined in Drizzle schema
- Migration 0007 hand-written matching existing migration patterns, journal updated
- Full Zod schema coverage in shared package: entity, create, update, list query, and ID schemas for both domains
- Config extended with discovery section (paths, scanInterval, githubOrgs, starSyncInterval) with backward-compatible defaults

## Task Commits

Each task was committed atomically:

1. **Task 1: Add discoveries and stars Drizzle tables + migration SQL** - `103917b` (feat)
2. **Task 2: Create discovery and star Zod schemas + TypeScript types in shared package** - `23bf3bd` (feat)
3. **Task 3: Extend mc.config.json schema with discovery and star configuration** - `abbd5da` (feat)

## Files Created/Modified
- `packages/api/src/db/schema.ts` - Added discoveries and stars table definitions
- `packages/api/drizzle/0007_discoveries_and_stars.sql` - Migration SQL for new tables
- `packages/api/drizzle/meta/_journal.json` - Journal entry idx 7
- `packages/shared/src/schemas/discovery.ts` - Discovery Zod schemas (host/status enums, entity, create, update, list, id)
- `packages/shared/src/schemas/star.ts` - Star Zod schemas (intent enum, entity, create, update, list, id)
- `packages/shared/src/types/index.ts` - TypeScript type exports for Discovery and Star domains
- `packages/shared/src/index.ts` - Barrel re-exports for all new schemas and types
- `packages/api/src/lib/config.ts` - discoveryConfigSchema and DiscoveryConfig type
- `packages/api/src/__tests__/lib/model-tier.test.ts` - Added discovery field to test fixture
- `packages/api/src/__tests__/routes/budget.test.ts` - Added discovery field to test fixture
- `packages/api/src/__tests__/routes/models.test.ts` - Added discovery field to test fixture
- `packages/api/src/__tests__/routes/sessions.test.ts` - Added discovery field to test fixture
- `packages/api/src/__tests__/services/session-service.test.ts` - Added discovery field to test fixture

## Decisions Made
- Hand-wrote migration SQL rather than using drizzle-kit generate, consistent with all prior migrations in the project
- Stars table uses githubId (integer) as primary key since GitHub assigns unique numeric IDs to repos
- Discovery config defaults to paths: ["~"], githubOrgs: ["quartermint", "sternryan"], scanIntervalMinutes: 60, starSyncIntervalHours: 6

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated test fixtures with discovery field**
- **Found during:** Task 3 (Config schema extension)
- **Issue:** 5 test files construct MCConfig objects inline without the new required discovery field, causing TS2741 errors
- **Fix:** Added discovery field with default values to all test fixtures
- **Files modified:** model-tier.test.ts, budget.test.ts, models.test.ts, sessions.test.ts, session-service.test.ts
- **Verification:** pnpm typecheck exits 0, all 462 tests pass
- **Committed in:** abbd5da (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discoveries and stars tables ready for service implementation (Phase 17, 18)
- Zod schemas ready for API route validation
- Config schema ready for discovery service to read scan paths and GitHub orgs
- Migration SQL ready to run on production database

## Self-Check: PASSED

All files exist. All commit hashes verified (103917b, 23bf3bd, abbd5da).

---
*Phase: 16-data-foundation*
*Completed: 2026-03-16*
