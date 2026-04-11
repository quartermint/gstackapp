---
phase: 18-operator-mode
fixed_at: 2026-04-11T00:00:00Z
review_path: .planning/phases/18-operator-mode/18-REVIEW.md
iteration: 1
findings_in_scope: 8
fixed: 8
skipped: 0
status: all_fixed
---

# Phase 18: Code Review Fix Report

**Fixed at:** 2026-04-11
**Source review:** .planning/phases/18-operator-mode/18-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 8
- Fixed: 8
- Skipped: 0

## Fixed Issues

### CR-01: `reportRef` Recreated Every Render -- Verification Report Always Null at Completion

**Files modified:** `packages/web/src/components/operator/OperatorHome.tsx`
**Commit:** 5931a1d
**Applied fix:** Replaced plain object literal `{ current: null as VerificationReportData | null }` with `useRef<VerificationReportData | null>(null)` and added `useRef` to the React import. This ensures the ref persists across renders so the verification report is available when the `operator:complete` event fires.

### CR-02: Path Traversal in Gate Response File Write

**Files modified:** `packages/api/src/routes/operator.ts`
**Commit:** 468d8ba
**Applied fix:** Added `basename()` sanitization of `gateId` to strip directory components, a regex validation (`/^[\w-]+$/`) to reject non-alphanumeric characters, and a `resolve()` check to verify the final path stays within `outputDir`. Added `basename` and `resolve` to the `node:path` import.

### WR-01: Missing State Machine Transition in Pipeline Callback

**Files modified:** `packages/api/src/routes/operator.ts`
**Commit:** ce12385
**Applied fix:** Replaced the raw `db.update` that set `status: 'complete'` directly with a `transitionRequest(pipelineId, 'complete')` call wrapped in try/catch (to handle cases where the request is already in a terminal state like `escalated`). The `completedAt` timestamp is still set via a separate `db.update` after the transition.

### WR-02: TOCTOU Race in retry-timeout

**Files modified:** `packages/api/src/routes/operator.ts`
**Commit:** 2b613a6
**Applied fix:** Added a fresh DB read after `transitionRequest(requestId, 'running')` succeeds, using `freshRequest.pipelinePid` instead of the stale snapshot's PID for the `process.kill(pid, 0)` liveness check. This prevents sending a signal to a recycled PID if a concurrent re-spawn updated the record between the initial read and the transition.

### WR-03: Unchecked `content[0]` Access in clarifier.ts and brief-generator.ts

**Files modified:** `packages/api/src/pipeline/clarifier.ts`, `packages/api/src/pipeline/brief-generator.ts`
**Commit:** 252676f
**Applied fix:** Changed both files to use optional chaining: `const block = response.content[0]; const text = block?.type === 'text' ? block.text : ''`. In `brief-generator.ts`, added an explicit throw with a meaningful error message when `text` is empty, since the brief generator cannot proceed without content.

### WR-04: JSON.parse Throws on Markdown-Wrapped JSON in brief-generator.ts

**Files modified:** `packages/api/src/pipeline/brief-generator.ts`
**Commit:** 07fb6e9
**Applied fix:** Added an `extractJson()` helper function that strips triple-backtick markdown fences (with optional `json` language tag) before passing the text to `JSON.parse`. Falls back to trimmed raw text if no fences are found.

### WR-05: All OperatorHome Action Handlers Silently Swallow Fetch Errors

**Files modified:** `packages/web/src/components/operator/OperatorHome.tsx`
**Commit:** 68e2a2b
**Applied fix:** Added `res.ok` checks to all 7 action handlers (`handleClarifyAnswer`, `handleApproveBrief`, `handleRejectBrief`, `handleErrorAction` wait/escalate/retry branches, `handleGateResponse`, `handleGateEscalate`). On non-OK responses, the handler parses the error body and transitions to the `error` phase with `errorType: 'request-failed'` and the server's error message, giving the operator visible feedback instead of silent failure.

### WR-06: Migration Script Targets Deprecated SQLite Stack

**Files modified:** `migrate_pipeline_runs.js`
**Commit:** ff4f003
**Applied fix:** Added a deprecation comment and a top-level `throw new Error(...)` before any executable code, preventing accidental re-execution against the old SQLite path. The error message directs developers to the current Drizzle/Postgres schema.

## Skipped Issues

None -- all in-scope findings were fixed.

---

_Fixed: 2026-04-11_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
