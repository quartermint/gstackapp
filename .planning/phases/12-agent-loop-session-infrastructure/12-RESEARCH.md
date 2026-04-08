# Phase 12: Agent Loop & Session Infrastructure - Research

**Researched:** 2026-04-08
**Domain:** Agent loop architecture, session persistence, context compression, real-time streaming
**Confidence:** HIGH

## Summary

Phase 12 builds the foundational AI conversation infrastructure for gstackapp. The single most important discovery in this research is that Anthropic has released the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk` v0.2.96, published 2026-04-08), which provides the exact generator-based agent loop, tool system, session persistence, context compaction, and streaming output that this phase requires. This SDK is the same engine that powers Claude Code.

The SDK provides: an async generator `query()` function that yields typed messages (SystemMessage, AssistantMessage, UserMessage, StreamEvent, ResultMessage), built-in tools (Read, Edit, Write, Bash, Glob, Grep, WebSearch, WebFetch), custom tool support via in-process MCP servers, automatic context compaction, session persistence to disk with resume/fork/continue, and real-time streaming with `includePartialMessages`. This eliminates the need to hand-roll an agent loop from scratch.

The architecture is: Claude Agent SDK handles the loop/tools/sessions on the backend, Hono SSE bridges SDK stream events to the browser, React Query + custom hooks consume the SSE stream on the frontend, and Drizzle/SQLite stores session metadata and message history for the dashboard's session list/resume UI.

**Primary recommendation:** Use `@anthropic-ai/claude-agent-sdk` as the agent loop engine. Build a thin Hono adapter layer that bridges SDK stream events to SSE for the browser. Store session metadata in Drizzle for the UI, but let the SDK handle conversation state and compaction.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Generator-based agent loop modeled on Claude Code's proven pattern -- async function* with typed terminal states, backpressure, composable sub-generators
- **D-02:** Go beyond CC's pattern: the loop has cross-project awareness, understands GSD state across all projects, can fork agents that work on multiple projects simultaneously
- **D-03:** The agent loop is aware of the ideation pipeline and design docs as first-class context, not just code
- **D-04:** 10-star vision: this is not "Claude Code in a browser" -- it's an agent built for someone who runs 104 sessions/week across 20+ projects
- **D-05:** Hybrid storage -- SQLite (extend existing Drizzle schema) for structured data (sessions, messages, tool calls), filesystem for artifacts (design docs, context files, plan outputs)
- **D-06:** SQLite tables: sessions, messages, tool_calls. Drizzle schema extension of existing api database.
- **D-07:** Chat + artifact panel -- chat as primary conversation interface, artifacts (design docs, code, plans, GSD state) open in a side panel
- **D-08:** The artifact panel is a living workspace -- design docs update in real-time during ideation, GSD progress renders as interactive pipeline visualization
- **D-09:** Streaming via SSE (reuse existing pattern from v1.0 pipeline streaming)
- **D-10:** Full tool set -- file read/write, bash, grep, glob. Full coding agent capabilities.
- **D-11:** NOT sandboxed per project -- unsandboxed cross-project file access. This is a personal workstation. Cross-project learning is a key velocity multiplier.
- **D-12:** 4-layer context compression pipeline: snip compact, microcompact, context collapse, auto-compact (modeled on Claude Code's proven approach)

### Claude's Discretion
- Exact compression thresholds and triggering heuristics
- Tool result budgeting limits
- Session resume serialization format
- Loading skeleton and streaming chunk rendering approach

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | User can start an AI conversation session with a generator-based agent loop that supports tool execution | Claude Agent SDK provides `query()` async generator with built-in tool execution (Read, Edit, Write, Bash, Glob, Grep). Custom tools via `createSdkMcpServer()`. Hono route bridges to SSE. |
| SESS-03 | User can have long sessions without context degradation via 4-layer compression pipeline | SDK has built-in automatic compaction. Server-side compaction API (beta `compact-2026-01-12`) provides summarization. CLAUDE.md instructions control what gets preserved. Custom `PreCompact` hook available. |
| SESS-04 | User can persist sessions and resume them across browser visits | SDK persists sessions to `~/.claude/projects/<cwd>/*.jsonl`. `resume` option takes session ID. `listSessions()` and `getSessionMessages()` for session discovery. Drizzle metadata layer for UI. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/claude-agent-sdk | ^0.2.96 | Agent loop engine | Same engine powering Claude Code. Provides async generator loop, built-in tools, session persistence, context compaction, streaming. Eliminates need to hand-roll agent infrastructure. [VERIFIED: npm registry, published 2026-04-08] |
| @anthropic-ai/sdk | ^0.85.0 | Claude API client (already installed) | Used by Agent SDK internally. Direct access for server-side compaction beta API if needed. [VERIFIED: npm registry] |
| hono | ^4.12 | HTTP server + SSE streaming | Already in stack. `streamSSE()` bridges Agent SDK events to browser. [VERIFIED: existing codebase] |
| drizzle-orm | ^0.45 | Session metadata storage | Already in stack. Extend schema with sessions, messages, tool_calls tables. [VERIFIED: existing codebase] |
| better-sqlite3 | ^11.8 | SQLite driver | Already in stack. Same database, new tables. [VERIFIED: existing codebase] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| nanoid | ^5.0 | Session/message ID generation | Already in stack. Generate IDs for session metadata records. [VERIFIED: existing codebase] |
| zod | ^3.24 | Schema validation | Already in stack. Validate session API request/response. Custom tool input schemas. [VERIFIED: existing codebase] |
| @tanstack/react-query | ^5.95 | Server state management | Already in stack. Session list, session detail queries. [VERIFIED: existing codebase] |
| pino | ^9.6 | Structured logging | Already in stack. Log agent loop events, tool executions. [VERIFIED: existing codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Claude Agent SDK | Custom generator loop (D-01 original intent) | SDK IS the generator loop from Claude Code. Using it directly satisfies D-01 more faithfully than reimplementing. Custom loop would mean reimplementing compaction, tool batching, permission model, session persistence -- all solved problems. |
| SDK session persistence (JSONL files) | SQLite-only persistence | SDK handles the hard part (conversation state, compaction boundaries). Drizzle adds the metadata layer (session titles, timestamps, project associations) needed for the dashboard UI. Hybrid approach is best. |
| Server-side compaction (beta API) | Client-side compaction logic | Server-side is Anthropic's recommended approach. Beta header `compact-2026-01-12` required. Supported on Claude Opus 4.6 and Sonnet 4.6. [CITED: platform.claude.com/docs/en/build-with-claude/compaction] |

**Installation:**
```bash
npm install @anthropic-ai/claude-agent-sdk --workspace=packages/api
```

**Version verification:**
- `@anthropic-ai/claude-agent-sdk`: 0.2.96 (published 2026-04-08) [VERIFIED: npm registry]
- All other packages already installed in workspace [VERIFIED: packages/api/package.json]

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
├── agent/                    # Agent loop infrastructure
│   ├── loop.ts               # Hono route wrapping Agent SDK query()
│   ├── tools.ts              # Custom tool definitions (cross-project, GSD)
│   ├── system-prompt.ts      # System prompt builder (project context, GSD state)
│   └── stream-bridge.ts      # SDK message -> SSE event transformer
├── db/
│   ├── schema.ts             # Extended with sessions, messages, tool_calls
│   └── client.ts             # Existing (unchanged)
├── routes/
│   ├── sessions.ts           # CRUD for session metadata
│   └── agent.ts              # SSE endpoint for agent loop streaming
packages/web/src/
├── components/
│   ├── session/
│   │   ├── ChatPanel.tsx     # Chat message stream
│   │   ├── MessageBubble.tsx # Individual message rendering
│   │   ├── ToolCallCard.tsx  # Inline tool execution display
│   │   ├── ArtifactPanel.tsx # Side panel for artifacts
│   │   └── SessionList.tsx   # Session history/resume UI
│   └── shared/
│       └── StreamingText.tsx  # Text streaming renderer
├── hooks/
│   ├── useAgentStream.ts     # SSE consumer for agent loop
│   └── useSession.ts         # Session CRUD operations
```

### Pattern 1: Agent SDK as Backend Engine
**What:** Wrap the Claude Agent SDK's `query()` function in a Hono route that streams events via SSE to the browser.
**When to use:** Every agent conversation session.
**Example:**
```typescript
// Source: platform.claude.com/docs/en/agent-sdk/agent-loop
// packages/api/src/agent/loop.ts
import { query } from '@anthropic-ai/claude-agent-sdk'
import { streamSSE } from 'hono/streaming'
import type { Context } from 'hono'

export async function runAgentLoop(c: Context, sessionId?: string) {
  return streamSSE(c, async (stream) => {
    for await (const message of query({
      prompt: c.req.query('prompt') ?? '',
      options: {
        resume: sessionId,            // Resume existing session
        includePartialMessages: true, // Enable streaming
        allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        permissionMode: 'bypassPermissions', // Personal workstation (D-11)
        maxTurns: 100,
        mcpServers: { gstack: gstackToolServer }, // Custom tools
      }
    })) {
      await stream.writeSSE({
        data: JSON.stringify(message),
        event: message.type,
        id: message.uuid ?? '',
      })
    }
  })
}
```

### Pattern 2: Hybrid Session Storage
**What:** SDK handles conversation state (JSONL files). Drizzle stores session metadata for the UI.
**When to use:** Session list, session detail, session resume.
**Example:**
```typescript
// packages/api/src/db/schema.ts (extension)
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),              // nanoid
  sdkSessionId: text('sdk_session_id'),     // Claude Agent SDK session ID
  title: text('title'),                     // Auto-generated or user-set
  projectPath: text('project_path'),        // Associated project directory
  status: text('status').notNull().default('active'), // active | archived
  messageCount: integer('message_count').default(0),
  tokenUsage: integer('token_usage').default(0),
  costUsd: text('cost_usd'),               // Stored as string for precision
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull().$defaultFn(() => new Date()),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull()
    .references(() => sessions.id),
  role: text('role').notNull(),             // user | assistant | system
  content: text('content').notNull(),       // Text content (summary)
  hasToolCalls: integer('has_tool_calls', { mode: 'boolean' }).default(false),
  tokenCount: integer('token_count'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('msg_session_idx').on(table.sessionId),
])

export const toolCalls = sqliteTable('tool_calls', {
  id: text('id').primaryKey(),
  messageId: text('message_id').notNull()
    .references(() => messages.id),
  sessionId: text('session_id').notNull()
    .references(() => sessions.id),
  toolName: text('tool_name').notNull(),
  input: text('input'),                     // JSON stringified
  output: text('output'),                   // JSON stringified (truncated)
  isError: integer('is_error', { mode: 'boolean' }).default(false),
  durationMs: integer('duration_ms'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull().$defaultFn(() => new Date()),
}, (table) => [
  index('tc_session_idx').on(table.sessionId),
  index('tc_message_idx').on(table.messageId),
])
```

### Pattern 3: SSE Stream Bridge
**What:** Transform Claude Agent SDK message types into SSE events the frontend can consume.
**When to use:** All agent streaming to the browser.
**Example:**
```typescript
// packages/api/src/agent/stream-bridge.ts
// Maps SDK message types to frontend-consumable SSE events
type AgentSSEEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; name: string; id: string }
  | { type: 'tool_input'; id: string; chunk: string }
  | { type: 'tool_done'; id: string }
  | { type: 'turn_complete'; messageId: string }
  | { type: 'result'; text: string; cost: number; sessionId: string }
  | { type: 'compact'; message: string }
  | { type: 'error'; message: string; subtype: string }

// The bridge processes raw SDK StreamEvent messages and emits simplified events
function bridgeStreamEvent(event: any): AgentSSEEvent | null {
  if (event.type === 'content_block_delta') {
    if (event.delta.type === 'text_delta') {
      return { type: 'text_delta', text: event.delta.text }
    }
    if (event.delta.type === 'input_json_delta') {
      return { type: 'tool_input', id: event.index.toString(), chunk: event.delta.partial_json }
    }
  }
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    return { type: 'tool_start', name: event.content_block.name, id: event.content_block.id }
  }
  if (event.type === 'content_block_stop') {
    return { type: 'tool_done', id: event.index.toString() }
  }
  return null
}
```

### Pattern 4: Custom Tools for Cross-Project Awareness (D-02, D-03)
**What:** Define custom MCP tools that give the agent access to GSD state, project manifests, and design docs.
**When to use:** Implementing D-02 (cross-project awareness) and D-03 (ideation pipeline awareness).
**Example:**
```typescript
// packages/api/src/agent/tools.ts
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

const listProjects = tool(
  'list_projects',
  'List all active projects with their GSD state, git status, and recent activity',
  { filter: z.enum(['active', 'stale', 'all']).default('active') },
  async (args) => {
    // Read from ~/.gstack/projects/ or project directories
    // Return structured project state
    return { content: [{ type: 'text', text: JSON.stringify(projects) }] }
  },
  { annotations: { readOnlyHint: true } }
)

const readGsdState = tool(
  'read_gsd_state',
  'Read the GSD planning state for a specific project',
  { projectPath: z.string().describe('Absolute path to project root') },
  async (args) => {
    // Read .planning/STATE.md, ROADMAP.md, current phase context
    return { content: [{ type: 'text', text: stateContent }] }
  },
  { annotations: { readOnlyHint: true } }
)

const readDesignDoc = tool(
  'read_design_doc',
  'Read a design document from the ideation pipeline',
  { docPath: z.string() },
  async (args) => {
    return { content: [{ type: 'text', text: docContent }] }
  },
  { annotations: { readOnlyHint: true } }
)

export const gstackToolServer = createSdkMcpServer({
  name: 'gstack',
  version: '1.0.0',
  tools: [listProjects, readGsdState, readDesignDoc],
})
```

### Anti-Patterns to Avoid
- **Building a custom agent loop from scratch:** The Claude Agent SDK IS the Claude Code generator loop. Reimplementing it means reimplementing compaction, tool batching, session persistence, error recovery -- all solved problems. Use the SDK.
- **Storing full conversation state in SQLite:** The SDK persists full conversation state to JSONL files with compaction boundaries. Duplicating this in SQLite creates a consistency nightmare. Store only metadata (titles, timestamps, project associations) in Drizzle.
- **Blocking SSE on tool execution:** Tool execution can take seconds (bash commands, file reads). The stream bridge must emit `tool_start` events immediately and `tool_done` when complete, keeping the SSE connection alive with heartbeats.
- **Ignoring compaction in the UI:** When compaction fires, the frontend should show a subtle indicator ("Context optimized") rather than confusing the user with missing messages. Handle `compact_boundary` events.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Agent loop + tool execution | Custom generator with tool dispatch | `@anthropic-ai/claude-agent-sdk` `query()` | SDK handles tool batching (read-only parallel, write sequential), error recovery, iteration limits, budget caps. 100s of edge cases. |
| Context compaction | Custom summarization pipeline | SDK automatic compaction + server-side compaction API | SDK fires `compact_boundary` events. Server-side compaction (beta `compact-2026-01-12`) handles summarization. `PreCompact` hook for custom logic. |
| Session persistence | Custom JSONL serialization | SDK session storage + `resume`/`fork` | SDK writes `~/.claude/projects/<cwd>/*.jsonl`, handles resume with full context restoration. `listSessions()` for discovery. |
| Tool permission model | Custom allowlist/blocklist | SDK `allowedTools` + `permissionMode` | SDK supports wildcard patterns (`mcp__gstack__*`), scoped permissions (`Bash(npm:*)`), and modes (default, acceptEdits, bypassPermissions). |
| Streaming text accumulation | Custom text delta buffer | SDK `includePartialMessages` | SDK yields `StreamEvent` with raw API events. Standard accumulation pattern. |

**Key insight:** The Claude Agent SDK was released specifically to let developers embed Claude Code's agent loop. Every piece of infrastructure D-01 through D-12 describes is available as SDK primitives. The implementation work is in the adapter layer (Hono SSE bridge, Drizzle metadata, React UI), not the agent core.

## Common Pitfalls

### Pitfall 1: SDK Session Storage Location
**What goes wrong:** SDK stores sessions under `~/.claude/projects/<encoded-cwd>/*.jsonl` where `<encoded-cwd>` is the absolute working directory with non-alphanumeric characters replaced by `-`. If the Hono server's CWD changes, sessions become unfindable.
**Why it happens:** Process CWD can vary between dev and production, or after server restarts.
**How to avoid:** Pin the CWD in the server startup script. Store the SDK session ID in Drizzle alongside the session metadata so you can always resume by ID regardless of CWD.
**Warning signs:** `resume` returning a fresh session instead of the expected history.

### Pitfall 2: SSE Connection Limits
**What goes wrong:** Browser limits concurrent SSE connections per domain (typically 6 for HTTP/1.1). Multiple sessions or tabs exhaust the limit.
**Why it happens:** Each active agent session opens an SSE connection.
**How to avoid:** Use HTTP/2 (multiplexing removes the limit) or a single SSE connection with session-scoped event routing. For Phase 12, single-session is fine (SESS-02 is Phase 15).
**Warning signs:** New sessions failing to connect, browser console showing stalled requests.

### Pitfall 3: Tool Output Flooding Context
**What goes wrong:** Large tool outputs (file reads, bash output) consume context rapidly, triggering premature compaction.
**Why it happens:** Reading a 100KB file or running verbose commands fills context fast.
**How to avoid:** The SDK handles tool output budgeting internally. For custom tools, truncate large outputs. Set max output limits. The `effort` parameter can reduce per-turn token usage for simple operations.
**Warning signs:** Frequent `compact_boundary` events, agent losing track of earlier conversation.

### Pitfall 4: Compaction Losing Critical Instructions
**What goes wrong:** After compaction, the agent forgets project-specific rules or task context.
**Why it happens:** Compaction summarizes old messages and may lose specifics.
**How to avoid:** Put persistent instructions in the system prompt (re-injected every request), not in early user messages. Use CLAUDE.md-style `settingSources` to inject project conventions that survive compaction. Add "Summary instructions" section to control what the compactor preserves. [CITED: platform.claude.com/docs/en/agent-sdk/agent-loop]
**Warning signs:** Agent behavior changing after long conversations, repeating questions it already answered.

### Pitfall 5: bypassPermissions Security Model
**What goes wrong:** Using `bypassPermissions` mode means the agent can execute any tool without approval, including destructive bash commands.
**Why it happens:** D-11 specifies unsandboxed cross-project access (personal workstation).
**How to avoid:** This is intentional for the single-user personal workstation use case. However, add server-side guardrails: budget limits (`maxBudgetUsd`), turn limits (`maxTurns`), and log all tool executions to Drizzle for audit trail.
**Warning signs:** Unexpectedly high API costs, unintended file modifications.

## Code Examples

### Agent Loop Hono Route
```typescript
// Source: platform.claude.com/docs/en/agent-sdk/agent-loop + existing sse.ts pattern
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { gstackToolServer } from '../agent/tools'
import { db } from '../db/client'
import { sessions } from '../db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const agentApp = new Hono()

agentApp.get('/agent/stream', async (c) => {
  const prompt = c.req.query('prompt')
  const sessionMetaId = c.req.query('sessionId')

  if (!prompt && !sessionMetaId) {
    return c.json({ error: 'prompt or sessionId required' }, 400)
  }

  // Look up SDK session ID from our metadata
  let sdkSessionId: string | undefined
  if (sessionMetaId) {
    const session = db.select()
      .from(sessions)
      .where(eq(sessions.id, sessionMetaId))
      .get()
    sdkSessionId = session?.sdkSessionId ?? undefined
  }

  return streamSSE(c, async (stream) => {
    let eventCounter = 0

    for await (const message of query({
      prompt: prompt ?? 'Continue from where we left off.',
      options: {
        resume: sdkSessionId,
        includePartialMessages: true,
        allowedTools: [
          'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
          'mcp__gstack__*',  // All custom gstack tools
        ],
        permissionMode: 'bypassPermissions',
        maxTurns: 100,
        maxBudgetUsd: 5.0,
        mcpServers: { gstack: gstackToolServer },
      }
    })) {
      eventCounter++
      await stream.writeSSE({
        data: JSON.stringify(message),
        event: message.type ?? 'message',
        id: String(eventCounter),
      })
    }
  })
})

export default agentApp
```

### Frontend SSE Consumer Hook
```typescript
// Source: existing useSSE.ts pattern + Agent SDK message types
import { useCallback, useEffect, useRef, useState } from 'react'

interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: Array<{
    name: string
    id: string
    input: string
    output?: string
    isError?: boolean
  }>
}

export function useAgentStream(sessionId?: string) {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [activeTools, setActiveTools] = useState<Map<string, string>>(new Map())
  const [isStreaming, setIsStreaming] = useState(false)
  const sourceRef = useRef<EventSource | null>(null)

  const sendMessage = useCallback((prompt: string) => {
    setIsStreaming(true)
    setStreamingText('')

    const params = new URLSearchParams({ prompt })
    if (sessionId) params.set('sessionId', sessionId)

    const source = new EventSource(`/api/agent/stream?${params}`)
    sourceRef.current = source

    source.addEventListener('stream_event', (e) => {
      const data = JSON.parse(e.data)
      const event = data.event
      // Handle text deltas, tool starts/completions
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        setStreamingText(prev => prev + event.delta.text)
      }
      if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
        setActiveTools(prev => new Map(prev).set(event.content_block.id, event.content_block.name))
      }
    })

    source.addEventListener('result', (e) => {
      const data = JSON.parse(e.data)
      setIsStreaming(false)
      source.close()
    })

    source.onerror = () => {
      setIsStreaming(false)
      source.close()
    }
  }, [sessionId])

  return { messages, streamingText, activeTools, isStreaming, sendMessage }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom generator loop from scratch | Claude Agent SDK `query()` | 2026-03 (SDK public release) | Eliminates 90% of agent loop implementation work. Same engine as Claude Code. |
| Client-side context management | Server-side compaction API (beta) | 2026-01 (compact-2026-01-12 beta) | Anthropic handles summarization server-side. No token counting, no custom summarization prompts. |
| Manual session serialization | SDK session persistence (JSONL) + resume/fork | 2026-03 | Built-in session files, `listSessions()`, `getSessionMessages()`, `resume`, `fork`, `continue`. |
| Custom tool definitions (JSON Schema) | `tool()` helper + `createSdkMcpServer()` | 2026-03 | Type-safe tool definitions with Zod schemas. Annotations for read-only/destructive hints. |
| Custom streaming implementation | SDK `includePartialMessages` + StreamEvent | 2026-03 | Raw API streaming events exposed through the generator. |

**Deprecated/outdated:**
- Building custom tool_use loops with raw `@anthropic-ai/sdk` (still works, but Agent SDK wraps it with compaction, session persistence, and error recovery)
- The `context_management.edits` compaction API is beta -- requires `anthropic-beta: compact-2026-01-12` header

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Claude Agent SDK `query()` can be called from within a Hono request handler (non-CLI context) | Architecture Patterns | HIGH -- if SDK requires CLI environment or file system access patterns incompatible with a web server, we'd need a subprocess wrapper. The docs show it works as a library import in TypeScript. |
| A2 | SDK session files in `~/.claude/projects/` are sufficient for single-user persistence | Architecture Patterns | LOW -- worst case, we read session content and store in SQLite. SDK provides `getSessionMessages()` for this. |
| A3 | `bypassPermissions` mode is appropriate for a personal workstation agent | Common Pitfalls | LOW -- per D-11, this is intentional. Budget/turn limits provide guardrails. |
| A4 | SSE is sufficient for streaming agent output (vs WebSocket) | Architecture Patterns | LOW -- existing pipeline streaming proves SSE works. Agent loop is unidirectional (server to client) with separate POST for user input. |

## Open Questions

1. **SDK CWD Handling in Server Context**
   - What we know: SDK stores sessions relative to CWD. It works in CLI contexts.
   - What's unclear: Whether the SDK respects a programmatic CWD override when called from a Hono server, or if it always uses `process.cwd()`.
   - Recommendation: Test early in implementation. If CWD is fixed, pin it in server startup. SDK likely supports `cwd` option based on TypeScript Options type.

2. **Compaction + Drizzle Metadata Sync**
   - What we know: SDK fires `compact_boundary` events. Drizzle stores message metadata.
   - What's unclear: Whether message records in Drizzle should be updated/pruned when compaction occurs, or if metadata is append-only.
   - Recommendation: Keep Drizzle metadata append-only. Don't try to mirror SDK compaction state. The SDK JSONL is the source of truth for conversation state.

3. **Cross-Project File Access Scope**
   - What we know: D-11 specifies unsandboxed cross-project access. SDK built-in tools (Read, Write, Bash) operate relative to CWD.
   - What's unclear: Whether SDK tools can access files outside the session's CWD without custom tool wrappers.
   - Recommendation: Built-in tools should handle absolute paths. If not, the custom `gstack` MCP server tools fill this gap with explicit path parameters.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | 22.22.0 | -- |
| npm | Package management | Yes | 10.9.4 | -- |
| @anthropic-ai/claude-agent-sdk | Agent loop | Yes (registry) | 0.2.96 | -- |
| SQLite (better-sqlite3) | Session metadata | Yes | ^11.8 (installed) | -- |
| ANTHROPIC_API_KEY | Claude API access | Yes (env) | -- | -- |

**Missing dependencies with no fallback:** None
**Missing dependencies with fallback:** None

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1 |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npm test --workspace=packages/api` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | Agent loop starts, processes prompt, returns result | integration | `npx vitest run src/__tests__/agent-loop.test.ts -x` | Wave 0 |
| SESS-01 | Tool execution within agent loop | integration | `npx vitest run src/__tests__/agent-tools.test.ts -x` | Wave 0 |
| SESS-03 | Long conversation triggers compaction | integration | `npx vitest run src/__tests__/agent-compaction.test.ts -x` | Wave 0 |
| SESS-04 | Session persists and resumes | integration | `npx vitest run src/__tests__/agent-session.test.ts -x` | Wave 0 |
| SESS-04 | Session list API returns sessions | unit | `npx vitest run src/__tests__/sessions-api.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** Full suite across api + harness packages
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/agent-loop.test.ts` -- covers SESS-01 (mock SDK, verify SSE events)
- [ ] `packages/api/src/__tests__/agent-session.test.ts` -- covers SESS-04 (session CRUD)
- [ ] `packages/api/src/__tests__/sessions-api.test.ts` -- covers SESS-04 (API routes)
- [ ] Test helper for mocking `@anthropic-ai/claude-agent-sdk` `query()` generator

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Single-user, no auth (Phase 1 constraint) |
| V3 Session Management | Partial | Session IDs are nanoid-generated, no auth tokens. SDK session IDs are opaque strings. |
| V4 Access Control | No | Single-user, no RBAC |
| V5 Input Validation | Yes | Zod validation on all API inputs. Prompt sanitization via SDK. |
| V6 Cryptography | No | No secrets stored in sessions |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection via Bash tool | Tampering | SDK's `bypassPermissions` is intentional for personal workstation. Budget limits cap damage. All tool executions logged. |
| Prompt injection via tool output | Tampering | SDK handles tool result injection into conversation. Standard LLM guardrails apply. |
| SSE event spoofing | Spoofing | Single-user, localhost access. No auth needed Phase 1. |
| Cost runaway | Denial of Service | `maxBudgetUsd` and `maxTurns` limits on every session. Logged to Drizzle for visibility. |

## Sources

### Primary (HIGH confidence)
- [Claude Agent SDK - npm registry](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) - v0.2.96, published 2026-04-08 [VERIFIED]
- [Agent SDK - How the agent loop works](https://platform.claude.com/docs/en/agent-sdk/agent-loop) - Full architecture, message types, tool execution, compaction [CITED]
- [Agent SDK - Sessions](https://platform.claude.com/docs/en/agent-sdk/sessions) - Session persistence, resume, fork, continue [CITED]
- [Agent SDK - Custom Tools](https://platform.claude.com/docs/en/agent-sdk/custom-tools) - tool() helper, createSdkMcpServer(), annotations [CITED]
- [Agent SDK - Streaming Output](https://platform.claude.com/docs/en/agent-sdk/streaming-output) - includePartialMessages, StreamEvent, text/tool streaming [CITED]
- [Compaction API](https://platform.claude.com/docs/en/build-with-claude/compaction) - Server-side compaction beta, compact-2026-01-12 [CITED]
- Existing codebase: `packages/api/src/routes/sse.ts`, `packages/api/src/pipeline/stage-runner.ts`, `packages/harness/src/types.ts` [VERIFIED]

### Secondary (MEDIUM confidence)
- [Claude Code Architecture Deep Dive (Gist)](https://gist.github.com/yanchuk/0c47dd351c2805236e44ec3935e9095d) - 4-tier compression, sub-agent spawning, tool batching [CITED]

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Claude Agent SDK verified on npm, existing stack confirmed in codebase
- Architecture: HIGH - SDK docs provide clear integration patterns, existing SSE/Drizzle patterns proven
- Pitfalls: HIGH - SDK docs explicitly document session CWD issues, compaction behavior, and permission modes

**Research date:** 2026-04-08
**Valid until:** 2026-05-08 (30 days - SDK is actively versioned but core patterns are stable)
