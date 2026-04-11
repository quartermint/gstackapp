# Phase 18: Operator Mode - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A non-technical user can go from "I have an idea" to a verified, quality-checked result without opening a terminal or asking Ryan. This phase implements the clarification flow, progress visualization, error handling, decision gates, verification reporting, and audit trail — all within the operator's chat-style interface established in Phase 17.

</domain>

<decisions>
## Implementation Decisions

### Clarification Flow (OP-02, OP-03)
- **D-01:** Chat-style Q&A for clarification. After the operator submits the intake form, questions appear one at a time in a conversational thread below the original request. Operator types answers inline. Questions can adapt based on earlier answers (up to 5 questions per OP-02).
- **D-02:** Execution brief appears inline in the same chat thread. Displays scope summary, assumptions, and acceptance criteria in a styled card. Two buttons: "Approve & Start" and "Request Changes". Rejecting returns to clarification flow.

### Progress Visualization (OP-04)
- **D-03:** Horizontal 5-step progress indicator below the chat thread. Steps: Thinking → Planning → Building → Checking → Done. Current step pulses/glows (matches DESIGN.md running pulse animation). Past steps show checkmarks. Includes elapsed time and a plain-language status message ("Building your landing page...").

### Error Handling UX (OP-08, OP-09, OP-10, OP-11)
- **D-04:** All errors render as inline cards in the chat thread (consistent with the conversational pattern). Each card has plain-language explanation + 2-3 action buttons. Specific error types:
  - **Timeout (OP-08):** "Taking longer than expected" card with [Keep Waiting] [Ask Ryan] buttons. Pipeline state persisted.
  - **Verification failure (OP-09):** "Quality check failed" card with [Request Changes] pre-selected + [Ask Ryan] button. Plain-language explanation of what failed.
  - **Ambiguous scope (OP-10):** Partial brief shown with "We couldn't fully pin down the scope" + [Ask Ryan] escalation.
  - **Provider exhaustion (OP-11):** "Temporarily unavailable" card. Request saved to retry queue. [Retry Later] button.

### Verification Report (OP-05)
- **D-05:** Summary card with expandable details in the chat thread. Top: pass/fail badge with 1-2 sentence plain-language summary. Below: expandable accordion sections for "What was built" (items list), "Quality checks" (pass count), "Files changed" (file count). Operator sees the outcome first, digs into details if curious.

### Decision Gates (OP-06)
- **D-06:** Decision gates appear as cards in the chat thread with Approve / Request Changes / Ask Ryan buttons. Consistent with error card pattern. Pipeline pauses until operator responds.

### Audit Trail (OP-07)
- **D-07:** Every decision, AI output, clarification answer, and verification result is timestamped in the audit trail. Claude's discretion on storage format and display.

### Claude's Discretion
- Audit trail storage format and display location
- Decision gate visual styling details (within DESIGN.md constraints)
- Progress indicator animation specifics beyond the pulse described in DESIGN.md
- Retry queue mechanism for provider exhaustion recovery

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Operator Mode — OP-01 through OP-11 (all 11 requirements)

### Design
- `DESIGN.md` — Motion section for running pulse animation, color system for status verdicts, semantic alert colors for error states

### Existing Components
- `packages/web/src/components/session/MessageBubble.tsx` — Reusable for chat-style messages
- `packages/web/src/components/session/MessageList.tsx` — Chat thread container
- `packages/web/src/components/session/InputArea.tsx` — Text input for operator answers
- `packages/web/src/components/decision/DecisionGateCard.tsx` — Existing decision gate pattern
- `packages/web/src/components/shared/VerdictBadge.tsx` — Pass/fail badge component

### Phase 17 Context
- `.planning/phases/17-auth-harness-independence/17-CONTEXT.md` — Auth flow, intake form, harness execution decisions that this phase builds on

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `MessageBubble.tsx`, `MessageList.tsx`, `InputArea.tsx` — Chat-style UI components for the conversational flow
- `DecisionGateCard.tsx`, `DecisionQueue.tsx` — Decision gate pattern
- `VerdictBadge.tsx` — Pass/fail status badges
- `Skeleton.tsx` — Loading skeleton component
- `EmptyState.tsx` — Empty state component
- `StreamingCursor.tsx` — Streaming text indicator

### Established Patterns
- SSE streaming for real-time updates (proven pattern)
- Card-based UI components with consistent border/surface colors
- TanStack Query for server state management
- Hono RPC client for type-safe API calls

### Integration Points
- Builds on Phase 17's intake form and auth context
- Chat thread is the same view where the intake form lives (operator home)
- SSE events from harness subprocess drive progress indicator updates
- Decision gate responses flow back to harness via API route

</code_context>

<specifics>
## Specific Ideas

- The entire operator experience is a single chat thread: submit → clarify → approve → progress → result (or error). No page navigation.
- "Ask Ryan" is the universal escalation button across all error states and decision gates
- Non-technical language throughout — no technical jargon in progress, errors, or reports

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-operator-mode*
*Context gathered: 2026-04-11*
