# Phase 5: Dashboard Enrichments & Real-Time - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the dashboard from a static display into a living awareness surface. Sprint heatmap shows serial sprint patterns at a glance. "Previously on..." breadcrumbs provide instant project context restoration. Stale nudges give gentle reminders about forgotten work. Mac Mini health pulse provides ambient system awareness. SSE pushes updates live without page refresh.

Covers: DASH-05 (sprint heatmap), DASH-06 ("Previously on..." breadcrumbs), DASH-07 (stale nudges), DASH-08 (Mac Mini health pulse), DASH-09 (SSE real-time updates).

Not in scope: AI-generated narrative summaries (AINT-02 — v2), CLI/MCP clients, iOS companion, vector/embedding search.

</domain>

<decisions>
## Implementation Decisions

### Sprint heatmap
- Positioned above departure board, below capture field — full-width, first thing you see after the capture field
- 12-week time range (~3 months), showing 2-3 sprint cycles
- Activity metric: commits only (count per day) — no captures, no file change weighting
- Only projects with commits in the 12-week window shown (Active + Idle) — stale projects with zero activity omitted to avoid empty row noise
- GitHub-style contribution grid: one row per project, columns are days/weeks, cell intensity = commit count
- Commit data already persisted in SQLite with `author_date` from Phase 4 — query aggregates by day

### "Previously on..." breadcrumbs
- Expandable per project row — small chevron/arrow on each row, click to expand inline
- Collapsed by default — keeps departure board dense
- Content: last 3-5 commit messages (hash + message + relative time) plus GSD phase/status if `.planning/` exists
- No AI-generated narrative — commits + GSD state only (AI narrative deferred to v2 AINT-02)
- Data source: project scanner already reads 50 commits and GSD state per project — no new data fetching needed

### Stale project nudges
- Subtle row treatment: muted amber/gold left border or background tint on projects idle 2+ weeks with uncommitted work
- Not alarming, just noticeable — "hey" energy, consistent with warm color system
- Tooltip on hover explains why it's highlighted (e.g., "uncommitted changes — 18 days idle")
- Criteria: last commit > 14 days ago AND dirty files > 0
- Applied within existing departure board rows — no separate section

### Mac Mini health pulse
- Full system metrics: CPU%, memory%, disk%, uptime, plus per-service status
- Ambient indicator: existing health dot in header (green/amber/red) — stays as the quick-glance signal
- Click dot to expand a small panel showing all metrics and service statuses
- Data collection: primary via new `/api/health/system` endpoint (Node.js `os` module + `child_process` for service checks), secondary via mac-mini-bridge MCP for services not checkable natively
- Service list configurable in mc.config.json
- Polling: 30-second interval from frontend — fast enough to notice issues within a minute
- Health dot color: green (all services up), amber (degraded — some services down), red (API unreachable)

### SSE real-time updates
- Two event streams: capture lifecycle (created, enriched, archived) and project scan updates (scan complete with new data)
- Health status NOT on SSE — stays on its own 30s poll cycle
- Single SSE connection to `/api/events` with event `type` field dispatching (capture:created, capture:enriched, capture:archived, scan:complete)
- Notification-only payloads: SSE sends `{type, id}` — frontend hooks refetch from existing API endpoints. No duplicate data serialization
- Frontend: `useSSE()` hook with auto-reconnect (exponential backoff). Dispatches to existing hooks (useCaptures, useProjects) to trigger refetches
- Server: Hono SSE helper or native `ReadableStream` with event emitter pattern — emit events when captures are created/enriched and when background scan completes

### Claude's Discretion
- Heatmap cell color intensity scale (how many commits = which shade)
- Heatmap mobile responsiveness (hide, condense, or horizontal scroll)
- Exact "Previously on..." expand/collapse animation
- Health panel positioning and dismiss behavior
- SSE reconnection backoff timing
- How SSE connection state is shown to user (if at all)
- Exact amber/gold shade for stale nudge treatment
- Service check implementation details (process detection, port checks, etc.)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/services/project-scanner.ts`: Already reads 50 commits per project with `author_date`, caches with TTL, polls every 5 min. Heatmap data source
- `packages/api/src/db/queries/commits.ts`: `getCommitsByProject()` with Drizzle query + `upsertCommits()` — extend with date-range aggregation for heatmap
- `packages/api/src/routes/health.ts`: Existing health endpoint returning `{status, timestamp, version}` — extend with `/health/system`
- `packages/web/src/components/departure-board/project-row.tsx`: Row component to extend with expand chevron, stale nudge treatment
- `packages/web/src/hooks/use-projects.ts`: TanStack-style hook for project data — SSE will trigger its refetch
- `packages/web/src/hooks/use-captures.ts`: Capture hooks — SSE will trigger refetch on capture lifecycle events
- `packages/api/src/services/ai-categorizer.ts`: Vercel AI SDK + Gemini 3 Flash pattern — no AI needed in Phase 5 but graceful degradation pattern established
- `packages/web/src/components/layout/dashboard-layout.tsx`: Layout with header health dot — extend with clickable health panel

### Established Patterns
- Tailwind v4 CSS-native @theme with warm color tokens (terracotta, amber, sage, rust, gold)
- Background poll via setInterval with graceful shutdown (SIGTERM/SIGINT)
- TTL cache as simple Map with timestamp entries
- App factory pattern with DI for testability
- useMemo for derived data, AbortController for fetch cancellation
- FTS5 via raw better-sqlite3 SQL (Drizzle has no virtual table support)
- `isAIAvailable()` guard pattern for graceful degradation

### Integration Points
- Heatmap API: new `/api/heatmap` endpoint aggregating commits by project + day over 12 weeks
- Health system: new `/api/health/system` endpoint + mac-mini-bridge MCP fallback
- SSE: new `/api/events` SSE endpoint + event emitter in capture routes and scanner
- Project rows: extend with expand chevron for "Previously on..." + stale nudge styling
- Dashboard layout: heatmap component inserted between capture field and hero card
- Header: health dot becomes clickable with expandable panel

</code_context>

<specifics>
## Specific Ideas

- Heatmap makes the "serial sprint" pattern visible — you can literally see which project got intense focus and when
- "Previously on..." is the instant context restoration — click a project row, see what you were doing, without opening a terminal
- Stale nudges are gentle, not naggy — "hey" energy, not "WARNING: STALE PROJECT"
- Health pulse is ambient awareness — glance at the dot, details on demand
- SSE makes the dashboard feel alive — captures appear, enrichments update, scans refresh — all without touching F5

</specifics>

<deferred>
## Deferred Ideas

- AI-generated narrative summaries for "Previously on..." (AINT-02) — v2 enhancement on top of commit breadcrumbs
- SSE for health status changes — 30s poll sufficient for v1, could add SSE push for urgent changes later
- SSE for search index updates — internal event, no user-visible impact

</deferred>

---

*Phase: 05-dashboard-enrichments-real-time*
*Context gathered: 2026-03-10*
