# Phase 15: Ideation Funnel & Autonomous GSD - Research

**Researched:** 2026-04-08
**Domain:** Skill invocation API, ideation pipeline orchestration, GSD autonomous execution, multi-tab session management
**Confidence:** HIGH

## Summary

Phase 15 is the capstone feature that ties together sessions (Phase 12), routing (Phase 13), and dashboard (Phase 14) into an end-to-end workflow: idea -> brainstorm -> chain skills -> one-click autonomous build. The good news is that nearly all infrastructure exists -- the agent loop (Claude Agent SDK `query()` with SSE bridge), skill runner (harness `runSkill` with tool_use loop), pipeline visualization (PipelineTopology + StageNode), SSE streaming (Hono `streamSSE`), and session management (Drizzle sessions + messages tables) are all production code.

The primary engineering work is: (1) a new skill invocation API layer that wraps the existing harness `runSkill` and exposes it over SSE, (2) an ideation pipeline orchestrator that chains skill invocations with artifact persistence, (3) a GSD autonomous execution wrapper that launches `gsd-tools.cjs` commands and streams progress, (4) decision gate infrastructure (SSE events + client-side queue + response channel), and (5) multi-tab session state management on the frontend. The UI spec (15-UI-SPEC.md) is already drafted with component inventory, layout contracts, and interaction flows.

**Primary recommendation:** Build in three waves: (1) Skill invocation API + ideation pipeline backend, (2) Autonomous GSD execution wrapper + decision gates, (3) Multi-tab sessions + repo scaffolding. Each wave adds a complete user-facing capability.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** API wrapper using existing harness SkillRegistry + runSkill, SSE streaming results to browser
- **D-02:** Skills discovered dynamically from ~/.claude/skills/gstack/ and ~/.claude/get-shit-done/ -- no hardcoded skill logic
- **D-03:** When gstack or GSD update, gstackapp picks up new skills automatically via dynamic discovery
- **D-04:** Hono API endpoints wrap skill runner, stream execution to browser via SSE (same pattern as v1.0 pipeline viz)
- **D-05:** Thread + artifacts -- conversation persists between chained skills AND each skill produces a durable artifact
- **D-06:** Office-hours -> CEO review -> eng review -> design consultation as a connected pipeline
- **D-07:** Each skill stage reads prior artifacts as context, building cumulative understanding
- **D-08:** User can start ideation with no repo -- idea-first. Repo created later via scaffolding.
- **D-09:** Notification cards -- non-blocking, positioned in sidebar or top bar
- **D-10:** User addresses decisions when ready -- pipeline continues on non-blocking decisions
- **D-11:** Blocking decisions surface prominently but don't hide pipeline progress
- **D-12:** Discuss phase carries forward ALL ideation context
- **D-13:** Only asks user for decisions where their input genuinely adds value
- **D-14:** Discuss all phases at once (batch discussion) so autonomous execution can run end-to-end
- **D-15:** Multiple concurrent sessions as tabs, each scoped to a different project
- **D-16:** Tabs show project name and active status (thinking, waiting for input, idle)
- **D-17:** Switching tabs preserves full conversation state
- **D-18:** Template system -- templates per stack type (React, Python, Swift, Go)
- **D-19:** Templates populated with project context from ideation output
- **D-20:** Creates repo with CLAUDE.md + .planning/ structure ready for GSD workflow
- **D-21:** One-click: roadmap -> discuss all phases -> autonomous execution
- **D-22:** Real-time pipeline visualization showing phase progress, agent spawns, and commits
- **D-23:** Autonomous execution runs as a background process -- user can switch to other sessions while it builds

### Claude's Discretion
- Template contents per stack type
- Notification card visual design and positioning
- Exact skill runner API endpoint design
- How to handle skill runner errors and retries

### Deferred Ideas (OUT OF SCOPE)
- Skill marketplace / versioning / hot-reload
- Team-level project aggregation
- Mobile monitoring view
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| IDEA-01 | Launch office-hours brainstorm from browser, no repo required | Harness `runSkill` already supports tool_use loop; needs new API endpoint + SSE bridge for repo-less sessions. System prompt modification for idea-first context. |
| IDEA-02 | Chain ideation skills as connected pipeline | Pipeline orchestrator sequences office-hours -> CEO -> eng -> design, passing artifacts between stages via cumulative context injection. |
| IDEA-03 | View, compare, iterate on design doc outputs | Artifacts written to ~/.gstack/projects/ (existing pattern). New `ArtifactPanel` component displays them. `read_design_doc` MCP tool already exists. |
| IDEA-04 | Scaffold new repo from ideation output | Template system reads ideation artifacts, generates CLAUDE.md + .planning/ structure. API endpoint creates repo directory, inits git. |
| AUTO-01 | One-click autonomous execution from UI | Wraps `gsd-tools.cjs` CLI commands (roadmap analyze, discuss, plan, execute) as a managed background process with SSE progress streaming. |
| AUTO-02 | Real-time pipeline visualization for GSD phases | Adapts existing PipelineTopology pattern (horizontal -> vertical), new event types for phase/commit/agent-spawn. Same SSE infrastructure. |
| AUTO-03 | Decision gates surfaced in UI | New SSE event type `decision_gate`. Client-side `DecisionQueue` component. Response channel via POST endpoint that resumes blocked execution. |
| AUTO-04 | Discuss phase carries forward ideation context | Pipeline orchestrator assembles cumulative context from all ideation artifacts, injects into discuss-phase prompt. |
| SESS-02 | Multiple concurrent sessions as tabs | Frontend `SessionTabBar` component with per-session state isolation. Backend already supports multiple concurrent sessions (separate Drizzle rows). |
</phase_requirements>

## Standard Stack

### Core (all already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | (installed) | Agent loop, query() API | Already powering sessions. Skill invocation uses same SDK. [VERIFIED: package.json] |
| Hono + streamSSE | ^4.12 | SSE streaming endpoints | Existing SSE pattern in sse.ts and agent.ts. [VERIFIED: codebase] |
| Drizzle ORM + better-sqlite3 | ^0.45 / ^11.8 | Session/artifact persistence | Existing schema with sessions, messages, toolCalls tables. [VERIFIED: schema.ts] |
| @tanstack/react-query | ^5.95 | Client state management | Existing hooks pattern (useSession, usePipeline, etc). [VERIFIED: codebase] |
| Zod | ^3.24 | API validation, shared types | Existing usage across all routes and harness. [VERIFIED: codebase] |

### Supporting (new for Phase 15)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| child_process (Node built-in) | — | Spawn GSD CLI commands | Autonomous execution wraps `gsd-tools.cjs` commands as child processes. [VERIFIED: Node.js stdlib] |
| EventEmitter (Node built-in) | — | Decision gate pub/sub | Extend existing `pipelineBus` pattern for decision gate request/response. [VERIFIED: events/bus.ts] |

**No new dependencies required.** Everything is built on existing stack.

## Architecture Patterns

### Recommended Project Structure (new files only)

```
packages/api/src/
├── routes/
│   ├── ideation.ts          # POST /start, GET /stream/:id, POST /:id/respond
│   ├── autonomous.ts        # POST /launch, GET /stream/:id, POST /:id/gate-response
│   └── scaffold.ts          # POST /scaffold
├── ideation/
│   ├── orchestrator.ts      # Chains skill stages, manages artifacts
│   ├── skill-bridge.ts      # Bridges harness runSkill to SSE events
│   └── templates.ts         # Repo scaffolding templates
├── autonomous/
│   ├── executor.ts          # Spawns GSD CLI processes, streams output
│   ├── gate-manager.ts      # Decision gate lifecycle (create, block, resolve)
│   └── events.ts            # Extended event types for GSD phases
├── events/
│   └── bus.ts               # Extended with ideation + autonomous event types
└── db/
    └── schema.ts            # Extended with ideation_sessions, artifacts, decision_gates tables

packages/web/src/
├── components/
│   ├── ideation/
│   │   ├── IdeationPipeline.tsx
│   │   ├── IdeationStageNode.tsx
│   │   ├── IdeationInput.tsx
│   │   ├── ArtifactCard.tsx
│   │   └── RepoScaffoldForm.tsx
│   ├── autonomous/
│   │   ├── AutonomousPipeline.tsx
│   │   ├── PhaseNode.tsx
│   │   ├── CommitStream.tsx
│   │   ├── AgentSpawnIndicator.tsx
│   │   └── ExecutionSummary.tsx
│   ├── decision/
│   │   ├── DecisionGateCard.tsx
│   │   └── DecisionQueue.tsx
│   └── session/
│       └── SessionTabBar.tsx  # NEW: multi-tab bar
├── hooks/
│   ├── useIdeation.ts         # Ideation pipeline state + SSE
│   ├── useAutonomous.ts       # Autonomous execution state + SSE
│   └── useDecisionGates.ts    # Decision gate queue state
```

### Pattern 1: Skill Invocation via SSE (extending existing agent.ts pattern)

**What:** API endpoint wraps harness `runSkill` and streams progress as SSE events. Same pattern as `agent.ts` stream handler but wraps skill execution instead of agent loop.

**When to use:** All ideation skill invocations (IDEA-01, IDEA-02).

**Key implementation detail:** The existing `runSkill` in harness returns a `SkillResult` (output + tokenUsage + durationMs) but does NOT stream intermediate events. For SSE streaming, we need to intercept the tool_use loop inside the runner. Two approaches:

1. **Wrap the agent loop instead of runSkill** (RECOMMENDED): Use the existing `runAgentLoop()` with a custom system prompt that loads the skill's prompt. The agent loop already has full SSE streaming via `bridgeToSSE()`. This is the path of least resistance -- the skill prompt IS the system prompt, and the agent loop handles streaming, tool execution, and session persistence automatically.

2. **Fork runSkill with streaming callbacks**: Add an `onEvent` callback to `SkillRunInput` that emits intermediate events. More surgical but requires modifying harness code.

Approach 1 is strongly recommended because it reuses the entire existing streaming pipeline and avoids modifying the harness. The skill SKILL.md content becomes the system prompt injected into `buildSystemPrompt()`.

```typescript
// Source: existing agent.ts pattern + skill prompt injection
// packages/api/src/routes/ideation.ts

ideationApp.get('/stream/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const ideationSession = getIdeationSession(sessionId)
  
  return streamSSE(c, async (stream) => {
    // Build prompt with cumulative ideation context
    const prompt = buildIdeationPrompt(
      ideationSession.currentStage,
      ideationSession.priorArtifacts,
      ideationSession.userIdea
    )
    
    for await (const event of runAgentLoop({
      prompt,
      sessionId: ideationSession.agentSessionId,
      maxTurns: 50,
      maxBudgetUsd: 3.0,
    })) {
      await stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
        id: String(++counter),
      })
    }
  })
})
```

[VERIFIED: agent.ts, loop.ts, stream-bridge.ts in codebase]

### Pattern 2: Ideation Pipeline Orchestrator

**What:** Server-side orchestrator that manages the 4-stage ideation pipeline lifecycle: office-hours -> CEO review -> eng review -> design consultation. Each stage runs as a separate agent loop invocation with cumulative context.

**When to use:** IDEA-02, IDEA-03, AUTO-04.

```typescript
// packages/api/src/ideation/orchestrator.ts

const IDEATION_STAGES = ['office-hours', 'plan-ceo-review', 'plan-eng-review', 'design-consultation'] as const

interface IdeationPipeline {
  id: string
  sessionId: string
  userIdea: string
  stages: IdeationStageState[]
  artifacts: Map<string, string>  // stage -> artifact path
  status: 'running' | 'complete' | 'failed' | 'paused'
}

async function* runIdeationPipeline(pipeline: IdeationPipeline): AsyncGenerator<IdeationEvent> {
  for (const stage of IDEATION_STAGES) {
    yield { type: 'stage:start', stage }
    
    // Build cumulative prompt from prior artifacts
    const priorContext = buildCumulativeContext(pipeline.artifacts)
    const skillPrompt = loadSkillPrompt(stage)  // Read SKILL.md from filesystem
    
    const prompt = `${priorContext}\n\nUser's idea: ${pipeline.userIdea}\n\nExecute the ${stage} skill.`
    
    try {
      for await (const event of runAgentLoop({
        prompt,
        projectPath: undefined, // No repo -- idea-first (D-08)
        maxTurns: 50,
        maxBudgetUsd: 3.0,
      })) {
        yield { type: 'stage:event', stage, event }
      }
      
      // Detect and persist artifact (design doc written to ~/.gstack/projects/)
      const artifact = await detectNewArtifact(stage)
      if (artifact) {
        pipeline.artifacts.set(stage, artifact)
        yield { type: 'stage:artifact', stage, path: artifact }
      }
      
      yield { type: 'stage:complete', stage }
    } catch (err) {
      yield { type: 'stage:error', stage, error: String(err) }
      break
    }
  }
  
  yield { type: 'pipeline:complete' }
}
```

[ASSUMED — pipeline orchestration pattern derived from existing v1.0 pipeline runner]

### Pattern 3: GSD Autonomous Execution via Child Process

**What:** Launches GSD CLI commands as managed child processes, parses their stdout for progress events, and streams to the browser via SSE.

**When to use:** AUTO-01, AUTO-02, AUTO-03.

**Key insight:** The GSD workflows (autonomous.md, discuss-phase.md, execute-phase.md) are designed to be invoked by Claude Code sessions, not programmatic APIs. The cleanest bridge is to spawn a Claude Code session (`claude` CLI) with the appropriate GSD command as the prompt, capture its output, and parse progress markers.

Alternatively, for more control, call `gsd-tools.cjs` directly for structured operations (roadmap analysis, phase discovery) and only spawn the agent for discuss/execute steps.

```typescript
// packages/api/src/autonomous/executor.ts
import { spawn } from 'node:child_process'

interface GSDPhaseProgress {
  phase: number
  name: string
  status: 'pending' | 'discuss' | 'plan' | 'execute' | 'complete' | 'failed' | 'blocked'
  commits: string[]
  agents: string[]
}

async function* runAutonomousExecution(
  projectPath: string,
  ideationContext: string,
): AsyncGenerator<AutonomousEvent> {
  // Step 1: Analyze roadmap for phase list
  const roadmap = JSON.parse(
    execSync(`node ~/.claude/get-shit-done/bin/gsd-tools.cjs roadmap analyze`, {
      cwd: projectPath,
    }).toString()
  )
  
  yield { type: 'phases:discovered', phases: roadmap.phases }
  
  // Step 2: For each phase, run discuss -> plan -> execute
  for (const phase of roadmap.phases) {
    yield { type: 'phase:start', phase: phase.number, name: phase.name }
    
    // Run via agent loop with GSD workflow prompt
    for await (const event of runAgentLoop({
      prompt: `/gsd:autonomous --only ${phase.number}`,
      projectPath,
      maxTurns: 200,
      maxBudgetUsd: 10.0,
    })) {
      // Parse agent events for phase progress markers
      const gsdEvent = parseGSDProgress(event)
      if (gsdEvent) yield gsdEvent
    }
    
    yield { type: 'phase:complete', phase: phase.number }
  }
}
```

[ASSUMED — GSD CLI integration approach needs validation during implementation]

### Pattern 4: Decision Gate Lifecycle

**What:** When the autonomous pipeline needs user input, it emits a decision gate event. The gate blocks (or doesn't block) pipeline progress. The user responds via the UI, and the response is fed back into the pipeline.

**Key challenge:** The agent loop is a long-running async generator. When it needs user input (AskUserQuestion in a skill), we need to pause the generator, emit the question as an SSE event, wait for the user's response via a POST endpoint, and then resume the generator with the response.

**Implementation approach:**

```typescript
// packages/api/src/autonomous/gate-manager.ts

const pendingGates = new Map<string, {
  resolve: (response: string) => void
  reject: (error: Error) => void
  gate: DecisionGate
}>()

// Called when agent emits AskUserQuestion tool_use
function createGate(gate: DecisionGate): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingGates.set(gate.id, { resolve, reject, gate })
    // SSE event emitted by the streaming route
  })
}

// POST /autonomous/:id/gate-response
function resolveGate(gateId: string, response: string) {
  const pending = pendingGates.get(gateId)
  if (pending) {
    pending.resolve(response)
    pendingGates.delete(gateId)
  }
}
```

The tricky part is intercepting `AskUserQuestion` tool calls in the agent loop's tool_use flow. The existing `bridgeToSSE` translates tool calls to `tool_start`/`tool_result` events. For decision gates, when the tool name is `AskUserQuestion`, instead of executing the tool, we:
1. Emit a `decision_gate` SSE event with the question and options
2. Wait for the user's response via the gate manager
3. Return the response as the tool result

This requires a custom tool execution handler in the agent loop config. The Claude Agent SDK's `allowedTools` and MCP server pattern can handle this -- register a custom MCP tool that bridges to the gate manager.

[ASSUMED — decision gate lifecycle approach needs validation with Claude Agent SDK behavior]

### Pattern 5: Multi-Tab Session State

**What:** Frontend manages multiple concurrent sessions, each with independent state.

**Implementation:** Each tab gets its own `useAgentStream()` instance. React Query cache is shared but keyed by session ID. Tab switching preserves state because the hooks maintain state in React state (not DOM).

```typescript
// packages/web/src/hooks/useSessionTabs.ts

interface SessionTab {
  id: string
  title: string
  projectPath?: string
  status: 'thinking' | 'waiting' | 'idle'
  type: 'ideation' | 'autonomous' | 'conversation'
}

function useSessionTabs() {
  const [tabs, setTabs] = useState<SessionTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  
  // Each tab's agent stream state is maintained by SessionView component
  // When tab switches, the previous SessionView unmounts but its SSE connection
  // stays alive (managed by the backend session). On re-mount, history is loaded
  // from the API via useSessionDetail.
  
  return { tabs, activeTabId, addTab, removeTab, setActiveTab }
}
```

[VERIFIED: existing SessionView.tsx + useAgentStream.ts + useSession.ts patterns in codebase]

### Anti-Patterns to Avoid

- **Reimplementing skill logic in gstackapp:** Per requirements, gstackapp CONSUMES gstack/GSD as upstream dependencies. Never parse SKILL.md files to extract logic -- invoke them via the agent loop with the skill prompt as system context.
- **Polling for decision gate responses:** Use the Promise-based gate manager pattern, not polling. The EventEmitter pattern from the existing pipeline bus is the right model.
- **Storing full conversation state in tabs:** Don't duplicate the agent loop's conversation memory in React state. The SDK persists sessions (`persistSession: true`). React only needs the rendered message list, which can be reloaded from the API.
- **Synchronous GSD CLI calls:** Never block the API server thread with `execSync` for GSD operations during autonomous execution. Always use child_process spawn with streaming.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Skill discovery | Filesystem scanner | Existing `SkillRegistry.loadFromDirectory()` | Already handles .skill.json discovery with Zod validation. Extend for SKILL.md discovery. |
| SSE streaming | Custom streaming | `streamSSE()` from Hono | Built-in, handles heartbeats. Proven pattern in sse.ts and agent.ts. |
| Agent conversation loop | Custom tool_use loop | `runAgentLoop()` wrapping Claude Agent SDK `query()` | Handles streaming, tool execution, session persistence, budget limits. |
| Pipeline event bus | Custom pub/sub | Extend existing `pipelineBus` (EventEmitter) | Already handles concurrent SSE listeners (max 50). |
| Session persistence | Custom storage | Drizzle sessions + messages tables | Already has schema, indexes, CRUD routes. |
| Template rendering | Custom string interpolation | Simple template literals or Mustache | Templates are small (CLAUDE.md, .planning/ structure). No need for a template engine. |

## Common Pitfalls

### Pitfall 1: Skill Prompt Extraction from SKILL.md
**What goes wrong:** gstack skills have SKILL.md files (markdown with YAML frontmatter + bash preamble + multi-phase instructions), not .skill.json manifests. The existing SkillRegistry expects .skill.json.
**Why it happens:** The harness was built for a generic skill manifest format. gstack skills evolved their own format.
**How to avoid:** Don't use SkillRegistry for gstack skill discovery. Instead, dynamically read SKILL.md files from `~/.claude/skills/gstack/` and inject their content as the system prompt for the agent loop. The agent loop already supports arbitrary system prompts via `buildSystemPrompt()`.
**Warning signs:** Getting empty skill lists from SkillRegistry when gstack skills exist.

### Pitfall 2: AskUserQuestion Interception
**What goes wrong:** The agent loop runs to completion and AskUserQuestion calls just become tool results that the agent acts on, without pausing for actual user input.
**Why it happens:** The Claude Agent SDK `query()` handles tool execution internally. `AskUserQuestion` is not a standard tool -- it's a Claude Code UI primitive.
**How to avoid:** Register `AskUserQuestion` as a custom MCP tool in the `gstackToolServer` that bridges to the decision gate manager. When invoked, it creates a gate, emits an SSE event, and awaits the user's response via the gate manager Promise.
**Warning signs:** AI responding to its own questions without user involvement.

### Pitfall 3: Concurrent Session SSE Connection Limits
**What goes wrong:** Each tab opens its own SSE connection. Browser limits (6 per domain for HTTP/1.1) can cause new tabs to queue.
**Why it happens:** EventSource uses HTTP/1.1 by default. Multiple concurrent SSE connections exhaust the browser's per-domain limit.
**How to avoid:** Either (a) use a single SSE connection multiplexed by session ID (add session_id to events, client filters), or (b) ensure the server supports HTTP/2 (Tailscale Funnel may handle this). Option (a) is simpler and more reliable.
**Warning signs:** 5th tab's SSE connection hangs until another tab is closed.

### Pitfall 4: Ideation Without Repo Context
**What goes wrong:** Skills like office-hours expect git context (branch, repo name, CLAUDE.md). Running without a repo causes bash preamble failures.
**Why it happens:** Skills are designed for use inside existing repos. IDEA-01 requires repo-less ideation.
**How to avoid:** For idea-first sessions, provide a minimal synthetic context: create a temp directory with a dummy git init, or skip the preamble entirely by injecting a simplified version of the skill prompt that omits the bash preamble.
**Warning signs:** Skill preamble errors about "not in a git repo."

### Pitfall 5: GSD CLI State Assumptions
**What goes wrong:** The GSD `autonomous.md` workflow assumes it's running in a Claude Code session with access to Skill() invocations and interactive prompts.
**How to avoid:** Instead of invoking the workflow markdown directly, use `gsd-tools.cjs` for structured operations (roadmap analyze, config-get, etc.) and wrap the agent loop for discuss/execute steps. The agent loop with GSD workflow prompts achieves the same result as Claude Code's Skill() invocations.
**Warning signs:** GSD workflows failing because they try to use Claude Code-specific primitives.

## Code Examples

### SSE Streaming Endpoint (existing pattern)

```typescript
// Source: packages/api/src/routes/agent.ts (lines 110-208)
// Proven pattern: streamSSE with async generator, heartbeat, error handling
return streamSSE(c, async (stream) => {
  const heartbeatInterval = setInterval(async () => {
    await stream.writeSSE({ data: '', event: 'heartbeat', id: '' })
  }, 15000)
  
  try {
    for await (const event of runAgentLoop(options)) {
      await stream.writeSSE({
        data: JSON.stringify(event),
        event: event.type,
        id: String(++counter),
      })
    }
  } finally {
    clearInterval(heartbeatInterval)
  }
})
```

### Client-Side SSE Consumption (existing pattern)

```typescript
// Source: packages/web/src/hooks/useAgentStream.ts (lines 62-207)
// Proven pattern: EventSource with typed message handling
const source = new EventSource(url)
source.onmessage = (event) => {
  const data = JSON.parse(event.data)
  switch (data.type) {
    case 'text_delta': // Streaming text
    case 'tool_start': // Tool invocation started
    case 'tool_result': // Tool completed
    case 'turn_complete': // Assistant turn done
    case 'result': // Stream complete
    case 'error': // Error occurred
  }
}
```

### Pipeline Visualization (existing pattern)

```typescript
// Source: packages/web/src/components/pipeline/PipelineTopology.tsx
// Reuse: StageNode + StageConnector pattern for both ideation and GSD pipelines
// IdeationPipeline: horizontal 4-node (same as PipelineHero)
// AutonomousPipeline: vertical N-node (rotated layout)
```

### DB Schema Extension (new for Phase 15)

```typescript
// New tables needed:
export const ideationSessions = sqliteTable('ideation_sessions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  userIdea: text('user_idea').notNull(),
  status: text('status').notNull().default('pending'), // pending | running | complete | failed
  currentStage: text('current_stage'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export const ideationArtifacts = sqliteTable('ideation_artifacts', {
  id: text('id').primaryKey(),
  ideationSessionId: text('ideation_session_id').references(() => ideationSessions.id),
  stage: text('stage').notNull(),
  artifactPath: text('artifact_path').notNull(), // ~/.gstack/projects/... path
  title: text('title'),
  excerpt: text('excerpt'), // First 500 chars for preview
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})

export const autonomousRuns = sqliteTable('autonomous_runs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => sessions.id),
  ideationSessionId: text('ideation_session_id').references(() => ideationSessions.id),
  projectPath: text('project_path').notNull(),
  status: text('status').notNull().default('pending'),
  totalPhases: integer('total_phases'),
  completedPhases: integer('completed_phases').default(0),
  totalCommits: integer('total_commits').default(0),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }),
  completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
})

export const decisionGates = sqliteTable('decision_gates', {
  id: text('id').primaryKey(),
  autonomousRunId: text('autonomous_run_id').references(() => autonomousRuns.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  options: text('options').notNull(), // JSON array
  blocking: integer('blocking', { mode: 'boolean' }).default(false),
  response: text('response'), // null until answered
  respondedAt: integer('responded_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
})
```

[ASSUMED -- schema design based on requirements + existing patterns]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate skill runner (runSkill) | Agent loop with skill prompt injection | Phase 12 (agent loop) | Agent loop already handles streaming, tools, persistence. Don't use runSkill for browser-facing invocations. |
| Pipeline bus for PR review only | Extended bus for all event types | Phase 15 | Add ideation + autonomous event types to existing EventEmitter. |
| Single session view | Multi-tab sessions | Phase 15 | SessionTabBar + per-tab state isolation replaces single SessionView. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Agent loop with skill prompt as system prompt is equivalent to invoking the skill directly | Architecture Pattern 1 | Medium -- skills may depend on Claude Code-specific tool behaviors not available in the agent SDK. May need skill prompt adaptation. |
| A2 | AskUserQuestion can be intercepted as a custom MCP tool | Pitfall 2 | High -- if the agent SDK doesn't allow custom handling of AskUserQuestion, decision gates need a completely different approach (e.g., structured output parsing). |
| A3 | Single multiplexed SSE connection handles multi-tab without browser limits | Pitfall 3 | Low -- standard pattern, well understood. |
| A4 | GSD `gsd-tools.cjs` commands work headless (no interactive prompts) | Pattern 3 | Medium -- some GSD commands may require interactive input. Need to verify each command's non-interactive mode. |
| A5 | Skill SKILL.md files can be dynamically loaded as system prompts without the bash preamble | Pitfall 1, 4 | Medium -- some skill behavior depends on preamble output (BRANCH, REPO_MODE, etc.). May need synthetic preamble values. |

## Open Questions

1. **AskUserQuestion Interception Mechanism**
   - What we know: Claude Agent SDK `query()` handles tool execution. gstack skills use AskUserQuestion extensively.
   - What's unclear: Whether AskUserQuestion is a Claude Code built-in tool or an MCP-registered tool, and whether the agent SDK can intercept it.
   - Recommendation: Test early by running a skill that uses AskUserQuestion via the agent loop and observing what happens. If it's not interceptable, implement a "question detector" that parses the agent's text output for question patterns and creates gates from those.

2. **Skill Preamble in Repo-less Context**
   - What we know: All gstack skills have bash preambles that expect git context.
   - What's unclear: Whether the preamble is essential for skill behavior or just analytics/context gathering.
   - Recommendation: For ideation sessions, create a minimal temp directory with `git init` and a synthetic CLAUDE.md. This satisfies preamble requirements without requiring a real repo.

3. **GSD Autonomous Execution Granularity**
   - What we know: `gsd-tools.cjs` provides `roadmap analyze` and `init phase-op`. The `autonomous.md` workflow handles the full loop.
   - What's unclear: The best granularity for progress events -- phase-level, plan-level, or commit-level.
   - Recommendation: Phase-level progress (start/complete per phase) with commit-level detail within each phase. This matches the UI spec's AutonomousPipeline component design.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1 |
| Config file | packages/api/vitest.config.ts, packages/harness/vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `cd packages/api && npx vitest run && cd ../harness && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| IDEA-01 | Ideation session creation + SSE streaming | integration | `npx vitest run src/__tests__/ideation-route.test.ts -x` | Wave 0 |
| IDEA-02 | Pipeline orchestrator chains 4 stages | unit | `npx vitest run src/__tests__/ideation-orchestrator.test.ts -x` | Wave 0 |
| IDEA-03 | Artifact persistence + retrieval | unit | `npx vitest run src/__tests__/ideation-artifacts.test.ts -x` | Wave 0 |
| IDEA-04 | Repo scaffolding from template | unit | `npx vitest run src/__tests__/scaffold.test.ts -x` | Wave 0 |
| AUTO-01 | Autonomous launch + phase discovery | integration | `npx vitest run src/__tests__/autonomous-route.test.ts -x` | Wave 0 |
| AUTO-02 | SSE events for phase progress | integration | `npx vitest run src/__tests__/autonomous-sse.test.ts -x` | Wave 0 |
| AUTO-03 | Decision gate create + resolve | unit | `npx vitest run src/__tests__/gate-manager.test.ts -x` | Wave 0 |
| AUTO-04 | Context injection from ideation artifacts | unit | `npx vitest run src/__tests__/context-injection.test.ts -x` | Wave 0 |
| SESS-02 | Multi-tab sessions | manual-only | Manual: open 3+ tabs, switch between them | N/A |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (affected package)
- **Per wave merge:** Full suite across api + harness
- **Phase gate:** Full suite green before /gsd-verify-work

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/ideation-route.test.ts` -- covers IDEA-01
- [ ] `packages/api/src/__tests__/ideation-orchestrator.test.ts` -- covers IDEA-02
- [ ] `packages/api/src/__tests__/ideation-artifacts.test.ts` -- covers IDEA-03
- [ ] `packages/api/src/__tests__/scaffold.test.ts` -- covers IDEA-04
- [ ] `packages/api/src/__tests__/autonomous-route.test.ts` -- covers AUTO-01
- [ ] `packages/api/src/__tests__/gate-manager.test.ts` -- covers AUTO-03
- [ ] `packages/api/src/__tests__/context-injection.test.ts` -- covers AUTO-04

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Single-user, no auth (project constraint) |
| V3 Session Management | yes (tab state) | Session IDs via nanoid, no auth tokens needed |
| V4 Access Control | yes (file access) | Path traversal prevention -- existing pattern from read_design_doc tool (verify resolved path under HOME) |
| V5 Input Validation | yes | Zod validation on all API inputs (existing pattern) |
| V6 Cryptography | no | No secrets handled in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal in artifact paths | Tampering | Normalize + verify path stays under HOME (existing pattern in tools.ts) |
| Command injection in scaffold names | Tampering | Zod validation: alphanumeric + hyphens only for project names |
| SSE event spoofing (multi-tab) | Spoofing | Session ID scoping on all SSE events, client filters by session |
| Resource exhaustion (concurrent autonomous runs) | Denial of Service | Limit to 1 concurrent autonomous run (single-user, reasonable) |
| Agent budget overrun | Denial of Service | Existing maxBudgetUsd limit on agent loop (default $5, autonomous $10) |

## Sources

### Primary (HIGH confidence)
- packages/api/src/routes/agent.ts -- SSE streaming pattern, session management
- packages/api/src/agent/loop.ts -- Agent loop wrapping Claude Agent SDK
- packages/api/src/agent/stream-bridge.ts -- SSE event translation
- packages/api/src/agent/tools.ts -- MCP tool registration pattern
- packages/api/src/events/bus.ts -- EventEmitter pipeline bus
- packages/api/src/db/schema.ts -- Existing DB schema
- packages/harness/src/skills/ -- SkillManifest, SkillRegistry, runSkill
- packages/web/src/hooks/useAgentStream.ts -- Client SSE consumption
- packages/web/src/components/pipeline/ -- Pipeline visualization components
- packages/web/src/components/session/SessionView.tsx -- Session UI pattern
- ~/.claude/skills/gstack/office-hours/SKILL.md -- Skill definition format
- ~/.claude/get-shit-done/workflows/autonomous.md -- GSD autonomous workflow
- .planning/phases/15-ideation-funnel-autonomous-gsd/15-UI-SPEC.md -- UI design contract

### Secondary (MEDIUM confidence)
- ~/.claude/get-shit-done/bin/gsd-tools.cjs -- GSD CLI tool (verified exists, API inferred from workflow usage)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- all patterns derived from existing codebase with clear extension points
- Pitfalls: MEDIUM -- AskUserQuestion interception and skill preamble handling need validation during implementation

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (stable -- no external dependency changes expected)
