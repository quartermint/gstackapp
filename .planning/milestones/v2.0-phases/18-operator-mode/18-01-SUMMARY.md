---
phase: 18-operator-mode
plan: 01
title: "Operator Clarification & Brief Backend Core"
subsystem: operator-pipeline
tags: [state-machine, clarification, brief-generation, api-routes, sse]
dependency_graph:
  requires: []
  provides: [state-machine, clarifier, brief-generator, operator-routes-v2]
  affects: [operator-ui, pipeline-spawner]
tech_stack:
  added: []
  patterns: [state-machine-validation, claude-api-clarification, zod-response-validation]
key_files:
  created:
    - packages/api/src/pipeline/state-machine.ts
    - packages/api/src/pipeline/clarifier.ts
    - packages/api/src/pipeline/brief-generator.ts
    - packages/api/src/__tests__/operator-state-machine.test.ts
    - packages/api/src/__tests__/operator-clarify.test.ts
    - packages/api/src/__tests__/operator-brief.test.ts
  modified:
    - packages/api/src/routes/operator.ts
    - packages/api/src/events/bus.ts
    - packages/api/src/db/schema.ts
    - packages/api/src/__tests__/operator-request.test.ts
    - packages/api/src/__tests__/helpers/test-db.ts
decisions:
  - "briefing -> escalated transition added to state machine (not in original plan spec but required by escalate route accepting briefing state)"
  - "Schema push deferred due to expired Neon DB credentials (known blocker in STATE.md)"
metrics:
  duration: "6m49s"
  completed: "2026-04-11"
  tasks_completed: 3
  tasks_total: 3
  tests_added: 48
  files_created: 6
  files_modified: 5
---

# Phase 18 Plan 01: Operator Clarification & Brief Backend Core Summary

Request state machine with 9 statuses, Claude-powered clarification question generator with 5-question limit, Zod-validated execution brief generator, and 5 new API routes for the full clarify-to-approve flow.

## What Was Built

### Task 1: Request State Machine + Schema Extension
- **State machine** (`state-machine.ts`): 9 statuses (`pending -> clarifying -> briefing -> approved -> running -> complete/failed/timeout/escalated`) with validated transitions via `canTransition()` and `transitionRequest()`
- **Schema extension**: Added `clarificationData` (JSON array of Q&A) and `briefData` (JSON brief structure) columns to `operatorRequests` table
- **SSE events**: 6 new event types added to `OperatorEventType` union for clarification and brief lifecycle
- **18 tests** covering all valid/invalid transition combinations and DB operations

### Task 2: Clarification Question Generator + Brief Generator
- **Clarifier** (`clarifier.ts`): Generates one question at a time via Claude API (`claude-sonnet-4-20250514`), adapts to previous answers, detects when request is clear enough to proceed, handles non-JSON responses gracefully
- **Brief generator** (`brief-generator.ts`): Produces structured `{scope, assumptions, acceptanceCriteria}` brief from Q&A context, validates response with Zod schema
- **11 tests** with mocked Anthropic SDK covering prompt construction, JSON parsing, model selection, and error handling

### Task 3: Operator API Routes
- **POST /request**: Now starts clarification flow instead of spawning pipeline directly
- **POST /:requestId/clarify-answer**: Submit answer, get next question or transition to briefing
- **POST /:requestId/approve-brief**: Approve brief, spawn pipeline (moved from POST /request)
- **POST /:requestId/reject-brief**: Return to clarification with new question
- **POST /:requestId/escalate**: Escalate from clarifying/briefing/timeout to terminal escalated state
- **19 tests** covering all new routes, state validation, session isolation, and audit trail

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added briefing -> escalated transition to state machine**
- **Found during:** Task 3 test execution
- **Issue:** Plan's escalate route spec says "Accept from statuses: clarifying, briefing, timeout" but the state machine only had `briefing -> [approved, clarifying]`. Escalation from briefing state returned 500.
- **Fix:** Added `escalated` to `briefing` transitions array in VALID_TRANSITIONS map
- **Files modified:** `packages/api/src/pipeline/state-machine.ts`
- **Commit:** 4cfe490

**2. [Rule 3 - Blocking] Schema push deferred**
- **Found during:** Task 3
- **Issue:** Neon DB credentials are expired (documented blocker in STATE.md). `drizzle-kit push` would fail.
- **Fix:** Deferred schema push. New columns exist in code/DDL but not yet pushed to production Neon DB.
- **Impact:** None for development/testing (PGlite test DB has the columns). Production schema push needed when credentials are refreshed.

## Decisions Made

1. **briefing -> escalated**: Added to state machine transitions. The plan specified escalation from briefing state in the route spec but omitted it from the state machine transitions list. This is a correctness fix, not an architectural change.
2. **Schema push deferred**: Known blocker. Will be resolved when Neon DB credentials are refreshed.

## Test Results

```
48 tests passing across 4 test files:
- operator-state-machine.test.ts: 18 passed
- operator-clarify.test.ts: 6 passed
- operator-brief.test.ts: 5 passed
- operator-request.test.ts: 19 passed
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | b3387fc | State machine, schema extension, SSE event types |
| 2 | 92fa2bf | Clarification question generator, execution brief generator |
| 3 | 4cfe490 | Operator API routes for clarification, brief approval, escalation |

## Known Stubs

None. All modules are fully wired with real implementations.

## Threat Mitigations Applied

| Threat ID | Component | Mitigation |
|-----------|-----------|------------|
| T-18-01 | state-machine.ts | All transitions validated via canTransition() before DB update; invalid throws Error |
| T-18-02 | clarify-answer route | Zod validation on answer (min 1, max 5000 chars); session isolation via loadAndVerifyRequest |
| T-18-03 | approve-brief route | Session isolation check; status === 'briefing' verified before approval |
| T-18-04 | clarifier.ts | Clarification context passed as JSON.stringify(ctx) to user message, not interpolated into system prompt |
| T-18-05 | clarify-answer route | Max 5 questions enforced by checking completedQA.length >= 5; auto-transitions to briefing |
| T-18-06 | escalate route | Session isolation via loadAndVerifyRequest; only request owner or admin can escalate |
