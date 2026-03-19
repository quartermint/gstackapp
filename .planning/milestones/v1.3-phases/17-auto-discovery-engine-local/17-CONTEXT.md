# Phase 17: Auto-Discovery Engine (Local) - Context

**Gathered:** 2026-03-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Filesystem walker that finds git repos on the MacBook not already in mc.config.json. Track/dismiss actions. Discovery routes. SSE events. Own scan timer. Local filesystem only — SSH and GitHub org discovery are Phase 18.

</domain>

<decisions>
## Implementation Decisions

### Discovery behavior
- Depth-1 scan of configured root directories (default: `~`). Only immediate children, never recursive.
- Hard-coded exclusion list: node_modules, .Trash, Library, .cache, .cargo, .local, Applications, .npm, .nvm, .docker
- Minimum 1 commit required to be surfaced as a discovery (skip empty init repos)
- Discovery timer: hourly (repos don't appear frequently enough to justify faster)
- Discovery runs on its own timer, completely independent of the 5-minute project scan cycle

### Track/dismiss flow
- Promote (track): atomic mc.config.json write (tmp file + rename), insert into projects table, trigger immediate single-project scan so it appears on departure board right away
- Dismiss: permanent. Set status to "dismissed" in discoveries table. Never re-surface in subsequent scans.
- Both actions emit SSE events for real-time dashboard updates

### Dashboard integration
- Discoveries appear in the persistent top strip as a compact badge: "N discoveries"
- Click badge → dropdown/popover showing discovered repos with track/dismiss action buttons
- Each discovery card shows: repo directory name, remote URL (if any), last commit age

### Claude's Discretion
- Filesystem walker implementation details (fs.opendir vs readdir)
- API route naming and response shapes
- SSE event payload structure
- Exact exclusion list tuning

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scanner patterns
- `packages/api/src/services/project-scanner.ts` — Existing scan loop, SSH patterns, config reading, `normalizeRemoteUrl`
- `packages/api/src/services/event-bus.ts` — SSE event emission patterns

### Config and data
- `packages/api/src/lib/config.ts` — Config loader, mc.config.json shape
- `packages/api/src/db/schema.ts` — Table definitions (Phase 16 adds discoveries table)
- `mc.config.json` — Current project registry format (promote writes here)

### Routes
- `packages/api/src/routes/projects.ts` — Existing project route patterns for consistency

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `project-scanner.ts`: execFile pattern for git commands, scan loop with setInterval, TTLCache
- `event-bus.ts`: EventEmitter-based SSE with typed events
- `normalizeRemoteUrl()` from `git-health.ts` for remote URL comparison

### Established Patterns
- Services export functions that take DrizzleDb as param
- Routes use Hono factory with typed middleware
- Config read via `loadConfig()` at startup

### Integration Points
- New discovery service hooks into scan lifecycle (separate timer, not inside project scan)
- New routes register in `app.ts` (maintain Hono RPC type chain)
- SSE event types extend existing MCEvent union

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following existing patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-auto-discovery-engine-local*
*Context gathered: 2026-03-16*
