---
phase: 18-operator-mode
plan: "02"
subsystem: operator-error-handling
tags: [timeout, verification, provider-exhaustion, error-handling, sse]
dependency_graph:
  requires: [18-01]
  provides: [timeout-monitor, verification-reader, retry-routes, error-events]
  affects: [packages/api/src/pipeline, packages/api/src/routes/operator.ts]
tech_stack:
  added: []
  patterns: [timeout-monitor-pattern, verification-report-parsing, provider-exhaustion-retry]
key_files:
  created:
    - packages/api/src/pipeline/timeout-monitor.ts
    - packages/api/src/pipeline/verification-reader.ts
    - packages/api/src/__tests__/operator-timeout.test.ts
    - packages/api/src/__tests__/operator-errors.test.ts
    - packages/api/src/__tests__/operator-verification.test.ts
  modified:
    - packages/api/src/pipeline/file-watcher.ts
    - packages/api/src/pipeline/state-machine.ts
    - packages/api/src/routes/operator.ts
decisions:
  - "State machine extended: approved->failed for spawn failures, failed->approved for provider exhaustion retry"
  - "Timeout monitor uses simple setTimeout per request, cleared on completion"
  - "Verification report parsed from result.json with pass/fail/summary/failureDetails"
metrics:
  duration: 379s
  completed: "2026-04-11T21:26:28Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 17
  files_created: 5
  files_modified: 3
---

# Phase 18 Plan 02: Error Handling & Timeout Infrastructure Summary

Timeout detection, verification report parsing, and provider exhaustion retry with SSE error event infrastructure for the operator error handling flows.

## One-Liner

5-minute timeout monitor with retry routes, verification result parser for plain-language reports, and provider exhaustion detection with retry queue.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Timeout monitor + provider exhaustion retry | fd16318 | timeout-monitor.ts, operator.ts (retry-timeout, retry routes) |
| 2 | Verification report reader + extended file watcher | 219bfa7 | verification-reader.ts, file-watcher.ts (result.json + error-*.json) |

## What Was Built

### Task 1: Timeout Monitor + Provider Exhaustion Retry
- **timeout-monitor.ts**: `startTimeoutMonitor(requestId, 300_000)` sets a 5-minute timeout that emits `operator:error` SSE event with `errorType: 'timeout'`. `clearTimeoutMonitor(requestId)` cancels the timer. One timer per request, replaces on restart.
- **operator.ts**: Wired `startTimeoutMonitor` after `spawnPipeline()` in approve-brief route. Wired `clearTimeoutMonitor` before completion in pipeline callback.
- **POST /:requestId/retry-timeout**: Validates status is `timeout`, transitions to `running`, checks if process is alive (restart timeout) or dead (re-spawn pipeline).
- **POST /:requestId/retry**: Validates status is `failed` and audit trail shows `provider_exhaustion`, transitions `failed -> approved -> running`, re-spawns pipeline.
- **Provider exhaustion detection**: In approve-brief catch block, regex matches provider/rate limit/overloaded/capacity errors, emits `operator:error` with `errorType: 'provider-exhaustion'`, transitions to `failed`, logs audit trail.

### Task 2: Verification Report Reader + File Watcher Extensions
- **verification-reader.ts**: `readVerificationResult(outputDir)` parses `result.json` into `VerificationReport` with `passed`, `summary`, `whatBuilt`, `qualityChecks`, `filesChanged`, and optional `failureDetails`. Returns null on missing/malformed files.
- **file-watcher.ts**: Extended `pollDirectory` to detect `result.json` — emits `operator:verification:report` on pass, `operator:error` with `errorType: 'verification-failure'` on fail. Added `error-*.json` detection that parses error type and message into `operator:error` SSE events.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] State machine missing transitions for retry flows**
- **Found during:** Task 1
- **Issue:** State machine had `approved: ['running']` and `failed: []` (terminal), blocking the retry and provider exhaustion flows
- **Fix:** Added `approved -> failed` (spawn can fail before reaching running) and `failed -> approved` (provider exhaustion retry re-enters approval flow)
- **Files modified:** packages/api/src/pipeline/state-machine.ts
- **Commit:** fd16318

**2. [Rule 1 - Bug] File watcher processedFiles persistence between tests**
- **Found during:** Task 2
- **Issue:** Tests shared a single pipelineId, causing the processedFiles map to mark result.json as "seen" from the first test, making subsequent tests fail
- **Fix:** Changed tests to use unique pipeline IDs per test case
- **Files modified:** packages/api/src/__tests__/operator-verification.test.ts
- **Commit:** 219bfa7

## Verification

- All 17 new tests pass across 3 test files
- Existing file-watcher tests (5 tests) pass
- Existing operator-state-machine tests (18 tests) pass
- No TypeScript errors in modified files (pre-existing type definition issues in unrelated dependencies)

## Known Stubs

None. All functions are fully implemented with real logic.

## Threat Flags

No new threat surfaces beyond those documented in the plan's threat model. All mitigations implemented:
- T-18-07: verification-reader.ts reads with try/catch, returns null on error
- T-18-08: One timer per request, cleared on completion, retry validates status
- T-18-09: loadAndVerifyRequest enforces session isolation on retry routes
- T-18-10: Retry route validates `failed` status AND `provider_exhaustion` audit trail entry

## Self-Check: PASSED

- All 5 created files exist on disk
- All 4 commits (e106039, fd16318, c299763, 219bfa7) verified in git log
- All 12 acceptance criteria verified via grep
