# Phase 18: Operator Mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 18-operator-mode
**Areas discussed:** Clarification flow, Progress visualization, Error handling UX, Verification report

---

## Clarification Flow

### Question Presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Chat-style Q&A (Recommended) | Questions one at a time in conversational thread, adaptive | ✓ |
| All questions at once | Form with all questions, fill and submit together | |
| Multi-choice cards | Clickable suggested answers with text fallback | |

**User's choice:** Chat-style Q&A
**Notes:** Reuses existing MessageBubble/MessageList components. Questions adapt based on earlier answers.

### Execution Brief Approval

| Option | Description | Selected |
|--------|-------------|----------|
| Inline brief + approve button (Recommended) | Brief appears in chat thread with Approve & Start / Request Changes | ✓ |
| Separate review page | Dedicated page with brief sections | |
| Email brief for async approval | Brief sent via email, approve via link | |

**User's choice:** Inline brief + approve button

---

## Progress Visualization

| Option | Description | Selected |
|--------|-------------|----------|
| Horizontal step indicator (Recommended) | 5-step progress bar: Thinking → Planning → Building → Checking → Done | ✓ |
| Pipeline topology (reuse hero) | Adapt existing 5-stage pipeline visualization | |
| Spinner + status text only | Minimal spinner with updating text | |

**User's choice:** Horizontal step indicator
**Notes:** Current step pulses/glows. Past steps show checkmarks. Includes elapsed time and plain-language status message.

---

## Error Handling UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline cards in chat thread (Recommended) | Styled cards in chat flow with explanation + action buttons | ✓ |
| Toast notifications | Pop-up banners at top of screen | |
| Dedicated error page | Navigate to separate error view | |

**User's choice:** Inline cards in chat thread
**Notes:** Consistent with conversational pattern. Four error types each get specific cards with appropriate action buttons.

---

## Verification Report

| Option | Description | Selected |
|--------|-------------|----------|
| Summary card + expandable details (Recommended) | Pass/fail badge + summary, expandable sections for details | ✓ |
| Full report inline | Everything expanded by default | |
| Link to external report | Brief message with link to full report page | |

**User's choice:** Summary card + expandable details
**Notes:** Operator sees outcome first (pass/fail + summary). Expandable sections: "What was built", "Quality checks", "Files changed".

---

## Claude's Discretion

- Audit trail storage format and display location
- Decision gate visual styling (within DESIGN.md constraints)
- Progress indicator animation beyond DESIGN.md pulse
- Retry queue mechanism for provider exhaustion

## Deferred Ideas

None
