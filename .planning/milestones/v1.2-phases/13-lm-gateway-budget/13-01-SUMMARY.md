---
phase: 13-lm-gateway-budget
plan: 01
subsystem: api
tags: [zod, lm-studio, budget, drizzle, health-probe, tier-routing]

# Dependency graph
requires:
  - phase: 11-data-foundation
    provides: sessions table schema, model tier derivation, config schema
provides:
  - Budget Zod schemas (weeklyBudgetSchema, routingSuggestionSchema, budgetResponseSchema)
  - LM Studio Zod schemas (lmStudioHealthEnum, lmStudioStatusSchema, modelsResponseSchema)
  - LM Studio health probe service with three-state derivation and background polling
  - Budget service with weekly session counting, burn rate classification, tier routing suggestions
  - Config extension with budgetThresholds and lmStudio sections
affects: [13-02-routes, dashboard-budget-widget, session-hook-response]

# Tech tracking
tech-stack:
  added: []
  patterns: [module-level-cache-probe, keyword-based-tier-routing, epoch-seconds-comparison]

key-files:
  created:
    - packages/shared/src/schemas/budget.ts
    - packages/shared/src/schemas/models.ts
    - packages/api/src/services/lm-studio.ts
    - packages/api/src/services/budget-service.ts
    - packages/api/src/__tests__/services/lm-studio.test.ts
    - packages/api/src/__tests__/services/budget-service.test.ts
  modified:
    - packages/shared/src/index.ts
    - packages/shared/src/types/index.ts
    - packages/api/src/lib/config.ts
    - packages/api/src/__tests__/lib/model-tier.test.ts
    - packages/api/src/__tests__/routes/sessions.test.ts
    - packages/api/src/__tests__/services/session-service.test.ts

key-decisions:
  - "Budget thresholds and LM Studio config use .default({}) for backward compatibility with existing mc.config.json"
  - "LM Studio probe uses partial case-insensitive matching for target model (includes not equals)"
  - "Budget epoch comparison uses Math.floor(weekStart.getTime() / 1000) to match Drizzle integer timestamp mode"
  - "Tier routing keyword matching iterates in order: opus, sonnet, local -- first match wins"
  - "suggestTier returns null for low burn rate (no suggestions when usage is healthy)"

patterns-established:
  - "Module-level cache with background interval probe (same as project-scanner)"
  - "AbortController with 5s timeout for external HTTP probes"
  - "getWeekStart walks backward from now to resetDay, sets midnight UTC"
  - "Tier keyword map as const Record for routing suggestions"

requirements-completed: [GATE-01, GATE-02, BUDG-02, BUDG-03, BUDG-04]

# Metrics
duration: 6min
completed: 2026-03-16
---

# Phase 13 Plan 01: LM Gateway + Budget Core Services Summary

**LM Studio three-state health probe with module-level cache, budget service computing weekly session counts by tier with configurable burn rate thresholds and keyword-based routing suggestions**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T15:27:50Z
- **Completed:** 2026-03-16T15:33:52Z
- **Tasks:** 2
- **Files modified:** 12 (6 created, 6 modified)

## Accomplishments
- Shared Zod schemas for budget (burn rate, weekly counts, routing suggestions) and LM Studio (health enum, status, models response)
- Config schema extended with budgetThresholds (opus hot/moderate thresholds, week reset day) and lmStudio (URL, target model, probe interval) -- backward-compatible
- LM Studio health probe derives three-state health from /v1/models endpoint with 5-second timeout and module-level cache
- Budget service queries sessions table for weekly tier counts, classifies burn rate, generates keyword-based tier routing suggestions
- 20 new tests covering all probe states, budget calculations, and routing edge cases
- All 352 API tests + 68 web tests pass, typecheck clean across all packages

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared schemas + config extension** - `89f0b8a` (feat)
2. **Task 2: LM Studio health probe and budget service** - `e3efbe8` (feat, TDD)

## Files Created/Modified
- `packages/shared/src/schemas/budget.ts` - Budget Zod schemas with burnRateEnum, weeklyBudgetSchema (isEstimated: z.literal(true)), routingSuggestionSchema, budgetResponseSchema
- `packages/shared/src/schemas/models.ts` - LM Studio Zod schemas with lmStudioHealthEnum, lmStudioStatusSchema, modelsResponseSchema
- `packages/shared/src/index.ts` - Re-exports all new schemas and types
- `packages/shared/src/types/index.ts` - Type aliases for all new schemas
- `packages/api/src/lib/config.ts` - Extended mcConfigSchema with budgetThresholds and lmStudio sub-schemas
- `packages/api/src/services/lm-studio.ts` - Health probe with probeLmStudio, getLmStudioStatus, startLmStudioProbe
- `packages/api/src/services/budget-service.ts` - Weekly budget with getWeekStart, getWeeklyBudget, suggestTier
- `packages/api/src/__tests__/services/lm-studio.test.ts` - 7 tests for probe states, timeout, cache, interval
- `packages/api/src/__tests__/services/budget-service.test.ts` - 13 tests for week start, budget counts, burn rate, routing
- `packages/api/src/__tests__/lib/model-tier.test.ts` - Updated with new config fields
- `packages/api/src/__tests__/routes/sessions.test.ts` - Updated with new config fields
- `packages/api/src/__tests__/services/session-service.test.ts` - Updated with new config fields

## Decisions Made
- Budget thresholds and LM Studio config use `.default({})` for backward compatibility
- LM Studio probe uses partial case-insensitive matching (`.includes()`) for target model identification
- Budget epoch comparison uses `Math.floor(weekStart.getTime() / 1000)` to match Drizzle integer timestamp mode (epoch seconds)
- Tier routing keyword matching iterates in order: opus, sonnet, local -- first match wins
- `suggestTier` returns null for low burn rate (no suggestions when usage is healthy)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added new config fields to existing test fixtures**
- **Found during:** Task 1 (Schema + config extension)
- **Issue:** Three existing test files construct `MCConfig` objects as typed literals without the new `budgetThresholds` and `lmStudio` fields, causing TypeScript errors
- **Fix:** Added default values for both new fields to all test config objects
- **Files modified:** `packages/api/src/__tests__/lib/model-tier.test.ts`, `packages/api/src/__tests__/routes/sessions.test.ts`, `packages/api/src/__tests__/services/session-service.test.ts`
- **Verification:** `pnpm typecheck` passes, all 332 existing tests still pass
- **Committed in:** `89f0b8a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Essential for typecheck to pass. No scope creep.

## Issues Encountered
- TDD RED phase could not be committed separately because pre-commit hook runs full build/test suite, which fails on missing source files. Combined RED+GREEN into single commit with tests and implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All schemas, config, and services ready for Plan 02 (routes + integration)
- Plan 02 can consume `probeLmStudio`, `getLmStudioStatus`, `startLmStudioProbe` from lm-studio service
- Plan 02 can consume `getWeeklyBudget`, `suggestTier` from budget service
- Config backward-compatible -- no changes needed to existing mc.config.json

---
## Self-Check: PASSED

- All 6 created files exist on disk
- Both task commits verified (89f0b8a, e3efbe8)
- 352 API tests + 68 web tests passing
- Typecheck clean across all 4 packages

---
*Phase: 13-lm-gateway-budget*
*Completed: 2026-03-16*
