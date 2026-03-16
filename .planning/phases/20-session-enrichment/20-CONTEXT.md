# Phase 20: Session Enrichment - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

MCP session tools (session_status, session_conflicts), convergence detection across parallel sessions, convergence badge on project cards. Builds on v1.2 session infrastructure. No new schema needed — queries existing sessions and health tables.

</domain>

<decisions>
## Implementation Decisions

### MCP session tools
- `session_status`: list active sessions, optionally filtered by project slug. Returns session ID, project, start time, file count, agent type, model tier.
- `session_conflicts`: list active file-level conflicts. Returns file paths, session identifiers, project.
- Both are thin HTTP wrappers over existing API endpoints — same pattern as v1.1 MCP tools.

### Convergence detection
- Convergence fires when: (a) 2+ sessions on same project, (b) file sets overlap, (c) at least one session committed, (d) both sessions active within 30-minute temporal window
- All 4 conditions required — same project alone is NOT sufficient (false positive control)
- Convergence runs as a post-scan check (like health checks), not real-time
- Results stored as health findings with type="convergence" (reuses risk feed infrastructure)

### Convergence display
- Passive badge on project card — small indicator similar to health dot, NOT a risk feed alert card
- Badge shows when convergence detected, disappears when sessions end or files no longer overlap
- No action required from user — informational only ("these sessions might want to merge")

### Claude's Discretion
- Exact convergence algorithm implementation
- MCP tool response shapes (follow existing tool patterns)
- Convergence finding severity level
- Temporal window tuning (30 min default, may need adjustment based on real data)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Session infrastructure
- `packages/api/src/services/session-service.ts` — Session lifecycle, query patterns
- `packages/api/src/services/conflict-detector.ts` — File-level conflict detection (convergence builds on this)
- `packages/api/src/db/queries/sessions.ts` — Session query module

### MCP server
- `packages/mcp/src/index.ts` — Existing MCP tool definitions (project_health, project_risks, project_detail, sync_status)

### Health infrastructure
- `packages/api/src/services/git-health.ts` — Health finding patterns, severity levels
- `packages/api/src/db/queries/health.ts` — upsertHealthFinding, resolveFindings

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `conflict-detector.ts`: File overlap detection across sessions — convergence extends this
- `session-service.ts`: Session queries, status machine, project resolution
- MCP server: 4 existing tools as templates for session_status and session_conflicts

### Established Patterns
- Health findings with type/severity/details stored in project_health table
- MCP tools are thin HTTP wrappers using fetch against MC API
- Post-scan checks run after project scanner completes

### Integration Points
- Convergence detector hooks into post-scan phase (after health checks)
- MCP tools added to packages/mcp/src/index.ts tool definitions
- Health dot on project cards already handles multiple finding types — convergence adds one more

</code_context>

<specifics>
## Specific Ideas

**Research flag:** Convergence detection is novel. Validate the algorithm against existing v1.2 session records before committing to the UI representation. False positive rate target: <2 false alerts per day.

</specifics>

<deferred>
## Deferred Ideas

- Smart routing with learning from historical session outcomes — needs months of session data, deferred to v2.0
- Session convergence merge preview (git merge-base analysis) — deferred, convergence detection itself is complex enough

</deferred>

---

*Phase: 20-session-enrichment*
*Context gathered: 2026-03-16*
