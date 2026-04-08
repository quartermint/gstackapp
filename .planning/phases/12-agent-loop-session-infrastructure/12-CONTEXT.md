# Phase 12: Agent Loop & Session Infrastructure - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Persistent AI conversations with tool execution that stay coherent over long interactions. Users can start conversations, have the AI use tools (file read/write, bash, grep, glob), and resume sessions across browser visits. This is the foundational infrastructure — routing, dashboard, and ideation all build on this.

</domain>

<decisions>
## Implementation Decisions

### Loop Architecture
- **D-01:** Generator-based agent loop modeled on Claude Code's proven pattern — async function* with typed terminal states, backpressure, composable sub-generators
- **D-02:** Go beyond CC's pattern: the loop has cross-project awareness, understands GSD state across all projects, can fork agents that work on multiple projects simultaneously
- **D-03:** The agent loop is aware of the ideation pipeline and design docs as first-class context, not just code
- **D-04:** 10-star vision: this is not "Claude Code in a browser" — it's an agent built for someone who runs 104 sessions/week across 20+ projects

### Session Storage
- **D-05:** Hybrid storage — SQLite (extend existing Drizzle schema) for structured data (sessions, messages, tool calls), filesystem for artifacts (design docs, context files, plan outputs)
- **D-06:** SQLite tables: sessions, messages, tool_calls. Drizzle schema extension of existing api database.

### Conversation UI
- **D-07:** Chat + artifact panel — chat as primary conversation interface, artifacts (design docs, code, plans, GSD state) open in a side panel
- **D-08:** The artifact panel is a living workspace — design docs update in real-time during ideation, GSD progress renders as interactive pipeline visualization
- **D-09:** Streaming via SSE (reuse existing pattern from v1.0 pipeline streaming)

### Tool Scope
- **D-10:** Full tool set — file read/write, bash, grep, glob. Full coding agent capabilities.
- **D-11:** NOT sandboxed per project — unsandboxed cross-project file access. This is a personal workstation. Cross-project learning is a key velocity multiplier.
- **D-12:** 4-layer context compression pipeline: snip compact, microcompact, context collapse, auto-compact (modeled on Claude Code's proven approach)

### Claude's Discretion
- Exact compression thresholds and triggering heuristics
- Tool result budgeting limits
- Session resume serialization format
- Loading skeleton and streaming chunk rendering approach

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Agent Loop Patterns
- `CLAUDE.md` — Technology stack constraints (Hono, SQLite, Drizzle, React)
- `DESIGN.md` — Visual design system for conversation UI

### Existing Infrastructure
- `packages/api/src/routes/sse.ts` — Existing SSE streaming pattern to reuse
- `packages/web/src/hooks/useSSE.ts` — Existing SSE client hook
- `packages/api/src/db/` — Existing Drizzle schema to extend
- `packages/harness/src/` — Provider registry, tool adapters, skill runner

### External References
- Claude Code source analysis (777genius/claude-code-source-code) — generator loop architecture, 4-layer compression, tool execution pipeline
- `packages/harness/src/types.ts` — Provider-agnostic tool types

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/routes/sse.ts` — SSE streaming endpoint, can be extended for agent loop streaming
- `packages/web/src/hooks/useSSE.ts` + `useSSEQuerySync.ts` — Client-side SSE consumption
- `packages/harness/src/adapters/` — Tool adapters for cross-harness portability
- `packages/harness/src/registry.ts` — Provider registry for multi-model routing
- `packages/api/src/db/` — Drizzle ORM setup with SQLite, schema patterns established

### Established Patterns
- Hono routes with typed responses
- React Query for server state
- SSE for real-time updates
- Drizzle ORM for database operations

### Integration Points
- New routes in `packages/api/src/routes/` for session management and agent loop
- New React components in `packages/web/src/components/` for conversation UI
- Extend Drizzle schema in `packages/api/src/db/` for sessions/messages

</code_context>

<specifics>
## Specific Ideas

- Cross-project awareness is key — "Seen in your other repos" feature from v1.0 proves the value of cross-project context
- The loop should feel like talking to a colleague who knows all your projects, not a generic AI in a sandbox
- Generator pattern with typed terminal states enables composability — sub-generators for tool execution, error recovery, compression

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-agent-loop-session-infrastructure*
*Context gathered: 2026-04-08*
