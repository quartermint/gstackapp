# Phase 18: Operator Mode - Research

**Researched:** 2026-04-11
**Domain:** Conversational UI, state machines, SSE real-time updates, error UX
**Confidence:** HIGH

## Summary

Phase 18 builds the full operator experience on top of Phase 17's infrastructure (auth, intake form, pipeline spawner, file watcher, SSE events, decision gates). The core challenge is transforming the current "submit and watch a progress list" UI into a single-page conversational flow where the operator submits a request, answers clarification questions, approves an execution brief, watches a horizontal progress bar, and receives either a verification report or an error card -- all within one chat thread.

The existing codebase provides substantial infrastructure: `operatorRequests` and `auditTrail` DB tables, the `operator.ts` route with POST /request + GET /history + gate-response, the SSE event bus with `operator:progress`/`operator:gate`/`operator:complete` event types, the file watcher polling system, and the pipeline spawner. Frontend components `MessageBubble`, `MessageList`, `InputArea`, `DecisionGateCard`, `VerdictBadge`, `IntakeForm`, `PipelineProgress`, and `OperatorHome` all exist and are reusable.

**Primary recommendation:** Extend the existing infrastructure rather than rebuilding. The operator request lifecycle needs a state machine (pending -> clarifying -> briefing -> running -> complete/failed), new API routes for clarification and brief approval, new SSE event types for clarification flow, and 6 new frontend components as specified in the UI-SPEC.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Chat-style Q&A for clarification. After the operator submits the intake form, questions appear one at a time in a conversational thread below the original request. Operator types answers inline. Questions can adapt based on earlier answers (up to 5 questions per OP-02).
- **D-02:** Execution brief appears inline in the same chat thread. Displays scope summary, assumptions, and acceptance criteria in a styled card. Two buttons: "Approve & Start" and "Request Changes". Rejecting returns to clarification flow.
- **D-03:** Horizontal 5-step progress indicator below the chat thread. Steps: Thinking -> Planning -> Building -> Checking -> Done. Current step pulses/glows (matches DESIGN.md running pulse animation). Past steps show checkmarks. Includes elapsed time and a plain-language status message.
- **D-04:** All errors render as inline cards in the chat thread. Each card has plain-language explanation + 2-3 action buttons. Specific error types: Timeout (OP-08), Verification failure (OP-09), Ambiguous scope (OP-10), Provider exhaustion (OP-11).
- **D-05:** Summary card with expandable details in the chat thread. Top: pass/fail badge with 1-2 sentence plain-language summary. Below: expandable accordion sections.
- **D-06:** Decision gates appear as cards in the chat thread with Approve / Request Changes / Ask Ryan buttons.
- **D-07:** Every decision, AI output, clarification answer, and verification result is timestamped in the audit trail. Claude's discretion on storage format and display.

### Claude's Discretion
- Audit trail storage format and display location
- Decision gate visual styling details (within DESIGN.md constraints)
- Progress indicator animation specifics beyond the pulse described in DESIGN.md
- Retry queue mechanism for provider exhaustion recovery

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OP-01 | Operator can submit a request via intake form | Already implemented in IntakeForm.tsx + POST /api/operator/request. Needs integration with clarification flow. |
| OP-02 | System asks up to 5 clarification questions powered by gbrain context before locking scope | New API route + Claude API call to generate questions. New ClarificationThread component. State machine transition: pending -> clarifying. |
| OP-03 | System generates an execution brief that operator approves before execution starts | New ExecutionBrief component. API route to generate brief from clarification answers. State: clarifying -> briefing -> approved. |
| OP-04 | Operator sees non-technical progress visualization | New OperatorProgressBar component (horizontal 5-step). Reuses SSE pattern from PipelineProgress but with different stage mapping. |
| OP-05 | System produces a verification report in plain language | New VerificationReport component. API route to read result.json and translate to plain language. |
| OP-06 | Decision gates pause pipeline and present buttons | Existing GateCard in PipelineProgress.tsx + gate-response API route. Needs visual adaptation for chat thread context. |
| OP-07 | Every decision, AI output, and verification result is timestamped in audit trail | Existing auditTrail table + insert calls. New AuditTrail component for display. Extend audit action types. |
| OP-08 | On harness timeout, operator sees wait/escalate options | New ErrorCard component with timeout variant. Server-side timeout detection (5min timer or harness signal). |
| OP-09 | On verification failure, operator sees plain-language explanation | ErrorCard with BLOCK variant. Parse result.json for failure details. |
| OP-10 | On ambiguous request, system presents partial brief + escalation | ErrorCard with ambiguous variant. Triggered when clarification exhausts 5 questions without locking scope. |
| OP-11 | On provider failure, operator sees "temporarily unavailable" with retry queue | ErrorCard with provider-exhaustion variant. Retry queue mechanism (Claude's discretion). |
</phase_requirements>

## Standard Stack

### Core (already installed -- no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | ^4.12 | API routes for clarification, brief, verification | Already the backend framework [VERIFIED: package.json] |
| @anthropic-ai/sdk | ^0.80 | Generate clarification questions and execution brief | Already installed for pipeline AI [VERIFIED: package.json] |
| Drizzle ORM | ^0.45 | DB operations for request state, audit trail | Already the ORM [VERIFIED: package.json] |
| React | ^19.2 | New UI components | Already the frontend framework [VERIFIED: package.json] |
| @tanstack/react-query | ^5.95 | Server state for clarification flow, request polling | Already installed [VERIFIED: package.json] |
| Zod | ^3.24 | Validation for new API routes | Already installed [VERIFIED: package.json] |
| Vitest | ^3.1 | Tests for new API routes and state transitions | Already the test framework [VERIFIED: vitest.config.ts] |

### Supporting (no new packages needed)

This phase requires zero new npm dependencies. All functionality is built with the existing stack. [VERIFIED: codebase analysis]

## Architecture Patterns

### Request State Machine

The `operatorRequests.status` field currently uses: `pending`, `running`, `complete`, `failed`. Phase 18 extends this to a full lifecycle:

```
pending -> clarifying -> briefing -> approved -> running -> complete
                |            |                      |
                v            v                      v
              failed      failed                  failed
                                                    |
                                                    v
                                                  timeout
```

New status values needed: `clarifying`, `briefing`, `approved`, `timeout`

### Recommended Project Structure (new files)

```
packages/api/src/
├── routes/
│   └── operator.ts                    # Extend with clarification + brief routes
├── pipeline/
│   └── clarifier.ts                   # NEW: Claude API call for clarification questions
│   └── brief-generator.ts            # NEW: Generate execution brief from Q&A
│   └── timeout-monitor.ts            # NEW: 5-min timeout detection per request
│   └── system-prompt.ts              # Extend to support clarification stage output
│   └── spawner.ts                     # Extend to include clarification context
│   └── file-watcher.ts               # Extend to detect timeout/error result types
├── events/
│   └── bus.ts                         # Extend OperatorEventType with new events

packages/web/src/components/operator/
├── OperatorHome.tsx                   # Refactor: chat thread as primary view
├── IntakeForm.tsx                     # Minor: trigger clarification flow on success
├── ClarificationThread.tsx            # NEW: Q&A conversational flow
├── ExecutionBrief.tsx                 # NEW: Approval card
├── OperatorProgressBar.tsx            # NEW: Horizontal 5-step indicator
├── VerificationReport.tsx             # NEW: Results card with accordions
├── ErrorCard.tsx                      # NEW: Inline error cards (4 variants)
├── AuditTrail.tsx                     # NEW: Timestamped event log
├── PipelineProgress.tsx               # Existing: may be superseded by OperatorProgressBar
```

### Pattern 1: Conversational State via SSE

**What:** The chat thread state is driven by SSE events from the server. Each transition (new question, brief generated, stage progress, error, completion) arrives as an SSE event and React state updates accordingly.

**When to use:** All operator-facing real-time updates.

**Example:**
```typescript
// New SSE event types for clarification flow
export type OperatorEventType =
  | 'operator:progress'
  | 'operator:gate'
  | 'operator:gate:resolved'
  | 'operator:complete'
  | 'operator:clarification:question'   // NEW
  | 'operator:clarification:complete'   // NEW
  | 'operator:brief:generated'          // NEW
  | 'operator:brief:approved'           // NEW
  | 'operator:error'                    // NEW (timeout, verification failure, etc.)
  | 'operator:verification:report'      // NEW
```
[VERIFIED: existing pattern in packages/api/src/events/bus.ts]

### Pattern 2: Clarification via Claude API

**What:** After intake form submission, call Claude API to generate up to 5 clarification questions. Each answer feeds back into context for the next question. This is a server-side loop, not a harness subprocess.

**When to use:** Between intake submission and execution brief generation.

**Example:**
```typescript
// packages/api/src/pipeline/clarifier.ts
import Anthropic from '@anthropic-ai/sdk'

interface ClarificationContext {
  whatNeeded: string
  whatGood: string
  deadline?: string
  previousQA: Array<{ question: string; answer: string }>
}

export async function generateClarificationQuestion(
  ctx: ClarificationContext
): Promise<{ question: string; isComplete: boolean }> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: `You are helping clarify a non-technical user's request. 
Ask one specific, plain-language question to reduce ambiguity.
If the request is already clear enough, respond with {"isComplete": true}.
Maximum ${5 - ctx.previousQA.length} questions remaining.`,
    messages: [
      { role: 'user', content: JSON.stringify(ctx) }
    ],
  })
  // Parse structured response
  // ...
}
```
[ASSUMED: model choice -- Claude Sonnet for cost-effective clarification vs Opus for pipeline execution]

### Pattern 3: Operator Progress Stage Mapping

**What:** The harness subprocess writes stages as `clarify/plan/execute/verify`, but the operator sees `Thinking/Planning/Building/Checking/Done`. The frontend maps between these.

**When to use:** OperatorProgressBar component.

**Example:**
```typescript
const OPERATOR_STAGES = [
  { key: 'thinking', label: 'Thinking', harnessStages: ['clarify'] },
  { key: 'planning', label: 'Planning', harnessStages: ['plan'] },
  { key: 'building', label: 'Building', harnessStages: ['execute'] },
  { key: 'checking', label: 'Checking', harnessStages: ['verify'] },
  { key: 'done', label: 'Done', harnessStages: [] },
]
```
[VERIFIED: existing STAGE_ORDER in PipelineProgress.tsx maps clarify/plan/execute/verify]

### Anti-Patterns to Avoid
- **Polling for clarification answers:** Don't have the server poll for answers. Use standard POST request from the InputArea, then server generates next question and pushes via SSE.
- **Separate page for each flow stage:** The entire operator experience is a single chat thread per D-01. No page navigation, no route changes.
- **Technical jargon in SSE event data reaching the UI:** All `message` fields in SSE events should use the copywriting contract from UI-SPEC.
- **Spawning harness before brief approval:** The Claude Code subprocess should only spawn after the operator clicks "Approve & Start" (status = `approved`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE event streaming | Custom WebSocket layer | Hono streamSSE + EventSource | Already proven in this codebase, unidirectional is sufficient |
| State machine transitions | Ad-hoc if/else chains | Explicit status enum + transition validation function | Prevents invalid state transitions (e.g., running -> clarifying) |
| Timeout detection | Manual setTimeout per request | Server-side timer started on `approved` status, checked by file-watcher poll | 5-min timeout per OP-08 needs to survive server restarts (use DB timestamp) |
| Audit trail insertion | Manual inserts everywhere | Centralized `logAuditEvent()` helper | Consistent format, never forget to log |

**Key insight:** The biggest complexity is the state machine -- not any single component. A validated state transition function prevents the most dangerous bugs (request in wrong state, pipeline spawned twice, clarification after execution started).

## Common Pitfalls

### Pitfall 1: SSE Event Ordering Race Conditions
**What goes wrong:** SSE events arrive out of order or duplicate when the file watcher processes files in rapid succession.
**Why it happens:** The file watcher polls every 2 seconds. Multiple progress files can appear between polls.
**How to avoid:** Include a sequence number in progress files (already done: `progress-NNN.json` naming). Process in filename order. Client deduplicates by sequence.
**Warning signs:** UI shows steps out of order or flickers between states.

### Pitfall 2: Clarification Flow Interruption
**What goes wrong:** Operator closes browser mid-clarification, reopens later, and the flow state is lost.
**Why it happens:** If clarification Q&A is only stored in React state, it's lost on page refresh.
**How to avoid:** Store each Q&A pair in the database (extend auditTrail or add a `clarification_qa` table). On page load, reconstruct the chat thread from persisted data.
**Warning signs:** Operator sees blank thread after page refresh during active clarification.

### Pitfall 3: Stale Request Status After Error
**What goes wrong:** Pipeline subprocess crashes but server doesn't detect it, leaving request stuck in `running` status forever.
**Why it happens:** The completion callback never fires. The file watcher keeps polling an abandoned directory.
**How to avoid:** Implement timeout detection: if request has been `running` for >5 minutes with no progress file updates, transition to `timeout` status. Use `pipelinePid` to check if process is still alive (`kill -0 pid`).
**Warning signs:** "In Progress" section shows stale requests that never complete.

### Pitfall 4: "Ask Ryan" Escalation Without Notification
**What goes wrong:** Operator clicks "Ask Ryan" but Ryan never finds out.
**Why it happens:** The escalation is just a DB status change with no notification mechanism.
**How to avoid:** Define what "Ask Ryan" actually does. Options: (1) write audit trail entry + mark request as `escalated` for Ryan to see on admin dashboard (Phase 20), (2) use existing ntfy push notification to Ryan's Mac Mini. For Phase 18, option 1 is sufficient -- the admin dashboard in Phase 20 can surface escalated requests.
**Warning signs:** Operators escalate but nothing visible happens.

### Pitfall 5: Double Pipeline Spawn
**What goes wrong:** Operator double-clicks "Approve & Start" and two pipelines spawn.
**Why it happens:** No server-side idempotency check between button click and pipeline spawn.
**How to avoid:** The existing `running` status check in POST /request prevents multiple active pipelines per user. Apply similar guard to the approval endpoint: only transition from `briefing` to `approved` if current status is exactly `briefing`.
**Warning signs:** Two Claude Code subprocesses running for the same request.

## Code Examples

### State Transition Validator
```typescript
// packages/api/src/pipeline/state-machine.ts
// Source: derived from existing operatorRequests.status usage

type RequestStatus = 
  | 'pending' | 'clarifying' | 'briefing' | 'approved' 
  | 'running' | 'complete' | 'failed' | 'timeout' | 'escalated'

const VALID_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  pending: ['clarifying', 'failed'],
  clarifying: ['briefing', 'failed', 'escalated'],
  briefing: ['approved', 'clarifying', 'escalated'],  // "Request Changes" goes back
  approved: ['running', 'failed'],
  running: ['complete', 'failed', 'timeout'],
  complete: [],
  failed: [],
  timeout: ['running', 'escalated'],  // "Keep Waiting" retries, "Ask Ryan" escalates
  escalated: [],
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
```
[VERIFIED: pattern consistent with existing status checks in operator.ts]

### Clarification API Route Extension
```typescript
// Extension to packages/api/src/routes/operator.ts

// POST /api/operator/:requestId/clarify-answer
// Operator submits answer to a clarification question
operatorApp.post('/:requestId/clarify-answer', async (c) => {
  const requestId = c.req.param('requestId')
  const { answer } = await c.req.json()
  
  // 1. Store answer in audit trail
  // 2. Generate next question (or mark clarification complete)
  // 3. If complete, generate execution brief
  // 4. Emit SSE event with next question or brief
})
```
[VERIFIED: follows existing route patterns in operator.ts]

### ErrorCard Component Pattern
```typescript
// packages/web/src/components/operator/ErrorCard.tsx
// Source: UI-SPEC error state interactions table

interface ErrorCardProps {
  type: 'timeout' | 'verification-failure' | 'ambiguous-scope' | 'provider-exhaustion'
  message?: string
  onAction: (action: string) => void
}

const ERROR_CONFIG = {
  'timeout': {
    borderColor: '#FFB020',
    title: 'Taking longer than expected',
    body: 'The system is still working on your request. You can wait or ask Ryan to check on it.',
    buttons: [
      { label: 'Keep Waiting', action: 'wait' },
      { label: 'Ask Ryan', action: 'escalate' },
    ],
  },
  'verification-failure': {
    borderColor: '#FF5A67',
    title: 'Quality check found issues',
    body: "Some checks didn't pass. You can request changes to address them or ask Ryan for help.",
    buttons: [
      { label: 'Request Changes', action: 'request-changes', preSelected: true },
      { label: 'Ask Ryan', action: 'escalate' },
    ],
  },
  // ... ambiguous-scope, provider-exhaustion
}
```
[VERIFIED: copy from UI-SPEC copywriting contract, colors from DESIGN.md]

### Audit Trail Storage Format
```typescript
// Recommended audit trail action types for Phase 18
type AuditAction =
  | 'request_submitted'         // existing
  | 'pipeline_spawned'          // existing
  | 'pipeline_complete'         // existing
  | 'gate_response'             // existing
  | 'clarification_question'    // NEW: system asked a question
  | 'clarification_answer'      // NEW: operator answered
  | 'brief_generated'           // NEW: execution brief created
  | 'brief_approved'            // NEW: operator approved
  | 'brief_rejected'            // NEW: operator requested changes
  | 'stage_transition'          // NEW: pipeline stage changed
  | 'verification_pass'         // NEW: verification succeeded
  | 'verification_fail'         // NEW: verification failed
  | 'timeout_detected'          // NEW: 5-min timeout hit
  | 'escalated_to_ryan'         // NEW: operator clicked "Ask Ryan"
  | 'provider_exhaustion'       // NEW: all LLM providers failed
  | 'retry_queued'              // NEW: request saved for retry

// Detail field stores JSON with context for each action type
```
[VERIFIED: extends existing auditTrail table pattern with action + detail columns]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct pipeline spawn on form submit | Clarification -> Brief -> Approval -> Spawn | Phase 18 | Prevents misunderstood requests from consuming expensive AI time |
| Vertical stage progress list | Horizontal 5-step progress bar with non-technical labels | Phase 18 | Operator-friendly visualization |
| Silent error on pipeline failure | Typed error cards with actionable buttons | Phase 18 | Operator can self-serve recovery in most cases |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude Sonnet is sufficient for clarification question generation (vs Opus for main pipeline) | Architecture Patterns, Pattern 2 | Minimal -- can upgrade model if question quality is poor. Cost difference only. |
| A2 | "Ask Ryan" in Phase 18 means DB status change + audit trail entry only (no push notification) | Common Pitfalls, Pitfall 4 | Low -- ntfy notification can be added easily. Ryan can see escalated requests in admin view (Phase 20). |
| A3 | Clarification Q&A should be stored in auditTrail table (not a separate table) | Pitfalls, Pitfall 2 | Low -- auditTrail already has requestId + action + detail columns. Separate table is also viable but adds schema complexity. |
| A4 | Provider exhaustion retry queue can be a simple DB status (`retry_queued`) with a periodic check, not a proper job queue | Claude's Discretion areas | Medium -- if retry volume is high, a proper queue (BullMQ) would be better. For Phase 1 single-user, DB polling is sufficient. |

## Open Questions (RESOLVED)

1. **RESOLVED: Clarification question source -- direct Claude API call.**
   - Resolution: Use direct Claude API call for clarification. It's a lightweight operation (generate 1 question at a time) that doesn't need the full harness sandbox. The harness subprocess spawns only after brief approval for the heavier plan/execute/verify stages. Implemented in Plan 18-01 Task 2 (clarifier.ts).

2. **RESOLVED: gbrain integration deferred to Phase 19.**
   - Resolution: Phase 18 implements clarification without gbrain. The `ClarificationContext` interface includes an extension point (context parameter) that Phase 19 fills in. Clarification works without gbrain -- it just lacks project/person context until then. Implemented in Plan 18-01 Task 2 (clarifier.ts ClarificationContext interface).

3. **RESOLVED: Harness progress maps to 5 operator-visible steps via STAGE_MAP.**
   - Resolution: Map harness `plan` -> operator `Planning`, harness `execute` -> operator `Building`, harness `verify` -> operator `Checking`. The `Thinking` step maps to the pre-spawn period (brief generation + approval). `Done` is triggered by the completion callback. Implemented in Plan 18-03 Task 2 (OperatorProgressBar.tsx STAGE_MAP).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `cd packages/api && npx vitest run --reporter=dot` |
| Full suite command | `cd packages/api && npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OP-01 | Submit intake form creates request | unit | `npx vitest run src/__tests__/operator-request.test.ts -t "create"` | Exists (partial) |
| OP-02 | Clarification questions generated, max 5 | unit | `npx vitest run src/__tests__/operator-clarify.test.ts` | Wave 0 |
| OP-03 | Execution brief generated and approval flow | unit | `npx vitest run src/__tests__/operator-brief.test.ts` | Wave 0 |
| OP-04 | Progress visualization via SSE | integration | `npx vitest run src/__tests__/operator-progress.test.ts` | Wave 0 |
| OP-05 | Verification report generation | unit | `npx vitest run src/__tests__/operator-verification.test.ts` | Wave 0 |
| OP-06 | Decision gate pause/resume | unit | `npx vitest run src/__tests__/operator-request.test.ts -t "gate"` | Exists (partial) |
| OP-07 | Audit trail entries for all actions | unit | `npx vitest run src/__tests__/operator-audit.test.ts` | Wave 0 |
| OP-08 | Timeout detection at 5min | unit | `npx vitest run src/__tests__/operator-timeout.test.ts` | Wave 0 |
| OP-09 | Verification failure error card | unit | `npx vitest run src/__tests__/operator-errors.test.ts` | Wave 0 |
| OP-10 | Ambiguous scope after 5 questions | unit | `npx vitest run src/__tests__/operator-clarify.test.ts -t "ambiguous"` | Wave 0 |
| OP-11 | Provider exhaustion + retry queue | unit | `npx vitest run src/__tests__/operator-errors.test.ts -t "provider"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api && npx vitest run --reporter=dot`
- **Per wave merge:** `cd packages/api && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/operator-clarify.test.ts` -- covers OP-02, OP-10
- [ ] `src/__tests__/operator-brief.test.ts` -- covers OP-03
- [ ] `src/__tests__/operator-progress.test.ts` -- covers OP-04
- [ ] `src/__tests__/operator-verification.test.ts` -- covers OP-05
- [ ] `src/__tests__/operator-audit.test.ts` -- covers OP-07
- [ ] `src/__tests__/operator-timeout.test.ts` -- covers OP-08
- [ ] `src/__tests__/operator-errors.test.ts` -- covers OP-09, OP-11

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Handled by Phase 17 auth middleware |
| V3 Session Management | no | Handled by Phase 17 session cookies |
| V4 Access Control | yes | Existing session isolation in operator.ts (operator sees only own requests) |
| V5 Input Validation | yes | Zod schemas for all new API routes (clarify-answer, brief-approval) |
| V6 Cryptography | no | No new crypto operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via clarification answers | Tampering | Clarification answers passed via structured API, not interpolated into CLI args (existing T-17-14 pattern) |
| Cross-user request access | Elevation of privilege | Existing session isolation check: `user.role === 'operator' && request.userId !== user.id` |
| State machine bypass (e.g., skip approval) | Tampering | Validated state transitions -- only transition from `briefing` to `approved` |
| Pipeline PID spoofing via callback | Spoofing | Existing: callback validates pipelineId exists in DB before processing |

## Sources

### Primary (HIGH confidence)
- `packages/api/src/routes/operator.ts` -- existing operator routes, gate response, callback
- `packages/api/src/db/schema.ts` -- operatorRequests + auditTrail table definitions
- `packages/api/src/events/bus.ts` -- SSE event types for operator flow
- `packages/api/src/pipeline/spawner.ts` -- pipeline spawn architecture
- `packages/api/src/pipeline/file-watcher.ts` -- file polling for progress
- `packages/api/src/pipeline/system-prompt.ts` -- harness instructions
- `packages/web/src/components/operator/` -- all existing operator UI components
- `packages/web/src/components/session/` -- MessageBubble, InputArea, MessageList
- `.planning/phases/18-operator-mode/18-UI-SPEC.md` -- visual/interaction contract
- `.planning/phases/18-operator-mode/18-CONTEXT.md` -- locked decisions D-01 through D-07
- `DESIGN.md` -- colors, typography, motion, layout constraints

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` -- OP-01 through OP-11 requirement definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all verified in package.json
- Architecture: HIGH -- extends existing patterns (SSE, operator routes, file watcher), state machine is well-defined
- Pitfalls: HIGH -- identified from direct codebase analysis of existing operator flow gaps

**Research date:** 2026-04-11
**Valid until:** 2026-05-11 (stable -- all infrastructure is internal)
