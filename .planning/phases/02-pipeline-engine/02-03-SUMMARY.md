---
phase: 02-pipeline-engine
plan: 03
subsystem: pipeline
tags: [claude-api, tool-use, promise-allsettled, anthropic-sdk, stage-runner, orchestrator]

# Dependency graph
requires:
  - phase: 02-pipeline-engine/02-01
    provides: "Sandbox tools (createSandboxTools, executeTool), clone manager (cloneRepo, cleanupClone), path validation, stage filter"
  - phase: 02-pipeline-engine/02-02
    provides: "Stage prompt files (ceo.md, eng.md, design.md, qa.md, security.md)"
  - phase: 01-foundation-github-integration
    provides: "DB schema (pipelineRuns, stageResults, findings), webhook handler, GitHub auth, idempotency"
provides:
  - "Stage runner: single-stage Claude API tool_use loop executor (runStage, runStageWithRetry)"
  - "Pipeline orchestrator: full lifecycle manager (executePipeline)"
  - "Webhook handler wired to pipeline dispatch (fire-and-forget)"
affects: [03-review-output-signal-quality, 04-dashboard-pipeline-visualization]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk (used, already installed)"]
  patterns: ["Manual tool_use agentic loop with iteration cap", "Promise.allSettled fan-out/fan-in", "Fire-and-forget async dispatch from webhook handler", "AbortController timeout per stage"]

key-files:
  created:
    - packages/api/src/pipeline/stage-runner.ts
    - packages/api/src/pipeline/orchestrator.ts
    - packages/api/src/__tests__/stage-runner.test.ts
    - packages/api/src/__tests__/orchestrator.test.ts
  modified:
    - packages/api/src/lib/config.ts
    - packages/api/src/github/handlers.ts
    - packages/api/src/__tests__/handlers.test.ts

key-decisions:
  - "Module-level Anthropic client singleton (one shared instance, SDK reads ANTHROPIC_API_KEY from env)"
  - "Manual tool_use loop over SDK toolRunner for control over iteration limits, timeout, and progress reporting"
  - "Stage timeout via AbortController (5 min) rather than API-level timeout"
  - "Fire-and-forget pipeline dispatch from handler (no await) for webhook ACK within 10 seconds"
  - "Mock orchestrator in handlers test to prevent async side effects from pipeline execution"

patterns-established:
  - "Manual Claude tool_use loop: send message -> check stop_reason -> execute tools -> send results -> repeat"
  - "Prompt caching: cache_control ephemeral on system message and last tool definition"
  - "StageOutput parsing: extract JSON code block from Claude response, Zod-validate verdict and findings"
  - "Pipeline lifecycle: RUNNING before work -> clone -> fan-out -> fan-in -> COMPLETED/FAILED"
  - "vi.hoisted() pattern for mock functions referenced in vi.mock() factory callbacks"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-05, PIPE-06, PIPE-08, PIPE-09]

# Metrics
duration: 10min
completed: 2026-03-30
---

# Phase 2 Plan 3: Pipeline Engine Core Summary

**Claude API tool_use stage runner with mixed model strategy (Opus/Sonnet), Promise.allSettled orchestrator with RUNNING/COMPLETED/FAILED lifecycle, and webhook-to-pipeline fire-and-forget dispatch**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-30T23:23:26Z
- **Completed:** 2026-03-30T23:33:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Stage runner executes single Claude API conversations with sandboxed tool_use loop, mixed model strategy (Opus for CEO/Security, Sonnet for Eng/Design/QA), 5-min AbortController timeout, prompt caching, and structured output parsing with Zod validation
- Pipeline orchestrator manages full lifecycle: sets RUNNING status before work, clones repo, filters stages, fans out via Promise.allSettled, fans in results to database, cleans up clone in finally block
- Webhook handler wired to dispatch pipeline as fire-and-forget (no await, .catch for error logging), maintaining 10-second ACK requirement
- 17 new tests (8 stage-runner + 9 orchestrator) all passing, full suite of 76 tests green

## Task Commits

Each task was committed atomically:

1. **Task 1: Create stage runner with Claude API tool_use loop and retry wrapper** - `fca913f` (feat)
2. **Task 2: Create pipeline orchestrator, wire to handler, and add integration tests** - `f4104d8` (feat)

## Files Created/Modified

- `packages/api/src/pipeline/stage-runner.ts` - Single-stage executor: Claude API tool_use loop, model selection, timeout, retry, structured output parsing
- `packages/api/src/pipeline/orchestrator.ts` - Pipeline lifecycle manager: RUNNING -> clone -> fan-out/fan-in -> COMPLETED/FAILED
- `packages/api/src/lib/config.ts` - Added optional anthropicApiKey field to config schema
- `packages/api/src/github/handlers.ts` - Wired executePipeline dispatch on PR webhook (fire-and-forget)
- `packages/api/src/__tests__/stage-runner.test.ts` - 8 tests: PASS verdict, tool_use loop, retry/FLAG, findings parsing, MAX_ITERATIONS, fallback
- `packages/api/src/__tests__/orchestrator.test.ts` - 9 tests: RUNNING status, parallel exec, persistence, FLAG on failure, COMPLETED, FAILED, cleanup, skip filtering
- `packages/api/src/__tests__/handlers.test.ts` - Added orchestrator mock to prevent async side effects

## Decisions Made

- **Module-level Anthropic client**: One shared instance at module scope, SDK reads ANTHROPIC_API_KEY from env automatically. No per-stage instantiation.
- **Manual tool_use loop over SDK toolRunner**: Gives full control over iteration limits (25), timeout (AbortController), and progress reporting. SDK's `toolRunner()` is more automated but less controllable.
- **AbortController for stage timeout**: 5-min per stage via `setTimeout(() => controller.abort(), 300000)` with cleanup in finally block.
- **Fire-and-forget pipeline dispatch**: `executePipeline({...}).catch(err => ...)` -- handler returns immediately for webhook ACK within 10 seconds per GHUB-05.
- **Mock orchestrator in handlers test**: Prevents the async pipeline from running during webhook integration tests, which would mutate DB state and cause test flakiness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed handlers.test.ts test failure after pipeline wiring**
- **Found during:** Task 2 (wire handler + integration tests)
- **Issue:** Existing `handlers.test.ts` expected pipeline_runs status to be 'PENDING' after PR webhook, but now executePipeline fires asynchronously and changes status to RUNNING/FAILED before the assertion runs
- **Fix:** Added `vi.mock('../pipeline/orchestrator')` in handlers.test.ts to return a no-op executePipeline, preventing async side effects during handler-level tests
- **Files modified:** packages/api/src/__tests__/handlers.test.ts
- **Verification:** All 76 tests pass including the previously-failing handler test
- **Committed in:** f4104d8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary to keep existing Phase 1 tests green after wiring pipeline dispatch. No scope creep.

## Issues Encountered

- **Mock hoisting with vi.mock**: Vitest hoists `vi.mock()` calls above all other code, so mock function variables declared with `const mockFn = vi.fn()` aren't available when the factory runs. Solved with `vi.hoisted()` to define mock functions in a hoisted scope.
- **Import path resolution**: Test files in `src/__tests__/` need `../pipeline/...` paths (not `../../pipeline/...`) since they're only one level deep from `src/`. Verified against existing test patterns.

## User Setup Required

**External services require manual configuration.** The ANTHROPIC_API_KEY environment variable must be set for pipeline execution:
- Source: Anthropic Console -> API Keys -> Create Key (https://console.anthropic.com/settings/keys)
- Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`
- The config field is optional so existing Phase 1 functionality works without it

## Next Phase Readiness

- Pipeline engine is fully functional: webhook -> orchestrator -> stage runner -> database persistence
- Ready for Phase 3 (Review Output / Signal Quality): stage results and findings are persisted, can be formatted into PR comments
- Cross-repo embeddings (Phase 5) can consume findings from the findings table
- Dashboard (Phase 4) can query pipeline_runs and stage_results for visualization

## Self-Check: PASSED

- All 7 key files verified as existing on disk
- Commit fca913f (Task 1) found in git log
- Commit f4104d8 (Task 2) found in git log
- 76/76 tests pass across all 8 test files
- TypeScript compilation clean (no errors)

---
*Phase: 02-pipeline-engine*
*Completed: 2026-03-30*
