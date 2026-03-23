# Phase 34: Knowledge Compounding - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Build MC's learning system — a solutions registry that auto-captures outcomes from Claude Code sessions, structures them with metadata, and surfaces relevant learnings at the start of future sessions. Stolen from EveryInc/compound-engineering-plugin's `/ce:compound` + `learnings-researcher` loop.

</domain>

<decisions>
## Implementation Decisions

### Solutions Registry
- **D-01:** Solutions stored in SQLite table (not markdown files). MC is API-first — dashboard, MCP, and iOS all need to query solutions via API.
- **D-02:** Structured metadata: module, problem_type, symptoms, root_cause, tags, severity. Like CE's YAML frontmatter but in database columns.
- **D-03:** Solutions indexed in Phase 32's hybrid search alongside captures, commits, knowledge.

### Auto-Capture
- **D-04:** Auto-generate solution candidates from Claude Code session stop hooks. Claude decides the heuristic for what constitutes a "significant" session (user deferred this).
- **D-05:** Persist first, review later — auto-generated solutions are candidates, queued for human accept/edit/dismiss. Matches MC's existing capture philosophy.

### Learnings Surface
- **D-06:** Session startup MCP banner includes relevant learnings from past sessions. Search solutions DB for project-relevant precedent.
- **D-07:** `cross_project_search` MCP tool extended to include solutions.

### Compound Score
- **D-08:** Dashboard metric tracking knowledge reuse rate over time. How often solutions get referenced by sessions.

### Claude's Discretion
- What makes a session "significant" enough for auto-capture (commit count, duration, file count — Claude picks the heuristic)
- Solution candidate presentation UX in dashboard
- Compound score visualization (number, chart, badge)
- How solution candidates surface for review (notification, dedicated section, inline)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision
- `.planning/v2.0-VISION.md` — COMP-01 through COMP-06 requirements

### Session Hooks
- `packages/api/src/routes/sessions.ts` — Session lifecycle routes (hook/start, hook/heartbeat, hook/stop)
- `packages/api/src/services/budget-service.ts` — Session tracking patterns

### MCP Tools
- `packages/mcp/` — Existing MCP server with cross_project_search tool (to be extended)

### Knowledge Infrastructure
- `packages/api/src/db/queries/knowledge.ts` — Knowledge CRUD patterns (reuse for solutions)
- `packages/api/src/db/schema.ts` — Table schema patterns

### Inspiration
- EveryInc/compound-engineering-plugin — `/ce:compound` pattern, `docs/solutions/` with YAML frontmatter, `learnings-researcher` agent

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Session stop hooks already capture: project slug, duration, commit count
- `knowledge` table pattern — content-hash caching, structured metadata
- MCP `cross_project_search` tool — extend to search solutions
- SSE event bus — broadcast new solution candidates

### Established Patterns
- Hook-specific endpoints (POST /sessions/hook/stop)
- Health findings as structured metadata (reuse pattern for solution metadata)
- `resolveProjectFromCwd` for session-to-project mapping

### Integration Points
- New `solutions` table in schema.ts
- Session stop hook response — trigger solution candidate generation
- MCP startup banner — add learnings to existing knowledgeContext
- Dashboard — new compound score widget + solution review UI

</code_context>

<specifics>
## Specific Ideas

- CE's `/ce:compound` spawns 5 parallel agents (Context Analyzer, Solution Extractor, Related Docs Finder, Prevention Strategist, Category Classifier). MC should do similar extraction but via single LM Studio call (local, not cloud agents).
- The compound score could show as a trend line — knowledge reuse rate going up over time means the system is working.
- Solution candidates should include: what was the problem, what was tried, what worked, what was the root cause. Same structure as CE's `docs/solutions/` files.

</specifics>

<deferred>
## Deferred Ideas

- Manual `/compound` command equivalent for MC CLI
- Solution sharing across MC instances (multi-user future)
- Solution quality scoring (which solutions are most helpful)

</deferred>

---

*Phase: 34-knowledge-compounding*
*Context gathered: 2026-03-22*
