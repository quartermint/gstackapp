---
phase: 38-bella-client
plan: 01
subsystem: api
tags: [user-identity, capture, zod, drizzle, config, tailscale]

# Dependency graph
requires: []
provides:
  - "captureSourceTypeEnum with 'bella' value for Bella capture attribution"
  - "MCUser type and userSchema for config-driven user registry"
  - "resolveUser function for Tailscale header, dev header, and default user resolution"
  - "Migration 0016 for Drizzle journal consistency"
affects: [38-02, 38-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config-driven user registry (not hardcoded) with MCUser type"
    - "Pure function user resolution with headers-like interface for testability"
    - "Tailscale-User-Login header as primary identity signal"

key-files:
  created:
    - packages/api/src/lib/user-identity.ts
    - packages/api/src/__tests__/lib/user-identity.test.ts
    - packages/api/drizzle/0016_bella_source_type.sql
    - packages/api/drizzle/meta/0016_snapshot.json
  modified:
    - packages/shared/src/schemas/capture.ts
    - packages/api/src/db/schema.ts
    - packages/api/src/lib/config.ts
    - packages/api/drizzle/meta/_journal.json

key-decisions:
  - "resolveUser takes headers-like object (not Hono Context) for pure testability"
  - "Default user is hardcoded 'ryan' when registry is empty, first owner when registry has entries"
  - "users field uses optional().default([]) for backward compatibility with existing mc.config.json"

patterns-established:
  - "User identity resolution: Tailscale header > X-MC-User header > default owner"
  - "MCUser type shared between config and identity modules via re-export"

requirements-completed: [BELLA-03, BELLA-05, BELLA-09]

# Metrics
duration: 14min
completed: 2026-03-23
---

# Phase 38 Plan 01: User Identity & Bella Source Type Summary

**Config-driven user registry with Tailscale identity resolution and 'bella' capture source type for multi-user attribution**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-23T15:23:56Z
- **Completed:** 2026-03-23T15:38:48Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments
- Extended captureSourceTypeEnum and Drizzle schema to accept "bella" source type for Bella captures
- Added config-driven user registry (MCUser type with id, displayName, role, tailscaleLogin) to MCConfig
- Created resolveUser service with 3-tier resolution: Tailscale header, dev header fallback, default owner
- 9 new tests for user identity, 4 new tests for user registry schema, 927 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend capture source type and config user registry** - `7101aad` (feat)
2. **Task 2: User identity service with tests** - `4ca1799` (feat)

## Files Created/Modified
- `packages/shared/src/schemas/capture.ts` - Added "bella" to captureSourceTypeEnum
- `packages/api/src/db/schema.ts` - Added "bella" to Drizzle sourceType enum
- `packages/api/src/lib/config.ts` - Added userSchema, MCUser type, and users array to mcConfigSchema
- `packages/api/src/lib/user-identity.ts` - resolveUser function with Tailscale/dev/default resolution
- `packages/api/src/__tests__/lib/user-identity.test.ts` - 9 tests for user identity resolution
- `packages/api/src/__tests__/lib/config.test.ts` - 4 tests for users registry schema
- `packages/api/drizzle/0016_bella_source_type.sql` - No-op migration for journal consistency
- `packages/api/drizzle/meta/_journal.json` - Added entry 16
- `packages/api/drizzle/meta/0016_snapshot.json` - Minimal snapshot for migration 16
- 8 existing test files updated with `users: []` for MCConfig type compatibility

## Decisions Made
- resolveUser takes a headers-like interface `{ get(name: string): string | undefined }` rather than Hono Context directly, making it a pure function that's trivially testable without HTTP request mocking
- Default user is hardcoded as `{ id: "ryan", displayName: "Ryan", role: "owner" }` when no registry is configured, but when a registry exists the first user with role "owner" is the default
- users field in mcConfigSchema uses `optional().default([])` for full backward compatibility with existing mc.config.json files that don't have a users key

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added users: [] to existing test files for MCConfig type compatibility**
- **Found during:** Task 1 (config schema extension)
- **Issue:** Adding `users` field with `.default([])` to mcConfigSchema made it required in TypeScript's inferred output type, causing type errors in 8 existing test files that manually construct MCConfig objects
- **Fix:** Added `users: []` to all MCConfig object literals in affected test files
- **Files modified:** model-tier.test.ts, budget.test.ts, intelligence.test.ts, intelligence-insights.test.ts, knowledge.test.ts, models.test.ts, sessions.test.ts, session-service.test.ts, knowledge-aggregator.test.ts
- **Verification:** pnpm typecheck passes, all 927 tests pass
- **Committed in:** 7101aad (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- User identity service ready for Plan 02 (chat backend) to wire into Hono middleware
- Bella source type ready for capture attribution in chat endpoint
- Config user registry ready for mc.config.json population

---
*Phase: 38-bella-client*
*Completed: 2026-03-23*
