# Phase 14: Dashboard & Project State - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can see the state of all their projects, infrastructure, and PR reviews from one screen. The dashboard is the landing page — the ops/orchestration view that replaces manually running /sitrep and /gsd:progress across 20+ projects.

</domain>

<decisions>
## Implementation Decisions

### Project Discovery
- **D-01:** Auto-detect projects with .planning/ directories across home dir, cross-reference with ~/CLAUDE.md project list
- **D-02:** Config file allows overrides — add/remove projects, set display names, group projects
- **D-03:** Projects without .planning/ (non-GSD) still show with git status if listed in ~/CLAUDE.md or config

### Data Freshness
- **D-04:** Poll on visit — read filesystem state when dashboard opens or refreshes
- **D-05:** No background polling or filesystem watchers — keep it simple, data is always current when viewed
- **D-06:** Mac Mini data via MCP bridge (already exists) or SSH queries — poll on visit same as local

### Dashboard Layout
- **D-07:** Project cards grid — card per project showing GSD phase, git status, last activity, uncommitted file count
- **D-08:** Cards should feel like Linear's project grid — clean, information-dense but not cluttered
- **D-09:** Visual indicators for active (recent activity), stale (no activity + uncommitted work), and ideating (has design docs, no code yet)

### Navigation Model
- **D-10:** Dashboard is home/landing view — always the starting point
- **D-11:** Sessions open as tabs — click a project card to start/resume a session
- **D-12:** Sidebar shows open sessions for quick switching
- **D-13:** Cmd+K command palette for quick switching between projects/sessions

### Additional Views
- **D-14:** Design doc browser — surface ~/.gstack/projects/ design docs with project association
- **D-15:** Worklog carryover view — aggregated carryover items from ~/.claude/logs/worklog.md with staleness tracking
- **D-16:** Mac Mini status — service health, Tailscale Funnel endpoints, deployment status
- **D-17:** PR review pipeline — existing v1.0 pipeline accessible as a view within the dashboard

### Claude's Discretion
- Exact card layout and information hierarchy
- Project grouping/sorting algorithm (by activity, by status, by name)
- Design doc preview rendering
- Stale threshold definition (how many days = stale)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design System
- `DESIGN.md` — Industrial precision aesthetic, electric lime accent, dark mode. Dashboard must follow.

### Existing Dashboard Components
- `packages/web/src/components/pipeline/` — Existing pipeline visualization (reusable pattern for GSD viz)
- `packages/web/src/components/layout/Sidebar.tsx` — Existing sidebar component (extend for session tabs)
- `packages/web/src/App.tsx` — Existing app shell and routing

### Data Sources
- `~/CLAUDE.md` — Project list with descriptions
- `~/.gstack/projects/` — Design doc artifacts from ideation sessions
- `~/.claude/logs/worklog.md` — Structured session signoffs with carryover items
- `.planning/STATE.md` — GSD state per project (milestone, phase, progress)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/web/src/components/layout/Sidebar.tsx` — Existing sidebar, can extend for session tabs
- `packages/web/src/components/pipeline/PipelineHero.tsx` — Pipeline visualization pattern (adapt for GSD phases)
- `packages/web/src/components/feed/` — Feed component patterns (adapt for project cards)
- `packages/web/src/hooks/useSSE.ts` — SSE for real-time updates
- `packages/web/src/lib/cn.ts` — Tailwind class merging utility

### Established Patterns
- React Query for server state management
- Tailwind CSS with DESIGN.md tokens
- Hono RPC client (hc) for type-safe API calls
- SSE for streaming updates

### Integration Points
- New routes in `packages/api/src/routes/` for project state, design docs, worklog, Mac Mini status
- New React components for dashboard views
- Extend Sidebar.tsx for session tab navigation
- Add Cmd+K command palette component

</code_context>

<specifics>
## Specific Ideas

- The dashboard replaces running 5 parallel recon agents to figure out what state everything is in
- Cards should show at a glance: project name, current GSD phase, last activity timestamp, uncommitted file count, active/stale indicator
- Design docs from ~/.gstack/projects/ should be browsable with project association — the ideation history is valuable context

</specifics>

<deferred>
## Deferred Ideas

- Agent efficiency metrics (commits/agent ratio trending) — future feature
- Session timeline visualization (project switching heatmap) — future feature

</deferred>

---

*Phase: 14-dashboard-project-state*
*Context gathered: 2026-04-08*
