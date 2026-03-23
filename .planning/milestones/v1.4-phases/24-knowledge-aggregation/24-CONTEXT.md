# Phase 24: Knowledge Aggregation - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

MC aggregates CLAUDE.md content from all local and Mac Mini projects, caches by content hash, and serves via API. Stale knowledge detection flags outdated CLAUDE.md files. Convention scanning and MCP exposure are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Storage format
- **D-01:** Store CLAUDE.md as raw markdown text — no structured parsing into sections or JSON columns
- **D-02:** Convention scanner (Phase 26) will pattern-match against raw text with regex — no need for pre-parsed structure

### API response shape
- **D-03:** `/api/knowledge/:slug` returns raw CLAUDE.md content plus metadata envelope: contentHash, lastModified, fileSize, staleness score
- **D-04:** Dashboard consumes metadata for freshness display; MCP tools return full content for Claude to interpret

### Scanning behavior
- **D-05:** Knowledge aggregation runs on a separate hourly timer (not the 5-minute scan cycle) — per requirements
- **D-06:** Content-hash caching: only re-read files when git reports changes (KNOW-02)
- **D-07:** SSH failure for Mac Mini projects degrades gracefully — serve cached content, no errors in dashboard

### Stale knowledge detection
- **D-08:** CLAUDE.md files >30 days old with >10 commits since last update surface as `stale_knowledge` health findings (KNOW-11)

### Claude's Discretion
- Knowledge table schema design (columns, indexes)
- Content hash algorithm choice
- Exact staleness score calculation formula
- SSH connection pooling/retry strategy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Knowledge aggregation
- `.planning/REQUIREMENTS.md` — KNOW-01 through KNOW-03, KNOW-11 define aggregation requirements
- `.planning/ROADMAP.md` §Phase 24 — Success criteria (5 items)

### Existing patterns
- `packages/api/src/services/project-scanner.ts` — SSH scanning pattern, TTL cache, p-limit concurrency
- `packages/api/src/lib/config.ts` — Config schema with host types and project entries
- `packages/api/src/db/schema.ts` — Health findings table schema (reused for stale_knowledge type)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `project-scanner.ts`: SSH execution pattern (`execFile("ssh", [host, cmd])`) with 20s timeout — reuse for Mac Mini CLAUDE.md reads
- `normalizeRemoteUrl()`: Already deduplicates cross-machine projects — reuse for knowledge linking
- Health findings table: Already supports `stale_knowledge` check type (added in Phase 23)
- `p-limit`: Concurrency limiter already in use — reuse for parallel SSH reads

### Established Patterns
- TTL cache with 10-minute validity on scan data — apply similar pattern for knowledge cache
- Section-delimited git output parsing — can use `git show HEAD:CLAUDE.md` to read file content
- Health check pure functions — stale knowledge check should follow same pattern

### Integration Points
- Health findings table receives `stale_knowledge` findings
- API route group `/api/knowledge/` — new route file
- Scanner scheduler — new timer alongside existing scan cycle
- SSE events — `knowledge:updated` event for dashboard refresh

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

*Phase: 24-knowledge-aggregation*
*Context gathered: 2026-03-21*
