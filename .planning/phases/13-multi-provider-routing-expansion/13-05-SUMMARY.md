---
phase: 13-multi-provider-routing-expansion
plan: 05
subsystem: routing-ui
tags: [frontend, sse, routing-attribution, ui-components]
dependency_graph:
  requires: [13-04]
  provides: [routing-badge-ui, routing-rationale-popover, local-model-status]
  affects: [session-message-stream, stream-bridge]
tech_stack:
  added: []
  patterns: [provider-identity-colors, sse-multi-event-emission, click-outside-popover]
key_files:
  created:
    - packages/web/src/components/session/RoutingBadge.tsx
    - packages/web/src/components/session/RoutingRationale.tsx
    - packages/web/src/components/shared/LocalModelStatus.tsx
  modified:
    - packages/api/src/agent/stream-bridge.ts
    - packages/api/src/agent/loop.ts
    - packages/web/src/hooks/useAgentStream.ts
    - packages/web/src/components/session/MessageBubble.tsx
    - packages/web/src/components/session/MessageList.tsx
decisions:
  - "Added routeInfo to result SSE events via array return from bridgeToSSE (simpler than separate event emission pipeline)"
  - "Provider colors reuse existing stage identity colors per 13-UI-SPEC.md (no new CSS tokens)"
  - "LocalModelStatus uses setInterval polling at 30s (not react-query) to keep it dependency-light"
metrics:
  duration: 3min
  completed: 2026-04-08
  tasks: 2
  files: 8
---

# Phase 13 Plan 05: Routing Attribution UI Summary

SSE route_info events + RoutingBadge/RoutingRationale/LocalModelStatus components following 13-UI-SPEC.md exactly.

## What Was Built

### Task 1: SSE route_info Event + ChatMessage Extension
- Added `route_info` event type to `AgentSSEEvent` union
- Created `inferProviderFromModelName()` helper for provider attribution from model strings
- Changed `bridgeToSSE` return type to `AgentSSEEvent | AgentSSEEvent[] | null` for multi-event emission
- Updated `handleResultMessage` to emit `[route_info, result]` array when model info available
- Updated `loop.ts` to flatten array events from bridgeToSSE
- Added `RoutingInfo` interface and `routingInfo` field to `ChatMessage`
- Added `pendingRouteInfo` state management in `useAgentStream` hook
- `route_info` events stored as pending, attached to assistant messages on `turn_complete`

### Task 2: UI Components
- **RoutingBadge** (96 lines): Pill-shaped badge with 6px provider-colored dot + model name in JetBrains Mono 11px uppercase. Click toggles RoutingRationale popover. Hover state transitions per spec.
- **RoutingRationale** (148 lines): 280px popover with task classification (accent when manifest, muted when heuristic), routing reason, confidence label, tier. Fade-in animation 150ms. Click-outside + Escape dismissal.
- **LocalModelStatus** (87 lines): Connection indicator polling `/api/health/local` every 30s. Green/red/cyan dot states with appropriate labels. Title attribute shows model name + tokens/sec on hover.
- **MessageBubble**: Wired RoutingBadge between message content and tool calls for assistant messages.
- **MessageList**: Passes `routingInfo` prop through to MessageBubble.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4d80a10 | route_info SSE event + ChatMessage routing metadata |
| 2 | 4b4e31b | RoutingBadge, RoutingRationale, LocalModelStatus components |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] bridgeToSSE array return type**
- **Found during:** Task 1
- **Issue:** Plan suggested multiple approaches (separate event, field on result, etc). The cleanest was array return from bridgeToSSE with loop.ts flattening.
- **Fix:** Changed return type to union with array, updated loop.ts with 3-line array check.
- **Files modified:** stream-bridge.ts, loop.ts

**2. [Rule 2 - Missing functionality] LocalModelStatus uses native fetch instead of react-query**
- **Found during:** Task 2
- **Issue:** Plan suggested useQuery for polling. LocalModelStatus is a simple status indicator; adding react-query dependency for a single poll would be over-engineered.
- **Fix:** Used native fetch + setInterval with AbortSignal.timeout for the 30s health poll.
- **Files modified:** LocalModelStatus.tsx

## Threat Flags

None. All new surface matches the plan's threat model (T-13-06 accept, T-13-07 mitigated with 30s poll interval).

## Self-Check: PASSED

All 8 files verified present. Both commits (4d80a10, 4b4e31b) found in history. TypeScript compiles with no code errors (only pre-existing type definition warnings from node_modules).
