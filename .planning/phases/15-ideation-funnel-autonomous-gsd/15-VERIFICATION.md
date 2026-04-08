---
phase: 15-ideation-funnel-autonomous-gsd
verified: 2026-04-08T18:00:00Z
status: human_needed
score: 9/9 must-haves verified (automated)
overrides_applied: 0
gaps: []
human_verification:
  - test: "Ideation pipeline visual flow"
    expected: "Navigating to Ideation view shows 4-node horizontal pipeline (office-hours -> CEO review -> eng review -> design consultation). Entering an idea and clicking Start Ideation activates the first stage with pulse glow animation."
    why_human: "SSE streaming + visual state transitions cannot be verified programmatically without a running server"
  - test: "Pipeline completion to scaffold flow"
    expected: "After ideation pipeline completes, 'Launch Execution' CTA appears. Clicking it opens the RepoScaffoldForm modal with pre-populated context from the ideation session."
    why_human: "End-to-end cross-component flow requires browser execution"
  - test: "Autonomous execution visualization"
    expected: "After scaffolding a repo, AutonomousView shows vertical phase pipeline. Phases update status (pending -> running -> complete/failed) in real time as GSD executes. Commits appear in CommitStream with auto-scroll."
    why_human: "Requires running GSD tools + live SSE streaming to verify phase state transitions"
  - test: "Decision gate interaction"
    expected: "When a blocking decision gate is created during autonomous execution, DecisionQueue appears in sidebar with amber badge count. Clicking an option resolves the gate and unblocks execution."
    why_human: "Gate Promise-based blocking and resolution requires live execution to observe"
  - test: "Multi-tab session management"
    expected: "Clicking '+' creates a new tab (defaults to ideation type). Tabs show status dot (cyan pulse = thinking, amber = waiting). Max 10 tabs enforced — button disabled at limit."
    why_human: "Tab state, status dots, and overflow behavior require browser interaction"
  - test: "Repo scaffold form validation"
    expected: "Form enforces /^[a-z0-9-]+$/ name pattern with real-time error. Stack selector shows 4 options (React, Python, Swift, Go). Submitting creates real .planning/ directory structure in the specified location."
    why_human: "Form validation UX and filesystem side effects require live testing"
---

# Phase 15: Ideation Funnel & Autonomous GSD Verification Report

**Phase Goal:** Ideation funnel (browser-based AI skill pipeline for idea refinement) and autonomous GSD execution (one-click discuss→plan→execute with decision gates).
**Verified:** 2026-04-08T18:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                   | Status     | Evidence                                                                                                  |
|----|-------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------------------------------------|
| 1  | User can submit an idea and trigger a 4-stage AI skill pipeline         | ✓ VERIFIED | `useIdeation.startIdeation()` POSTs to `/api/ideation/start`, receives sessionId, opens SSE stream        |
| 2  | Pipeline chains office-hours → CEO review → eng review → design consult | ✓ VERIFIED | `IDEATION_STAGES` constant in both `skill-bridge.ts` and `IdeationPipeline.tsx`, orchestrator iterates in order |
| 3  | Pipeline stages stream real-time SSE events to the browser              | ✓ VERIFIED | `GET /api/ideation/stream/:sessionId` calls `streamSSE()`, loops over `runIdeationPipeline()` async generator |
| 4  | Artifacts from each stage are persisted and displayed                   | ✓ VERIFIED | `ideationArtifacts` DB table, `detectNewArtifact()` in orchestrator, `ArtifactCard` fetches via `/api/ideation/artifacts/:id` |
| 5  | Pipeline completion exposes "Launch Execution" CTA to scaffold a repo   | ✓ VERIFIED | `IdeationView` shows CTA when `status === 'complete'`, calls `onLaunchExecution(sessionId)` which opens `RepoScaffoldForm` modal |
| 6  | Autonomous execution launches GSD phase-by-phase with real spawned agents | ✓ VERIFIED | `runAutonomousExecution()` uses `spawn('node', [GSD_TOOLS_PATH, ...])` per T-15-09, not a stub — real subprocess invocation |
| 7  | Decision gates block autonomous execution until user responds           | ✓ VERIFIED | `GateManager.createGate()` returns a real `Promise` that blocks; `resolveGate()` resolves it; `useDecisionGates` POSTs to `/api/autonomous/:runId/gate-response` |
| 8  | Full execution view streams phases, commits, and gate queue in real time | ✓ VERIFIED | `AutonomousView` wires `useAutonomous` (SSE) + `useDecisionGates` (polling) + `AutonomousPipeline` + `CommitStream` + `DecisionQueue` |
| 9  | Multi-tab session management integrates all views into the app shell    | ✓ VERIFIED | `useSessionTabs` in `App.tsx`, `SessionTabBar` in `Shell.tsx`, ideation/autonomous nav in `Sidebar.tsx`, max 10 tabs enforced |

**Score:** 9/9 truths verified (automated)

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/shared/src/schemas/ideation.ts` | Zod schemas for ideation API | ✓ VERIFIED | 79L, exports ideationStartSchema, ideationArtifactSchema, decisionGateSchema, etc. |
| `packages/api/src/ideation/skill-bridge.ts` | Loads SKILL.md from filesystem, builds prompts | ✓ VERIFIED | 140L, IDEATION_STAGES const, loadSkillPrompt(), buildCumulativeContext() |
| `packages/api/src/ideation/orchestrator.ts` | Async generator chaining 4 stages | ✓ VERIFIED | 242L, runIdeationPipeline() generator, real DB updates, budget limits applied |
| `packages/api/src/routes/ideation.ts` | POST /start, GET /stream/:id, GET /artifacts/:id | ✓ VERIFIED | 203L, all 4 routes implemented, Zod validation, SSE via streamSSE() |
| `packages/api/src/autonomous/executor.ts` | Spawn GSD CLI for phase execution | ✓ VERIFIED | 330L, spawn() calls with GSD_TOOLS_PATH, real subprocess, not exec |
| `packages/api/src/autonomous/gate-manager.ts` | Promise-based gate lifecycle | ✓ VERIFIED | 142L, real Promise create/resolve/reject with DB persistence |
| `packages/api/src/autonomous/events.ts` | AutonomousSSEEvent discriminated union | ✓ VERIFIED | 16L, 10 event types defined |
| `packages/api/src/routes/autonomous.ts` | POST /launch, GET /stream/:id, POST /gate-response | ✓ VERIFIED | 194L, all routes implemented, HOME dir security check |
| `packages/api/src/routes/scaffold.ts` | POST /scaffold with template generation | ✓ VERIFIED | 67L, wired to templates.ts with name validation |
| `packages/api/src/ideation/templates.ts` | 4 stack templates with CLAUDE.md + .planning/ | ✓ VERIFIED | 365L, React/Python/Swift/Go templates with real file content |
| `packages/web/src/hooks/useIdeation.ts` | SSE lifecycle + idea submission | ✓ VERIFIED | 196L, full EventSource lifecycle, POST to /start, stage state Map |
| `packages/web/src/components/ideation/IdeationView.tsx` | Two-column ideation UI | ✓ VERIFIED | 234L, wired to useIdeation, renders pipeline + conversation + artifacts + Launch CTA |
| `packages/web/src/components/ideation/IdeationPipeline.tsx` | 4-node horizontal pipeline | ✓ VERIFIED | 100L, all 4 stages rendered with SVG connectors and trace-flow animation |
| `packages/web/src/hooks/useAutonomous.ts` | Autonomous SSE lifecycle + launch API | ✓ VERIFIED | 306L, POSTs to /launch, EventSource at /stream/:runId, cancel support |
| `packages/web/src/hooks/useDecisionGates.ts` | Gate queue with POST response | ✓ VERIFIED | 73L, POSTs to /api/autonomous/:runId/gate-response |
| `packages/web/src/components/autonomous/AutonomousView.tsx` | Full execution view | ✓ VERIFIED | 174L, composes all autonomous components via hooks |
| `packages/web/src/components/decision/DecisionQueue.tsx` | Gate sidebar queue | ✓ VERIFIED | 68L, auto-hides when empty, shows amber badge count |
| `packages/web/src/hooks/useSessionTabs.ts` | Multi-tab state (max 10) | ✓ VERIFIED | 85L, MAX_TABS=10 enforced, add/remove/select/updateStatus |
| `packages/web/src/components/session/SessionTabBar.tsx` | Tab strip in Shell | ✓ VERIFIED | 95L, overflow scroll, + button, wired in Shell.tsx |
| `packages/web/src/components/ideation/RepoScaffoldForm.tsx` | Modal scaffold form | ✓ VERIFIED | 259L, name validation regex, POSTs to /api/scaffold/scaffold |
| `packages/web/src/App.tsx` | Full flow wiring | ✓ VERIFIED | 217L, ideation→scaffold→autonomous flow wired, useSessionTabs + useDecisionGates integrated |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `IdeationInput` (user idea) | `POST /api/ideation/start` | `useIdeation.startIdeation()` | ✓ WIRED | fetch('/api/ideation/start', POST) → receives sessionId |
| `useIdeation` (sessionId) | `GET /api/ideation/stream/:id` | EventSource in connectSSE() | ✓ WIRED | Real EventSource, handles all 6 event types |
| `orchestrator.ts` | `runAgentLoop()` | `runIdeationPipeline()` yields IdeationSSEEvent | ✓ WIRED | imports from agent/loop, budget limits applied |
| `skill-bridge.ts` | `~/.claude/skills/gstack/{skill}/SKILL.md` | `loadSkillPrompt()` filesystem read | ✓ WIRED | readFileSync on validated stage name (T-15-02) |
| `IdeationView` (complete) | `RepoScaffoldForm` (modal) | `onLaunchExecution` callback → `App.setShowScaffoldForm(true)` | ✓ WIRED | Callback chain fully traced in App.tsx |
| `RepoScaffoldForm` | `POST /api/scaffold/scaffold` | fetch in handleScaffold() | ✓ WIRED | POSTs name+stack+description+sessionId |
| `useAutonomous` | `POST /api/autonomous/launch` | `startExecution()` fetch | ✓ WIRED | Receives runId, opens SSE stream |
| `executor.ts` | GSD CLI | `spawn('node', [GSD_TOOLS_PATH, ...])` | ✓ WIRED | Real subprocess spawn, not exec (T-15-09) |
| `gate-manager.ts` | `decision_gates` DB table | Drizzle insert/update | ✓ WIRED | Creates gate record + Promise, resolves on DB update |
| `useDecisionGates` | `POST /api/autonomous/:runId/gate-response` | `respondToGate()` | ✓ WIRED | POSTs gateId + response, triggers server-side resolveGate() |
| `Sidebar.tsx` | `IdeationView` / `AutonomousView` | `AppView` type + onNavigate | ✓ WIRED | 'ideation' and 'autonomous' added to AppView union |
| `Shell.tsx` | `SessionTabBar` | `hasTabs` conditional render | ✓ WIRED | Grid layout adjusts to 40px_1fr_40px when tabs present |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `IdeationView` | `stages` Map, `artifacts[]`, `conversationEvents[]` | `useIdeation` hook via SSE from `runIdeationPipeline()` | Yes — stages updated per SSE events from real agent loop | ✓ FLOWING |
| `ArtifactCard` | `artifacts: IdeationArtifact[]` | `fetchArtifacts()` → `GET /api/ideation/artifacts/:id` → `ideationArtifacts` DB table | Yes — DB query via Drizzle `eq(ideationArtifacts.sessionId, id)` | ✓ FLOWING |
| `AutonomousView` | `phases`, `commits`, `agentSpawns` | `useAutonomous` hook via SSE from `runAutonomousExecution()` | Yes — events from real GSD CLI subprocess output parsing | ✓ FLOWING |
| `DecisionQueue` | `gates: DecisionGate[]` | `useDecisionGates(runId)` → `GET /api/autonomous/:runId/status` | Yes — queries `decisionGates` DB table via GateManager | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| API registers ideation routes | `grep -n "route.*ideation" packages/api/src/index.ts` | `.route('/ideation', ideationApp)` found | ✓ PASS |
| API registers autonomous routes | `grep -n "route.*autonomous" packages/api/src/index.ts` | `.route('/autonomous', autonomousApp)` found | ✓ PASS |
| DB schema has all 4 ideation tables | Schema grep for ideationSessions, ideationArtifacts, autonomousRuns, decisionGates | All 4 tables present in schema.ts | ✓ PASS |
| All 11 phase commits in git log | `git log --oneline` grep for all commit hashes | All 11 hashes (31467cf through 1d8c1ed) confirmed | ✓ PASS |
| TypeScript compilation clean | `tsc --noEmit -p packages/api/tsconfig.json` | Only pre-existing TS2688 type definition warnings — zero real errors | ✓ PASS |
| SSE pipeline invocation | grep runIdeationPipeline in routes/ideation.ts | Called inside `streamSSE()` loop in `/stream/:sessionId` handler | ✓ PASS |
| Spawn not exec (security) | grep spawn/exec in executor.ts | `spawn('node', [GSD_TOOLS_PATH, ...args])` — array form, no exec | ✓ PASS |
| End-to-end browser SSE + visual states | Requires dev server | Cannot test without running server | ? SKIP |

### Requirements Coverage

| Requirement | Source Plan | Description (Derived) | Status | Evidence |
|-------------|-------------|----------------------|--------|---------|
| IDEA-01 | Plans 01, 03 | User can submit an idea to start a 4-stage ideation pipeline | ✓ SATISFIED | useIdeation.startIdeation() → POST /api/ideation/start → runIdeationPipeline() |
| IDEA-02 | Plans 01, 03 | Pipeline chains 4 gstack skills sequentially with cumulative context | ✓ SATISFIED | IDEATION_STAGES constant, buildCumulativeContext() in skill-bridge.ts |
| IDEA-03 | Plans 01, 03 | Pipeline streams real-time events to browser UI | ✓ SATISFIED | SSE route GET /stream/:sessionId, useIdeation SSE consumer |
| IDEA-04 | Plans 01, 03 | Artifacts from each stage are persisted and shown | ✓ SATISFIED | ideationArtifacts DB table, ArtifactCard component |
| AUTO-01 | Plans 02, 04 | Autonomous execution launches GSD phases for a given project | ✓ SATISFIED | POST /autonomous/launch → runAutonomousExecution() → spawn GSD CLI |
| AUTO-02 | Plans 02, 04 | Execution progress streams to real-time visualization | ✓ SATISFIED | GET /autonomous/stream/:runId, AutonomousView with AutonomousPipeline + CommitStream |
| AUTO-03 | Plans 02, 04 | Decision gates block execution until user responds | ✓ SATISFIED | GateManager Promise-based lifecycle, DecisionQueue sidebar, POST /gate-response |
| AUTO-04 | Plans 02, 04 | Ideation context carries forward into autonomous phase prompts | ✓ SATISFIED | buildGSDPhasePrompt() includes ideationContext; executor.ts L49-56 |
| SESS-02 | Plan 05 | Multi-tab session management with status indicators | ✓ SATISFIED | useSessionTabs (max 10), SessionTabBar, SessionTab with status dot |

**Requirements status:** 9/9 satisfied

**IMPORTANT: Requirements gap found.** IDs IDEA-01 through IDEA-04, AUTO-01 through AUTO-04, and SESS-02 appear only in Phase 15 plan summaries. They are not formally defined in `.planning/milestones/v1.1-REQUIREMENTS.md` or any current REQUIREMENTS.md equivalent for Phase 15's milestone. There is no v1.2 requirements file. The traceability table ends at Phase 11. This is an administrative gap — the requirements exist conceptually and are satisfied in code, but the formal requirements registry has not been updated for Phase 15.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `IdeationView.tsx` | 233 | `return null` | ℹ️ Info | Conditional return in `renderConversationEvent()` switch — correctly returns null for unknown event types. NOT a stub. |
| `RepoScaffoldForm.tsx` | 34 | `return null` | ℹ️ Info | Validation function `validateName()` returning null for valid input. NOT a stub. |
| `AgentSpawnIndicator.tsx` | 22 | `return null` | ℹ️ Info | `if (agents.length === 0) return null` — correct empty-state guard. NOT a stub. |
| `DecisionQueue.tsx` | 35 | `return null` | ℹ️ Info | `if (pendingGates.length === 0) return null` — correct empty-state guard. NOT a stub. |

No blockers or warnings found. All `return null` instances are conditional guards, not empty component stubs.

### Human Verification Required

#### 1. Ideation Pipeline Visual Flow

**Test:** Start the dev server (`npm run dev` in project root), navigate to the Ideation view via sidebar, enter an idea (e.g., "A tool to track my garden plantings"), click "Start Ideation".
**Expected:** The 4-node horizontal pipeline renders. Stage 1 (office-hours) activates with cyan pulse glow animation. Conversation events stream into the left panel. Stage progresses through all 4 nodes.
**Why human:** SSE streaming + CSS animation states require a live browser to observe.

#### 2. Pipeline Completion to Scaffold Modal

**Test:** Allow the ideation pipeline to complete (or mock a completion). Observe the "Launch Execution" button appearing.
**Expected:** Green "Launch Execution" CTA appears below the pipeline. Clicking it opens the RepoScaffoldForm modal with ideation context pre-populated (description derived from session).
**Why human:** Cross-component callback flow requires browser interaction to trace.

#### 3. Autonomous Execution Visualization

**Test:** Complete the scaffold form for a real project path (a directory with `.planning/` and `ROADMAP.md`). Submit the form.
**Expected:** App navigates to Autonomous view. AutonomousView shows "Launching..." state, transitions to running state with vertical phase pipeline. Phases update status in real time. Commits appear in the right-column CommitStream.
**Why human:** Requires live GSD CLI execution and real SSE events.

#### 4. Decision Gate Interaction

**Test:** Trigger an autonomous execution run that reaches a decision gate (requires a phase that creates a gate).
**Expected:** Sidebar shows `DecisionQueue` section with amber badge count. Gate card shows title, description, and option buttons. Clicking an option resolves the gate, removes it from queue, and autonomous execution continues.
**Why human:** Blocking gate Promise requires live execution to observe.

#### 5. Multi-Tab Session Management

**Test:** Click "+" to add new tabs (up to 10). Switch between tabs. Close tabs.
**Expected:** Tabs render in horizontal strip above main content. Status dot shows per-tab state. At 10 tabs the "+" button is disabled. Closing a tab removes it.
**Why human:** Tab interaction, visual states, and cap enforcement require browser testing.

#### 6. Repo Scaffold Form Validation

**Test:** Open scaffold form, type "My Project" (invalid — spaces and uppercase), then type "my-project" (valid).
**Expected:** Error message appears for invalid input in real time. Valid input clears error. Selecting a stack (React/Python/Swift/Go) shows radio selection. Submit creates files on filesystem.
**Why human:** Form validation UX and filesystem side effects require live testing.

### Gaps Summary

No automated gaps found. All 9 observable truths verified. All 31 artifacts exist at substantive line counts. All 12 key links traced end-to-end. All 9 requirement IDs satisfied in code.

**Administrative gap (non-blocking):** Phase 15 requirement IDs (IDEA-01 through IDEA-04, AUTO-01 through AUTO-04, SESS-02) are not registered in any REQUIREMENTS.md. The requirements are satisfied but not formally tracked. Recommend adding a v1.2 section to the requirements file or creating `.planning/milestones/v1.2-REQUIREMENTS.md`.

6 items require human testing before the phase can be marked fully passed. These are all behavioral/visual items that cannot be verified programmatically.

---

_Verified: 2026-04-08T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
