# Phase 10: MCP Server & Portfolio-Dashboard Deprecation - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

New `@mission-control/mcp` package with 4 tools (project_health, project_risks, project_detail, sync_status) running as stdio process on MacBook. Session startup hook integration. Direct swap from portfolio-dashboard with GitHub archive.

</domain>

<decisions>
## Implementation Decisions

### Session Startup Hook
- **Risks appear AFTER worklog** — worklog provides session context first, then risks section follows with labeled header
- **Critical risks listed individually, warnings summarized** — format: individual critical risk lines, then `+ N warnings (see dashboard)`. Avoids noise from 10+ dirty-tree warnings while ensuring critical items are visible.
- Zero noise when all projects healthy (no risks section at all)

### Deprecation Cutover
- **Direct swap** — build MC MCP, test it once, swap the Claude Code MCP config, archive portfolio-dashboard. No parallel-run period. If something breaks, revert config.
- **Archive on GitHub** — set portfolio-dashboard repo to archived (read-only, accessible for reference, can unarchive if needed). Don't delete.

### Claude's Discretion
- MCP tool response format details (follow spec examples)
- Error handling for API unreachable (try/catch all fetch, return errors as MCP content not exceptions)
- stdout pollution prevention (redirect console to stderr before any imports)
- Bundle approach for standalone execution (tsup recommended by research)

</decisions>

<specifics>
## Specific Ideas

- The MCP server is a thin HTTP client over the MC API — it imports nothing from `@mission-control/api` or `@mission-control/shared`. API-first enforced.
- Session hook format example:
  ```
  Worklog: 10 active — signal-glass (blocked 4d...), ...
  Last session: ...
  ---
  RISKS (2 critical, 3 warnings):
    🔴 open-ez: 54 unpushed commits (public repo)
    🔴 operating-system: no remote configured
    + 3 warnings (see dashboard)
  ```

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `portfolio-dashboard/server.py`: Existing MCP server being replaced. Reference for stderr logging pattern and tool API shape.
- `packages/api/src/routes/`: All health/risk/copy/timeline API endpoints from Phase 8 — MCP tools are thin wrappers over these.

### Established Patterns
- **MCP SDK**: `@modelcontextprotocol/sdk` v1.27.1 with `StdioServerTransport`.
- **pnpm monorepo**: New package at `packages/mcp/` with its own `package.json` and `tsconfig.json`.
- **Native fetch**: Node.js 22 built-in fetch for API calls — no axios/undici needed.

### Integration Points
- `~/.claude/claude_desktop_config.json` or equivalent: MCP server config pointing to new package.
- Session startup hook: Calls `project_risks` MCP tool, formats output for banner.
- `MC_API_URL` env var: Defaults to `http://100.x.x.x:3000` (Mac Mini Tailscale IP).

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-mcp-server-deprecation*
*Context gathered: 2026-03-14*
