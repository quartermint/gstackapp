---
phase: 07-seam-cleanup
plan: 01
subsystem: pipeline
tags: [provider-abstraction, refactoring, config, tooling]

# Dependency graph
requires: []
provides:
  - "Provider-agnostic ToolDefinition[] in tools.ts (no Anthropic SDK import)"
  - "Standalone-capable config.ts with findProjectRoot() (no MONOREPO_ROOT)"
  - "Direct tool pass-through in stage-runner (no mapping layer)"
affects: [08-harness-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "findProjectRoot() walks up directory tree matching package.json name"
    - "Tool definitions use camelCase inputSchema (ToolDefinition interface)"
    - ".env loading with fallback chain: PROJECT_ROOT -> process.cwd()"

key-files:
  created:
    - packages/api/src/__tests__/config.test.ts
  modified:
    - packages/api/src/pipeline/tools.ts
    - packages/api/src/pipeline/stage-runner.ts
    - packages/api/src/__tests__/stage-runner.test.ts
    - packages/api/src/lib/config.ts

key-decisions:
  - "Export findProjectRoot() for testability and Phase 8 reuse"
  - "databasePath resolves relative to process.cwd() not PROJECT_ROOT for standalone operation"

patterns-established:
  - "findProjectRoot(): walk-up package.json name matching for package root discovery"
  - "ToolDefinition as canonical tool schema type (provider-agnostic)"

requirements-completed: [SEAM-01, SEAM-02]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 7 Plan 1: Seam Cleanup Summary

**Removed Anthropic SDK type leak from tools.ts and MONOREPO_ROOT hardcoding from config.ts, enabling standalone package extraction**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T18:30:20Z
- **Completed:** 2026-04-03T18:33:32Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- tools.ts returns ToolDefinition[] with camelCase inputSchema -- zero Anthropic SDK imports
- stage-runner.ts uses createSandboxTools() output directly without .map() translation
- config.ts uses findProjectRoot() to locate package root instead of hardcoded MONOREPO_ROOT
- .env loading has cwd fallback for standalone operation
- 2 new behavioral tests for findProjectRoot(), all 264 tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Decontaminate Anthropic types from tools.ts and simplify stage-runner.ts** - `2bc2a59` (refactor)
2. **Task 2 RED: Failing tests for findProjectRoot** - `e3be60c` (test)
3. **Task 2 GREEN: Implement findProjectRoot and replace MONOREPO_ROOT** - `4bd1d65` (feat)

## Files Created/Modified
- `packages/api/src/pipeline/tools.ts` - Provider-agnostic ToolDefinition[] return type, camelCase inputSchema
- `packages/api/src/pipeline/stage-runner.ts` - Direct tool assignment, removed .map() translation layer
- `packages/api/src/__tests__/stage-runner.test.ts` - Updated mock to use inputSchema
- `packages/api/src/lib/config.ts` - findProjectRoot() replaces MONOREPO_ROOT, .env fallback chain
- `packages/api/src/__tests__/config.test.ts` - NEW: 2 behavioral tests for findProjectRoot()

## Decisions Made
- Exported findProjectRoot() as named export for testability and Phase 8 harness reuse
- databasePath resolves relative to process.cwd() (not PROJECT_ROOT) so the package works standalone

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript errors in gemini.ts and openai.ts provider files (unrelated to this plan's changes, out of scope)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both coupling seams (SEAM-01, SEAM-02) are resolved
- tools.ts and config.ts are ready for extraction into @gstackapp/harness package (Phase 8)
- All 264 tests green, no regressions

---
*Phase: 07-seam-cleanup*
*Completed: 2026-04-03*
