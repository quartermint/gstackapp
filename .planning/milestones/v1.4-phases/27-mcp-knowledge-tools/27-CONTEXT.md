# Phase 27: MCP Knowledge Tools + Session Enrichment - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Expose project knowledge, convention checks, and cross-project search as MCP tools. Enrich Claude Code session startup banner with project knowledge summary. All underlying API endpoints must exist from Phases 24-26.

</domain>

<decisions>
## Implementation Decisions

### MCP tool response format
- **D-01:** Formatted markdown text — same pattern as existing 6 MCP tools (project_health, project_risks, etc.)
- **D-02:** No structured JSON responses — Claude handles text naturally, consistency with existing tools

### Startup banner enrichment
- **D-03:** Extend existing startup banner (currently shows critical risks) with: related projects (from dependsOn), active convention violations, stale knowledge flag
- **D-04:** Banner stays concise: 3-5 lines max. Details available via MCP query tools.
- **D-05:** Banner content fetched via existing session startup hook endpoint

### MCP tools
- **D-06:** `project_knowledge` — returns aggregated CLAUDE.md content for a project (raw text + metadata)
- **D-07:** `convention_check` — returns active conventions and any violations for a project
- **D-08:** `cross_project_search` — searches across all project knowledge, returns matching results with context

### Claude's Discretion
- MCP tool description and parameter naming
- Search result ranking and snippet extraction
- Banner formatting and section ordering
- Error handling for missing knowledge data

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP tools
- `.planning/REQUIREMENTS.md` — KNOW-07 through KNOW-10 define MCP tool and session enrichment requirements
- `.planning/ROADMAP.md` §Phase 27 — Success criteria (4 items)

### Existing MCP patterns
- `packages/mcp/src/index.ts` — MCP server setup, tool registration pattern, fetchApi() helper
- `packages/mcp/src/tools/` — Existing tool implementations (if directory exists) or inline in index.ts

### Session hooks
- `packages/api/src/routes/hooks.ts` — Session startup hook endpoint, existing banner generation

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchApi()` helper in MCP package — HTTP client for MC API, reuse for all 3 new tools
- `textContent()` / `errorContent()` — MCP response formatters
- Session startup hook endpoint — already generates banner text, extend with knowledge context
- FTS5 search index — may be leveraged for cross-project search if knowledge is indexed

### Established Patterns
- MCP tool registration: `server.registerTool(name, { description }, async handler)`
- Response format: formatted text with ASCII dividers and sections
- API → MCP thin wrapper pattern: MCP tools fetch from API, format for Claude

### Integration Points
- Knowledge API endpoints (Phase 24) — `/api/knowledge/:slug`
- Convention API endpoints (Phase 26) — convention check results
- Session hook endpoint — extend response payload
- MCP server tool registry — add 3 new tools

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 27-mcp-knowledge-tools*
*Context gathered: 2026-03-21*
