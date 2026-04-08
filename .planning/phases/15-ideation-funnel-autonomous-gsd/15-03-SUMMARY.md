---
phase: 15-ideation-funnel-autonomous-gsd
plan: 03
subsystem: web-frontend
tags: [ideation, pipeline, sse, react, frontend]
dependency_graph:
  requires: [15-01]
  provides: [ideation-ui, ideation-pipeline-viz, ideation-input]
  affects: [web-app-shell]
tech_stack:
  added: []
  patterns: [custom-hook-sse, stage-node-reuse, two-column-layout, conversation-streaming]
key_files:
  created:
    - packages/web/src/hooks/useIdeation.ts
    - packages/web/src/components/ideation/IdeationInput.tsx
    - packages/web/src/components/ideation/ArtifactCard.tsx
    - packages/web/src/components/ideation/IdeationStageNode.tsx
    - packages/web/src/components/ideation/IdeationPipeline.tsx
    - packages/web/src/components/ideation/IdeationView.tsx
  modified: []
decisions:
  - Inline ConversationEvent renderer instead of reusing deleted MessageBubble/ToolCallBlock (session components were removed during merge)
  - IdeationConnector inlined in IdeationPipeline instead of importing StageConnector to avoid coupling ideation pipeline to PR pipeline types
  - Stage color/label maps duplicated in IdeationStageNode and ArtifactCard (ideation stages differ from PR pipeline stages)
metrics:
  duration: 4min
  completed: 2026-04-08
  tasks: 2
  files: 6
---

# Phase 15 Plan 03: Ideation Frontend Summary

Ideation pipeline UI with SSE-driven state management, 4-node horizontal pipeline visualization, idea-first input, and artifact browsing panel.

## One-Liner

Ideation frontend: useIdeation hook manages SSE lifecycle, IdeationPipeline renders 4-node topology with spectral stage colors, IdeationView provides two-column layout with conversation streaming and artifact panel.

## What Was Built

### Task 1: useIdeation hook + IdeationInput + ArtifactCard (38b8ced)

- **useIdeation.ts**: Custom hook managing full ideation lifecycle -- idea submission via POST to `/api/ideation/start`, SSE consumption via EventSource at `/api/ideation/stream/:id`, stage state tracking (Map of stage -> status), artifact fetching, and conversation event forwarding. Handles cleanup on unmount.
- **IdeationInput.tsx**: Large textarea with "What do you want to build?" placeholder, character count (max 5000), accent "Start Ideation" CTA button, Cmd+Enter keyboard shortcut. Client-side validation per T-15-12.
- **ArtifactCard.tsx**: Stage-colored artifact preview card with 3px left accent bar, stage label in spectral color, title, 3-line excerpt with line-clamp, relative timestamp via date-fns.

### Task 2: IdeationPipeline + IdeationStageNode + IdeationView (dabe6e5)

- **IdeationStageNode.tsx**: Stage node card (w-36 h-44) with spectral stage colors, 4 visual states (pending: 20% opacity, running: pulse glow animation, complete: green badge, error: red badge). Clickable when complete.
- **IdeationPipeline.tsx**: Horizontal 4-node topology with dashed SVG connectors and trace-flow animation (2.5s linear loop). Renders office-hours, CEO review, eng review, design consultation stages.
- **IdeationView.tsx**: Full two-column ideation experience. Left (60%): pipeline topology + conversation stream with auto-scroll. Right (40%): scrollable artifact cards. Empty state: "Start with an idea" heading. "Launch Execution" accent CTA appears on pipeline completion. Inline ConversationEvent renderer handles text_delta, tool_start, tool_result, and error events.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Session components unavailable**
- **Found during:** Task 2
- **Issue:** Plan referenced MessageBubble and ToolCallBlock from packages/web/src/components/session/, but those files were removed during the phase 15 merge commit
- **Fix:** Created inline ConversationEvent renderer in IdeationView that handles text_delta, tool_start, tool_result, and error event types
- **Files modified:** packages/web/src/components/ideation/IdeationView.tsx

## Decisions Made

1. **Inline conversation renderer**: Session components (MessageBubble, ToolCallBlock) were deleted during the worktree merge. Rather than recreating full session components, built a lightweight inline ConversationEvent renderer specific to ideation events.
2. **Decoupled connector**: IdeationConnector is inlined in IdeationPipeline rather than importing StageConnector, since ideation stages use different types than PR pipeline stages.
3. **Duplicated stage maps**: Stage color/label mappings are duplicated in IdeationStageNode and ArtifactCard because ideation stages (office-hours, plan-ceo-review, etc.) differ from PR pipeline stages (ceo, eng, design, qa, security).

## Known Stubs

None -- all components are fully wired to the useIdeation hook and API endpoints. No placeholder data or hardcoded empty values.

## Self-Check: PASSED
