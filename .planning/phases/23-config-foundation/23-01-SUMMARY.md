---
phase: 23-config-foundation
plan: 01
subsystem: api
tags: [zod, config, dependency-graph, cycle-detection, health-checks]

requires:
  - phase: none
    provides: existing config.ts and health.ts schemas
provides:
  - dependsOn field on projectEntrySchema and multiCopyEntrySchema
  - detectCycles() DFS function for circular dependency validation
  - healthCheckTypeEnum with dependency_impact, convention_violation, stale_knowledge
affects: [24-knowledge-aggregation, 25-reconciliation, 26-dependency-intelligence]

tech-stack:
  added: []
  patterns:
    - "DFS cycle detection on project dependency graph at config load time"
    - "Schema extension with optional().default([]) for backward-compatible new fields"

key-files:
  created: []
  modified:
    - packages/api/src/lib/config.ts
    - packages/shared/src/schemas/health.ts
    - packages/api/src/__tests__/lib/config.test.ts
    - packages/api/src/__tests__/db/queries/health.test.ts
    - packages/api/src/__tests__/services/session-service.test.ts
    - packages/api/src/__tests__/routes/budget.test.ts
    - packages/api/src/__tests__/routes/models.test.ts
    - packages/api/src/__tests__/routes/sessions.test.ts

key-decisions:
  - "dependsOn uses optional().default([]) for backward compatibility with existing mc.config.json"
  - "detectCycles uses DFS with inStack tracking, handles unknown slugs gracefully"

patterns-established:
  - "Config schema extensions use optional().default() to remain backward-compatible"
  - "Cycle detection runs post-parse, pre-return in loadConfig()"

requirements-completed: [FOUND-02, FOUND-03, INTEL-01]

duration: 10min
completed: 2026-03-21
---

# Phase 23 Plan 01: Config Foundation Summary

**dependsOn dependency declarations with DFS cycle detection on both config schemas, plus 3 new health check types for cross-project intelligence**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-21T15:30:52Z
- **Completed:** 2026-03-21T15:41:18Z
- **Tasks:** 1
- **Files modified:** 8

## Accomplishments
- Extended both projectEntrySchema and multiCopyEntrySchema with `dependsOn: z.array(z.string()).optional().default([])`
- Added `detectCycles()` exported function using DFS with inStack tracking for circular dependency detection
- Integrated cycle validation into `loadConfig()` -- throws with clear error message naming the cycle path
- Extended `healthCheckTypeEnum` with `dependency_impact`, `convention_violation`, `stale_knowledge`
- All 631 tests pass (493 API, 76 web, 28 MCP, 34 CLI), typecheck clean

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1 RED: Failing tests** - `914af08` (test)
2. **Task 1 GREEN: Implementation** - `42b41d9` (feat)

## Files Created/Modified
- `packages/shared/src/schemas/health.ts` - Added 3 new health check type enum values
- `packages/api/src/lib/config.ts` - Added dependsOn to both schemas, detectCycles function, cycle validation in loadConfig
- `packages/api/src/__tests__/lib/config.test.ts` - 12 new tests (dependsOn parsing, cycle detection)
- `packages/api/src/__tests__/db/queries/health.test.ts` - 4 new tests (new health check types)
- `packages/api/src/__tests__/services/session-service.test.ts` - Fixed ProjectConfigEntry type literals
- `packages/api/src/__tests__/routes/budget.test.ts` - Fixed ProjectConfigEntry type literal
- `packages/api/src/__tests__/routes/models.test.ts` - Fixed ProjectConfigEntry type literal
- `packages/api/src/__tests__/routes/sessions.test.ts` - Fixed ProjectConfigEntry type literal

## Decisions Made
- Used `optional().default([])` for dependsOn to maintain backward compatibility with existing mc.config.json files that don't have the field
- detectCycles handles unknown slugs in dependsOn gracefully (e.g., cross-config or external references) by treating them as leaf nodes with no outgoing edges

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed existing test type errors from schema extension**
- **Found during:** Task 1 GREEN (implementation)
- **Issue:** Adding `dependsOn` with `.optional().default([])` makes it required in the Zod output type. Four existing test files construct `ProjectConfigEntry` objects directly as type literals and TypeScript requires the field.
- **Fix:** Added `dependsOn: []` to all `ProjectConfigEntry` type literals in session-service.test.ts, budget.test.ts, models.test.ts, sessions.test.ts
- **Files modified:** 4 test files
- **Verification:** `pnpm typecheck` exits 0, all 631 tests pass
- **Committed in:** 42b41d9 (part of GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for type safety. Adding a field with `.default()` to a Zod schema changes the output type, requiring existing type-literal consumers to include it. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Config schemas ready for Phase 24-26 features that need dependency relationships
- Health check types ready for dependency_impact, convention_violation, stale_knowledge findings
- Existing mc.config.json files load without modification (backward compatible)

## Self-Check: PASSED

- All key files exist (config.ts, health.ts, test files, SUMMARY.md)
- Both commits verified (914af08 RED, 42b41d9 GREEN)
- Key content present (dependency_impact, detectCycles export, Circular dependency error)

---
*Phase: 23-config-foundation*
*Completed: 2026-03-21*
