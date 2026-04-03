---
phase: 08-harness-package-extraction
plan: 02
subsystem: api
tags: [harness, providers, workspace, imports, refactor]

# Dependency graph
requires:
  - phase: 08-harness-package-extraction plan 01
    provides: "@gstackapp/harness package with providers, registry, config, CLI"
provides:
  - "api package consuming @gstackapp/harness for all provider functionality"
  - "Zero provider code duplication between api and harness"
affects: [09-model-failover-router, 10-tool-name-adapters]

# Tech tracking
tech-stack:
  added: []
  patterns: ["workspace dependency via npm workspaces for @gstackapp/harness"]

key-files:
  created: []
  modified:
    - packages/api/src/pipeline/stage-runner.ts
    - packages/api/src/pipeline/tools.ts
    - packages/api/package.json
    - packages/api/tsconfig.json
    - packages/api/src/__tests__/stage-runner.test.ts

key-decisions:
  - "Used npm '*' dependency format instead of pnpm 'workspace:*' for harness reference"

patterns-established:
  - "Workspace packages imported via @gstackapp/harness (not relative paths)"

requirements-completed: [PKG-05]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 08 Plan 02: API Import Rewiring Summary

**Rewired all api provider imports to @gstackapp/harness, deleted old providers/ directory, 265 tests pass across both workspaces**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T19:00:14Z
- **Completed:** 2026-04-03T19:03:07Z
- **Tasks:** 2
- **Files modified:** 15 (5 modified, 9 deleted, 1 lockfile)

## Accomplishments
- Rewired stage-runner.ts, tools.ts imports from `./providers` to `@gstackapp/harness`
- Removed @anthropic-ai/sdk, @google/generative-ai, openai from api dependencies (now harness's deps)
- Deleted 5 provider source files and 4 provider test files from api
- Updated test mocks from `../pipeline/providers` to `@gstackapp/harness`
- All 265 tests pass (230 api + 35 harness)

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire api imports to @gstackapp/harness and delete old providers/ directory** - `03f3edc` (feat)
2. **Task 2: Update api test mocks and verify full test suite passes** - `ac7b6fc` (test)

## Files Created/Modified
- `packages/api/src/pipeline/stage-runner.ts` - Imports resolveModel, ContentBlock, ConversationMessage, ToolResultBlock from @gstackapp/harness
- `packages/api/src/pipeline/tools.ts` - Imports ToolDefinition from @gstackapp/harness
- `packages/api/package.json` - Added @gstackapp/harness dep, removed SDK deps
- `packages/api/tsconfig.json` - Added harness to project references
- `packages/api/src/__tests__/stage-runner.test.ts` - Updated vi.mock path to @gstackapp/harness

## Files Deleted
- `packages/api/src/pipeline/providers/anthropic.ts` - Moved to harness
- `packages/api/src/pipeline/providers/gemini.ts` - Moved to harness
- `packages/api/src/pipeline/providers/openai.ts` - Moved to harness
- `packages/api/src/pipeline/providers/index.ts` - Moved to harness
- `packages/api/src/pipeline/providers/types.ts` - Moved to harness
- `packages/api/src/__tests__/providers/anthropic.test.ts` - Moved to harness
- `packages/api/src/__tests__/providers/gemini.test.ts` - Moved to harness
- `packages/api/src/__tests__/providers/openai.test.ts` - Moved to harness
- `packages/api/src/__tests__/providers/index.test.ts` - Moved to harness

## Decisions Made
- Used npm `"*"` dependency format instead of pnpm `"workspace:*"` -- npm workspaces doesn't support the workspace: protocol

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed workspace dependency format**
- **Found during:** Task 1 (package.json update)
- **Issue:** Plan specified `"workspace:*"` format which is pnpm-only; npm install failed with EUNSUPPORTEDPROTOCOL
- **Fix:** Changed to `"*"` which npm workspaces resolves correctly to the local package
- **Files modified:** packages/api/package.json
- **Verification:** npm install succeeded, workspace link confirmed in node_modules/@gstackapp/
- **Committed in:** 03f3edc (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Minor format fix for npm compatibility. No scope creep.

## Issues Encountered
- Pre-existing TS error in `packages/api/src/routes/onboarding.ts` (missing OnboardingStep export from @gstackapp/shared) -- unrelated to this plan, not addressed.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all imports are wired to real harness exports.

## Next Phase Readiness
- Phase 08 complete: @gstackapp/harness extracted and api fully consuming it
- Ready for Phase 09 (model failover router) and Phase 10 (tool name adapters)
- Both phases can proceed in parallel since they extend harness independently

---
*Phase: 08-harness-package-extraction*
*Completed: 2026-04-03*
