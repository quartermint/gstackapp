---
phase: 38-bella-client
plan: 03
status: complete
started: 2026-03-23T17:00:00Z
completed: 2026-03-23T17:30:00Z
commits: ["1c11162"]
tests_before: 940
tests_after: 944
---

# Plan 38-03 Summary: Chat-First Frontend for Bella

## What Was Built

Complete Bella chat UI at `/bella` — the second lightsaber on MC's platform:

- **BellaLayout** — Simplified chrome with MC branding, Bella user badge, API Explorer toggle, Dashboard link
- **ChatMessages** — Message list with user/assistant bubble styling, empty state with prompts, auto-scroll, streaming "Thinking..." indicator
- **ChatInput** — TextareaAutosize with Enter-to-send, Shift+Enter for newline, terracotta send button, disabled during loading
- **ApiExplorer** — Slide-in panel listing MC API endpoints by category (Projects, Captures, Search, Intelligence, Sessions, Health) with "Try asking" suggestions
- **BellaChat** — Composition root wiring useBellaChat hook, layout, messages, input, explorer
- **useBellaChat** — Thin wrapper: `useChat({ transport: new TextStreamChatTransport({ api: "/api/chat" }) })`
- **URL routing** — `getInitialView()` detects `/bella` path, renders BellaChat outside DashboardLayout via Suspense lazy load

## Key Decisions

- **AI SDK v6 API:** `useChat` v3 uses `transport` + `sendMessage` instead of old `api`/`handleSubmit`/`input`/`isLoading`. TextStreamChatTransport matches backend's `toTextStreamResponse()`
- **Text stream protocol:** Tool invocations don't arrive via text protocol; LLM synthesizes tool results into its text response. Context cards deferred to data protocol upgrade
- **Added `ai` dependency to web:** TextStreamChatTransport is exported from `ai`, not `@ai-sdk/react`
- **Managed input state internally** in ChatInput (not via useChat), since v6 useChat doesn't expose `input`/`handleInputChange`

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `packages/web/src/hooks/use-bella-chat.ts` | 16 | Chat hook with TextStreamChatTransport |
| `packages/web/src/components/bella/bella-layout.tsx` | 50 | Simplified layout with header |
| `packages/web/src/components/bella/bella-chat.tsx` | 38 | Composition root |
| `packages/web/src/components/bella/chat-messages.tsx` | 73 | Message rendering |
| `packages/web/src/components/bella/chat-input.tsx` | 63 | Input field with send |
| `packages/web/src/components/bella/api-explorer.tsx` | 123 | API learning panel |
| `packages/web/src/__tests__/components/bella-chat.test.tsx` | 53 | Component tests |

## Files Modified

| File | Change |
|------|--------|
| `packages/web/src/App.tsx` | Added "bella" to View type, getInitialView(), lazy BellaChat import, conditional render outside DashboardLayout |
| `packages/web/package.json` | Added `ai` dependency for TextStreamChatTransport |

## Test Results

- Web: 113 tests (14 files) — +4 new bella-chat tests
- API: 940 tests (82 files) — unchanged
- All green
