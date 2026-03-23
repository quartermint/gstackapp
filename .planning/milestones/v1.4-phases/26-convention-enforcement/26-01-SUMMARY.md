---
phase: 26-convention-enforcement
plan: 01
subsystem: api
tags: [zod, convention-scanner, health-findings, config-schema, vitest]

# Dependency graph
requires:
  - phase: 24-knowledge-aggregation
    provides: "Knowledge scan pipeline, content-hash caching, stale knowledge detection"
provides:
  - "Convention scanner pure function (checkConventions)"
  - "Config schema extension with convention rules and per-project overrides"
  - "Convention scanning pass integrated into scanAllKnowledge"
  - "5 launch convention rules in mc.config.json"
  - "getAllKnowledgeWithContent query"
affects: [27-mcp-knowledge-tools, dashboard-risk-feed]

# Tech tracking
tech-stack:
  added: []
  patterns: [config-driven-rule-engine, aggregated-health-findings, per-project-overrides]

key-files:
  created:
    - packages/api/src/services/convention-scanner.ts
    - packages/api/src/__tests__/services/convention-scanner.test.ts
  modified:
    - packages/api/src/lib/config.ts
    - packages/api/src/__tests__/lib/config.test.ts
    - packages/api/src/db/queries/knowledge.ts
    - packages/api/src/services/knowledge-aggregator.ts
    - packages/api/src/__tests__/services/knowledge-aggregator.test.ts
    - mc.config.json
    - infra/mc.config.mac-mini.json

key-decisions:
  - "Widen detectCycles parameter type to avoid requiring conventionOverrides on callers"
  - "Convention checks run on cached DB content via getAllKnowledgeWithContent (no re-read from disk)"
  - "Targeted SQL for convention resolution instead of resolveFindings to avoid side effects"
  - "resolveFindings calls changed to preserve convention_violation findings"

patterns-established:
  - "Config-driven rule engine: rules defined in JSON, validated by Zod, executed by pure functions"
  - "Aggregated findings: multiple violations per project collapsed into single HealthFindingInput"
  - "Per-project overrides: conventionOverrides array suppresses specific rule IDs"

requirements-completed: [KNOW-04, KNOW-05, KNOW-06]

# Metrics
duration: 14min
completed: 2026-03-21
---

# Phase 26 Plan 01: Convention Enforcement Summary

**Config-driven convention scanner with 5 launch rules detecting anti-patterns in CLAUDE.md files across 33 projects**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-21T17:34:14Z
- **Completed:** 2026-03-21T17:48:21Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Convention scanner pure function handles must_not_match, must_match, negativeContext, overrides, severity escalation, and aggregation into single HealthFindingInput
- Config schema extended with conventionRuleSchema (kebab-case id, pattern, description, negativeContext, severity, matchType) and per-project conventionOverrides
- Convention scanning pass integrated at end of scanAllKnowledge using cached DB content
- 5 launch rules configured: no-deprecated-models, no-stale-project-name, has-overview-section, no-todo-markers, no-secrets-in-docs
- resolveFindings calls fixed to preserve convention_violation findings (Pitfall 3 prevention)
- 565 API tests passing (up from 560), zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Config schema extension + convention scanner pure function** - `50cfb84` (feat)
2. **Task 2: Knowledge scan integration + launch rules + resolveFindings fix** - `df211b6` (feat)

_Note: Task 1 was TDD (test + implementation in single commit)_

## Files Created/Modified
- `packages/api/src/services/convention-scanner.ts` - Pure function rule engine: checkConventions()
- `packages/api/src/__tests__/services/convention-scanner.test.ts` - 20 unit tests covering all rule types and edge cases
- `packages/api/src/lib/config.ts` - conventionRuleSchema, conventionOverrides on project entries, conventions on config
- `packages/api/src/__tests__/lib/config.test.ts` - 6 config schema tests for conventions
- `packages/api/src/db/queries/knowledge.ts` - getAllKnowledgeWithContent query
- `packages/api/src/services/knowledge-aggregator.ts` - Convention scanning pass, resolveFindings fix
- `packages/api/src/__tests__/services/knowledge-aggregator.test.ts` - 5 integration tests
- `mc.config.json` - 5 launch convention rules
- `infra/mc.config.mac-mini.json` - 5 launch convention rules (mirror)
- `packages/api/src/__tests__/lib/model-tier.test.ts` - Added conventions field for type compat
- `packages/api/src/__tests__/services/session-service.test.ts` - Added conventionOverrides for type compat
- `packages/api/src/__tests__/routes/sessions.test.ts` - Added conventionOverrides for type compat
- `packages/api/src/__tests__/routes/models.test.ts` - Added conventionOverrides for type compat
- `packages/api/src/__tests__/routes/budget.test.ts` - Added conventionOverrides for type compat

## Decisions Made
- Widened detectCycles parameter type to `Array<{ slug: string; dependsOn?: string[] }>` to avoid requiring conventionOverrides on all callers
- Convention checks run on cached DB content via getAllKnowledgeWithContent (no re-reading from disk)
- Used targeted SQL for convention resolution instead of resolveFindings to avoid clearing other check types
- Changed resolveFindings calls from `[]` to `["convention_violation"]` to preserve convention findings during stale knowledge resolution

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added conventionOverrides to existing test fixtures**
- **Found during:** Task 1 (Config schema extension)
- **Issue:** Adding conventionOverrides with `.optional().default([])` made the Zod output type require the field. Existing test files constructing MCConfig/ProjectConfigEntry objects directly failed TypeScript compilation.
- **Fix:** Added `conventionOverrides: []` to project entries and `conventions: []` to MCConfig objects in 6 existing test files. Widened detectCycles parameter type.
- **Files modified:** model-tier.test.ts, session-service.test.ts, sessions.test.ts, models.test.ts, budget.test.ts, config.ts
- **Verification:** pnpm typecheck and pnpm test pass with zero errors
- **Committed in:** 50cfb84 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Type compatibility fix required for backward compatibility. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Convention scanner is integrated and ready for MCP knowledge tools (Phase 27)
- 5 launch rules will run on next knowledge scan cycle
- Violations will surface in existing risk feed via convention_violation health findings
- Per-project overrides ready for projects that need rule suppression

## Self-Check: PASSED

- All created files exist on disk
- Both task commits verified in git history (50cfb84, df211b6)
- SUMMARY.md created at expected path

---
*Phase: 26-convention-enforcement*
*Completed: 2026-03-21*
