---
phase: 12-agent-loop-session-infrastructure
plan: 02
subsystem: agent-loop-streaming
tags: [agent-sdk, sse, streaming, async-generator, session-resume]
dependency_graph:
  requires: [sessions-schema, sessions-api, gstack-tool-server, system-prompt-builder]
  provides: [agent-loop-generator, stream-bridge, agent-sse-endpoint]
  affects: [12-03]
tech_stack:
  added: []
  patterns: [async-generator-wrapper, sdk-message-bridge, sse-streaming-with-heartbeat]
key_files:
  created:
    - packages/api/src/agent/loop.ts
    - packages/api/src/agent/stream-bridge.ts
    - packages/api/src/routes/agent.ts
    - packages/api/src/__tests__/agent-loop.test.ts
    - packages/api/src/__tests__/helpers/mock-sdk.ts
  modified:
    - packages/api/src/index.ts
decisions:
  - Used allowDangerouslySkipPermissions alongside bypassPermissions per SDK API requirement
  - Stream bridge returns null for unhandled SDK message types (iterative discovery via debug logging)
  - Agent route supports both GET /stream (query params) and POST /send (JSON body) for flexibility
  - Assistant text accumulated in route handler for Drizzle message record (truncated to 10KB)
  - SDK query handle close() called in finally block for resource cleanup
metrics:
  duration: 213s
  completed: "2026-04-08T07:10:13Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 5
  files_modified: 1
  tests_added: 12
  tests_passing: 12
---

# Phase 12 Plan 02: Agent Loop SSE Streaming Summary

Agent loop async generator wrapping Claude Agent SDK query(), SSE stream bridge mapping SDK messages to typed frontend events, and /api/agent/stream endpoint with session lifecycle management.

## What Was Built

### Task 1: Agent Loop Wrapper, Stream Bridge, and SSE Route

**Stream Bridge** (`packages/api/src/agent/stream-bridge.ts`):
- Defines `AgentSSEEvent` union type with 7 event types: text_delta, tool_start, tool_result, turn_complete, result, compact, error
- `bridgeToSSE()` function maps raw SDK messages to typed events:
  - `SDKAssistantMessage` (type: 'assistant') with text content -> text_delta
  - `SDKAssistantMessage` with tool_use content -> tool_start
  - `SDKPartialAssistantMessage` (type: 'stream_event') with content_block_delta -> text_delta
  - `SDKPartialAssistantMessage` with content_block_start tool_use -> tool_start
  - `SDKResultMessage` (type: 'result') -> result (with cost/token usage) or error
  - `SDKCompactBoundaryMessage` (subtype: 'compact_boundary') -> compact
  - Unknown types -> null (silently skipped)

**Agent Loop** (`packages/api/src/agent/loop.ts`):
- `runAgentLoop()` async generator wrapping SDK `query()` function
- Accepts `AgentLoopOptions`: prompt, sessionId, sdkSessionId, projectPath, maxTurns (100), maxBudgetUsd (5.0)
- Injects system prompt via `buildSystemPrompt()` with project context (D-02, D-03, D-04)
- Connects `gstackToolServer` MCP tools
- Enables `bypassPermissions` + `allowDangerouslySkipPermissions` (D-11)
- Enables `includePartialMessages` for streaming text deltas
- Calls `queryHandle.close()` in finally block for cleanup

**Agent Route** (`packages/api/src/routes/agent.ts`):
- `GET /stream` SSE endpoint with query params: prompt (required for new), sessionId (for resume)
- `POST /send` JSON body alternative: `{ prompt, sessionId }`
- Session lifecycle: creates new Drizzle session if no sessionId, looks up sdkSessionId for resume
- Inserts user message record before loop, assistant summary record after
- 15-second heartbeat interval (matching existing sse.ts pattern)
- On result: updates session metadata (sdkSessionId, messageCount++, tokenUsage, costUsd, lastMessageAt)
- Error handling: try/catch wrapping loop, emits error SSE event on failure

**Route Mounting**: Agent route mounted at `/api/agent` in index.ts.

### Task 2: Integration Tests with SDK Mock

**Mock Helper** (`packages/api/src/__tests__/helpers/mock-sdk.ts`):
- `createMockQueryGenerator(messages)` returns a mock query function yielding predetermined messages
- Predefined fixtures: mockTextResponse, mockToolResponse, mockStreamingResponse, mockCompactEvent, mockErrorResult

**Test Suite** (`packages/api/src/__tests__/agent-loop.test.ts`):
12 tests in 2 describe blocks:
- `bridgeToSSE`: text mapping, tool_use mapping, result mapping, stream_event deltas, compact boundary, error result, unknown types, user messages
- `runAgentLoop (mocked)`: text sequence, tool sequence, streaming deltas, mixed events with compact

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 5af30bb | feat(12-02): add agent loop wrapper, stream bridge, and SSE endpoint |
| 2 | d60b955 | test(12-02): add agent loop integration tests with SDK mock |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] allowDangerouslySkipPermissions required**
- **Found during:** Task 1 implementation
- **Issue:** SDK requires `allowDangerouslySkipPermissions: true` when using `permissionMode: 'bypassPermissions'` -- this was not in the plan's code example
- **Fix:** Added `allowDangerouslySkipPermissions: true` to query options
- **Files modified:** packages/api/src/agent/loop.ts

## Threat Mitigations Applied

| Threat ID | Mitigation | Implementation |
|-----------|-----------|----------------|
| T-12-04 | Budget and turn limits | maxBudgetUsd: 5.0, maxTurns: 100 in loop.ts |
| T-12-05 | Prompt injection | Accepted -- prompt goes to Claude API with built-in guardrails |
| T-12-06 | SSE information disclosure | Accepted -- single-user, localhost |
| T-12-07 | bypassPermissions | Accepted per D-11, budget limits provide guardrails |

## Self-Check: PASSED
