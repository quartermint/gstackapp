---
phase: 38-bella-client
plan: 02
subsystem: api
tags: [ai-sdk, streamText, chat, tools, lm-studio, zodSchema]

requires:
  - phase: 38-bella-client/01
    provides: "resolveUser identity, bella source type, MCUser config"
provides:
  - "POST /api/chat streaming endpoint with MC tool calling"
  - "7 AI SDK tools wrapping MC queries (projects, captures, search, sessions, health)"
  - "System prompt enforcing grounded responses"
  - "createChatTools factory for tool-augmented chat"
affects: [38-bella-client/03]

tech-stack:
  added: [zodSchema from ai SDK]
  patterns: ["zodSchema() for AI SDK v6 tool inputSchema (avoids tool() overload issues)", "stepCountIs(5) for tool loop prevention", "safeExecute wrapper for try/catch in tool execute"]

key-files:
  created:
    - packages/api/src/services/chat-tools.ts
    - packages/api/src/routes/chat.ts
    - packages/api/src/__tests__/services/chat-tools.test.ts
    - packages/api/src/__tests__/routes/chat.test.ts
  modified:
    - packages/api/src/app.ts

key-decisions:
  - "zodSchema() for tool inputSchema instead of tool() helper (AI SDK v6 overload resolution fails with typed execute params)"
  - "stepCountIs(5) replaces maxSteps (AI SDK v6 API change)"
  - "toTextStreamResponse() replaces toDataStreamResponse() (AI SDK v6 API change)"
  - "ChatToolResult single interface avoids union type issues with AI SDK tool() overload resolution"
  - "Headers adapter in chat route (resolveUser expects { get(name): string | undefined }, native Headers returns string | null)"

patterns-established:
  - "zodSchema + plain Tool objects for AI SDK v6 strict mode compatibility"
  - "safeExecute wrapper: try/catch returning structured error field"
  - "buildSystemPrompt function with user context injection"

requirements-completed: [BELLA-01, BELLA-02, BELLA-04, BELLA-05, BELLA-06, BELLA-07]

duration: 36min
completed: 2026-03-23
---

# Phase 38 Plan 02: Chat Backend Summary

**AI SDK streamText endpoint with 7 MC data tools, system prompt enforcing grounded responses, zodSchema for v6 compatibility**

## Performance

- **Duration:** 36 min
- **Started:** 2026-03-23T15:41:47Z
- **Completed:** 2026-03-23T16:17:48Z
- **Tasks:** 2 (TDD: RED-GREEN for each)
- **Files modified:** 5

## Accomplishments
- 7 AI SDK chat tools wrapping real MC queries (listProjects, getProjectStatus, getRecentCaptures, getImessageExtracts, searchMC, createCapture, getRecentSessions)
- POST /api/chat streaming endpoint with LM Studio integration and 503 graceful degradation
- System prompt enforces tool-based data grounding -- LLM must use tools, never hallucinate project data
- User identity flows from request headers through to capture attribution (bella sourceType)
- 13 tests (9 tool tests + 4 route tests), 940 total API tests passing, zero type errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Chat tools service with tests** (TDD)
   - `e0b300a` (test: add failing tests for chat tools service)
   - `eae138c` (feat: implement chat tools service with 7 AI SDK tool definitions)

2. **Task 2: Chat route with system prompt and app wiring** (TDD)
   - `1dbeb40` (test: add failing tests for chat route)
   - `50520dd` (feat: implement chat route with system prompt and app wiring)

## Files Created/Modified
- `packages/api/src/services/chat-tools.ts` - 7 AI SDK tool definitions wrapping MC database queries
- `packages/api/src/routes/chat.ts` - POST /chat streaming endpoint with system prompt and LM Studio integration
- `packages/api/src/app.ts` - Chat route wired before intelligence routes
- `packages/api/src/__tests__/services/chat-tools.test.ts` - 9 tests for tool execution
- `packages/api/src/__tests__/routes/chat.test.ts` - 4 tests for route error handling

## Decisions Made
- Used `zodSchema()` for tool `inputSchema` instead of the `tool()` helper function -- AI SDK v6's `tool()` overload resolution fails with explicit execute parameter types in TypeScript strict mode. Plain objects with `zodSchema()` avoid this entirely.
- `stepCountIs(5)` replaces `maxSteps: 5` per AI SDK v6 API changes (maxSteps removed, stopWhen added)
- `toTextStreamResponse()` replaces `toDataStreamResponse()` per AI SDK v6 naming changes
- Headers adapter wraps native `Headers.get()` (returns `string | null`) to match `resolveUser`'s expected interface (`string | undefined`)
- Tool implementations as pure functions + `safeExecute` wrapper for consistent error handling across all 7 tools

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AI SDK v6 type compatibility**
- **Found during:** Task 1 and Task 2
- **Issue:** Plan specified `tool()` helper with `parameters` field, but AI SDK v6 `tool()` overload resolution fails with explicitly typed execute params in strict mode. Plan also used `maxSteps` and `toDataStreamResponse()` which no longer exist in v6.
- **Fix:** Used `zodSchema()` + plain Tool objects for inputSchema, `stepCountIs(5)` for tool loop prevention, `toTextStreamResponse()` for streaming response
- **Files modified:** `chat-tools.ts`, `chat.ts`
- **Verification:** `pnpm typecheck` passes with 0 errors
- **Committed in:** `50520dd`

**2. [Rule 1 - Bug] Missing `type` field in createCapture calls**
- **Found during:** Task 1
- **Issue:** `CreateCapture` schema requires `type` field (with default "text"), but the inferred type from Zod makes it required at the TypeScript level
- **Fix:** Added explicit `type: "text"` to all createCapture calls
- **Files modified:** `chat-tools.ts`, `chat-tools.test.ts`
- **Verification:** TypeScript strict mode passes
- **Committed in:** `eae138c`, `50520dd`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** All auto-fixes necessary for AI SDK v6 compatibility. No scope creep.

## Issues Encountered
- AI SDK v6 has significant API surface changes from v5 (maxSteps -> stopWhen, toDataStreamResponse -> toTextStreamResponse, tool() overload fragility with strict TypeScript). This required adapting the plan's implementation details while keeping the same functionality.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chat backend is fully wired and ready for Plan 03's frontend integration
- POST /api/chat returns streaming responses when LM Studio is available
- 503 graceful degradation when LM Studio is down
- System prompt enforces tool-based data grounding for Bella's conversational interface

---
*Phase: 38-bella-client*
*Completed: 2026-03-23*

## Self-Check: PASSED
- All 4 created files verified on disk
- All 4 commit hashes verified in git log
