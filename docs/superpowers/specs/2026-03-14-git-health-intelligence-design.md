# Mission Control v1.1 — Git Health Intelligence + MCP

**Date:** 2026-03-14
**Status:** Reviewed (rev 2)
**Scope:** Git sync health engine (7 checks), multi-host copy discovery, dashboard risk feed + sprint timeline, MCP server, portfolio-dashboard deprecation

## Problem

Mission Control v1.0 tracks project activity (commits, dirty files, GSD state) but has zero awareness of remote sync status. It doesn't know if commits are pushed, if remotes exist, or if copies of the same repo on different machines have diverged.

On 2026-03-14, a manual audit discovered:
- 137 unpushed commits on `profile`
- 54 unpushed commits on `open-ez` (public repo)
- 2 repos with no GitHub remote configured
- 3 repos with broken upstream tracking
- 2 repos diverged between MacBook and Mac Mini
- 1 repo with a deleted remote branch

Mission Control should have caught all of this. It didn't because the scanner only runs `git status --porcelain` and `git log` — no remote-aware checks.

Additionally, the sprint heatmap (GitHub-style contribution grid) doesn't fit the user's serial sprint work pattern and provides no actionable information.

## Solution

### 1. Git Health Engine

Extend the project scanner to perform 7 remote-aware health checks after each scan cycle.

#### Checks

| Check | Command | Severity Logic |
|-------|---------|---------------|
| Unpushed commits | `git rev-list @{u}..HEAD --count` | Warning: 1-5, Critical: 6+ |
| No remote | `git remote -v` returns empty | Critical |
| Broken tracking | `git rev-parse --abbrev-ref @{u}` fails | Critical |
| Remote branch gone | `git status -sb` shows `[gone]` | Critical |
| Unpulled commits | `git rev-list HEAD..@{u} --count` | Warning |
| Dirty working tree | Existing check, add age tracking | Info: fresh, Warning: 3+ days, Critical: 7+ days (age = `now - detectedAt`) |
| Diverged copies | Compare HEAD across hosts (see Section 2) | Critical |

**Public repo severity escalation:** Projects with a public remote (determined by `gh api repos/{owner}/{repo} --jq .private` during first scan, cached in `project_copies.isPublic`) escalate unpushed commits one tier: 1-5 unpushed on public = Critical (not Warning). Rationale: public repos with unpushed work means the published version is stale.

**GitHub-host projects:** Projects configured with `host: "github"` (no local clone) skip all git checks except "Unpulled commits" (detectable via GitHub API: compare default branch HEAD with last-known local activity). These projects get `healthScore: null` and `riskLevel: "unmonitored"` — they appear on the dashboard with a gray dot and "no local clone" label. Health checks only apply to repos that exist on disk.

#### Risk Scoring

Each project gets:
- `healthScore`: 0-100, computed from worst severity across all checks. `null` for github-only projects.
- `riskLevel`: `healthy` / `warning` / `critical` / `unmonitored`

#### Data Model

**`project_health` table (new):**

| Column | Type | Purpose |
|--------|------|---------|
| id | integer PK | Auto-increment |
| projectSlug | text FK | Links to projects |
| checkType | text | One of the 7 check types |
| severity | text | info / warning / critical |
| detail | text | Human-readable description, e.g. "54 unpushed commits" |
| metadata | text (JSON) | Machine-readable data, e.g. `{"count": 54, "public": true}` |
| detectedAt | text | ISO timestamp when first detected |
| resolvedAt | text | ISO timestamp when resolved, null if active |

Indexed on `(projectSlug, checkType, resolvedAt)` for fast "active risks" queries.

**Upsert semantics:** Each scan cycle upserts findings by `(projectSlug, checkType)` where `resolvedAt IS NULL`. On upsert: `detail`, `metadata`, and `severity` are updated to reflect current state; `detectedAt` is **preserved** from the original insert (never overwritten — this is how dirty age tracking works). When a check passes that previously had an active finding, `resolvedAt` is set to now. If the same check fails again after resolution, a new row is inserted with a fresh `detectedAt`. This means dirty-first-seen = `detectedAt` of the active `dirty_working_tree` finding. The "Stale dirty age" is not a separate check — it's the dirty working tree check with severity that escalates based on `now - detectedAt`.

**`project_copies` table (new):**

| Column | Type | Purpose |
|--------|------|---------|
| id | integer PK | Auto-increment |
| projectSlug | text FK | Links to projects |
| host | text | local / mac-mini |
| path | text | Filesystem path on that host |
| remoteUrl | text | Normalized origin remote URL |
| headCommit | text | Current HEAD hash |
| branch | text | Current branch name |
| isPublic | integer | 1 if remote repo is public, 0 if private, null if unknown |
| lastCheckedAt | text | ISO timestamp |

Indexed on `(projectSlug, host)` unique, and on `remoteUrl` for copy matching. The `host` enum is `local / mac-mini` only (not `github` — github-only projects don't have copies on disk).

### 2. Multi-Host Copy Discovery

#### Auto-Discovery

After scanning all repos on both hosts:
1. Collect `origin` remote URL for each repo
2. Normalize URLs: strip `.git` suffix, normalize `git@github.com:` to `github.com/`
3. Group by normalized URL
4. Any slug appearing on multiple hosts → multi-copy project
5. Repos with no remote → flagged but cannot be auto-matched

#### Config Support

`mc.config.json` supports both single-host (existing) and multi-host entries via a Zod discriminated union:

```json
// Existing format still works — auto-discovery finds other copies
{ "slug": "streamline", "path": "~/streamline", "host": "local", "tagline": "..." }

// Explicit multi-host declaration
{
  "slug": "streamline",
  "tagline": "...",
  "copies": [
    { "host": "local", "path": "~/streamline" },
    { "host": "mac-mini", "path": "~/streamline" }
  ]
}
```

**Schema migration:** The existing `projectEntrySchema` in `packages/api/src/lib/config.ts` stays unchanged. A new `multiCopyEntrySchema` is added with `copies` array and without `host`/`path`. The config loader uses `z.union([projectEntrySchema, multiCopyEntrySchema])`. The scanner's `scanAllProjects()` normalizes both formats into a flat list of `(slug, host, path)` tuples before iterating — no changes to individual scan functions. Existing configs continue to work without modification.

Explicit config takes precedence over auto-discovery. Auto-discovered copies are surfaced on the dashboard as "discovered" — they don't silently modify config.

#### Divergence Detection

For multi-copy projects, after scanning both copies:
1. Compare HEAD commit hashes
2. If equal: synced
3. If one is ancestor of the other (`git merge-base --is-ancestor`): one copy is behind (Warning)
4. If neither is ancestor: diverged (Critical)

**Ancestry check approach:** During the normal scan cycle, each copy's HEAD commit hash is collected and stored in `project_copies.headCommit`. Divergence detection runs as a post-scan reconciliation pass using the stored hashes — no additional SSH round-trip. The local repo can check ancestry using `git merge-base --is-ancestor <mac-mini-head> <local-head>` because both repos share history via the same remote. If the Mac Mini copy was unreachable during the scan (SSH timeout), its `lastCheckedAt` is stale — divergence check uses the last-known `headCommit` and the finding includes a staleness warning ("Mac Mini copy last checked 2 hours ago").

### 3. Dashboard Changes

#### Risk Feed

New section at top of dashboard, above the departure board. Appears when there are active `critical` or `warning` findings. Disappears when all findings are `info` or resolved (zero critical + zero warning = clean). Replaces the heatmap's position in the current layout (`App.tsx`: capture field → risk feed → sprint timeline → departure board).

**Layout:** Compact horizontal cards, grouped by severity (critical first).

**Each card shows:**
- Severity icon + color (red = critical, amber = warning)
- Project name
- Problem description ("54 unpushed commits to public repo")
- Duration ("detected 3 days ago")
- Action hint ("push", "create remote", "pull")

**Behavior:**
- Cards are not dismissable — they disappear when the underlying issue is resolved
- Risks detected in the current scan cycle are marked "new"
- The count appears in the page title: `(3) Mission Control` for browser tab visibility

#### Project Card Health Indicators

Each project card on the departure board gets a health dot alongside the existing dirty-files badge:

| Dot | Meaning |
|-----|---------|
| Green | Synced, clean, all checks pass |
| Amber | Minor issues (few unpushed, dirty < 3 days) |
| Red | Critical (no remote, diverged, 6+ unpushed, stale dirty) |
| Split (half green/half red) | Multi-copy project with divergence |

Clicking the dot expands inline to show specific findings. Same interaction pattern as existing "Previously On" commit breadcrumbs — no new page, no modal.

#### Sprint Timeline (replaces heatmap)

Horizontal swimlane chart replacing the GitHub-style contribution heatmap.

**Axes:**
- X-axis: days, 12-week default window
- Y-axis: projects with activity in the window (auto-filtered)

**Rendering:**
- Each project gets a horizontal bar with segments colored by commit density (light → saturated)
- Currently-focused project (most commits in last 7 days) is highlighted
- Gaps between segments make sprint boundaries visible

**What it answers:**
- Which project you're focused on right now
- When you last touched a given project
- How fragmented your focus has been (multiple active bars = context switching)
- Sprint duration patterns over time

**Interaction:**
- Hover: commit count + date range for that segment
- Click: navigates to project detail card on departure board

**Data source:** Existing `commits` table. No new data collection — different rendering of what's already there. The existing `GET /api/heatmap` route returns `HeatmapEntry[]` (projectSlug, date, count) which has the right data but wrong shape. The new `/api/sprint-timeline` endpoint returns data grouped by project with continuous segments (start date, end date, total commits) rather than per-day cells, so the frontend can render bars instead of grids. The heatmap route is deprecated but not removed in v1.1.

**Sprint timeline response format:**
```typescript
{
  projects: [
    {
      slug: "mainline-api",
      segments: [
        { startDate: "2026-02-28", endDate: "2026-03-13", commits: 47, density: 0.85 }
      ]
    }
  ],
  focusedProject: "mainline-api", // most commits in last 7 days
  windowDays: 84 // 12 weeks
}
```

### 4. MCP Server

New package: `@mission-control/mcp` in the pnpm monorepo.

#### Architecture

Thin MCP server process that calls the Mission Control API as a client. Does not duplicate scanning logic. Translates API responses into MCP tool results.

**Configuration:** API base URL via `MC_API_URL` env var, defaults to `http://100.x.x.x:3000` (Mac Mini Tailscale IP). The MCP process runs on the MacBook (where Claude Code runs), connecting to the MC API on the Mac Mini.

#### Tools

| Tool | Purpose | Primary consumer |
|------|---------|-----------------|
| `project_health` | Full health report — all projects, all checks, risk scores | `/sitrep`, broad status |
| `project_risks` | Active problems only, filtered by severity | Session startup hook |
| `project_detail` | Deep status on one project — commits, health, copies, dirty | Entering a project dir |
| `sync_status` | Sync report — unpushed, no remote, diverged, broken tracking | Before pushing, sync audits |

#### Session Startup Integration

The existing session startup hook calls `project_risks` via MCP. If critical risks exist, they appear in the startup banner alongside the worklog summary:

```
RISK: open-ez has 54 unpushed commits (public repo)
RISK: operating-system has no remote configured
```

Zero noise when all projects are healthy.

#### Tool Response Format

```typescript
// project_risks response
{
  critical: [
    { project: "open-ez", check: "unpushed", detail: "54 unpushed commits", public: true, detectedDaysAgo: 3 },
    { project: "operating-system", check: "no_remote", detail: "No remote configured", detectedDaysAgo: 5 }
  ],
  warning: [
    { project: "principals-ear", check: "unpushed", detail: "2 unpushed commits", detectedDaysAgo: 1 }
  ],
  summary: "2 critical, 1 warning across 35 projects"
}
```

### 5. Portfolio-Dashboard Deprecation

The existing `portfolio-dashboard` MCP server is replaced by `@mission-control/mcp`. Migration:

| portfolio-dashboard tool | mission-control equivalent |
|-------------------------|---------------------------|
| `portfolio_status` | `project_health` |
| `project_detail` | `project_detail` |
| `activity_timeline` | `project_health` (includes recent commits) |
| `find_uncommitted` | `project_risks` (filter: dirty + unpushed) |
| `sprint_history` | `project_detail` (includes sprint segments from `/api/sprint-timeline` data) |

**Migration steps:**
1. Build and test `@mission-control/mcp`
2. Update Claude Code MCP config to point to new server
3. Remove `portfolio-dashboard` from MCP config
4. Archive `portfolio-dashboard` repo (don't delete — reference)

### 6. API Routes (New/Modified)

**New routes:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health-checks` | All active health findings, filterable by severity |
| GET | `/api/health-checks/:slug` | Health findings for one project |
| GET | `/api/copies` | All multi-copy projects with sync status |
| GET | `/api/copies/:slug` | Copy details for one project |
| GET | `/api/risks` | Active risks aggregated, sorted by severity |
| GET | `/api/sprint-timeline` | Commit data grouped by project and bucketed by day, for swimlane rendering |

**Modified routes:**

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/projects` | Add `healthScore`, `riskLevel`, `copyCount` to response |
| GET | `/api/projects/:slug` | Add health findings + copy details to response |

### 7. Scanner Changes

The project scanner (`project-scanner.ts`) currently runs on a 5-minute poll interval. Changes:

1. After existing scan (status + log), run remote-aware checks for each repo
2. Write findings to `project_health` table (upsert: same project + check type updates existing active finding)
3. Auto-resolve findings that no longer apply (set `resolvedAt`)
4. After all repos scanned, run copy reconciliation pass
5. Emit new SSE events: `health:changed`, `copy:diverged` (add to `MCEventType` union in `event-bus.ts` and register listeners in the frontend `useSSE` hook)

**Fetch freshness:** The scanner does NOT run `git fetch` — that would be a write operation and could be slow. Instead, `@{u}` checks reflect the state as of the last fetch. This means unpushed/unpulled counts may be stale if no one has fetched recently. This is acceptable — the checks catch the common case (local work that was never pushed) and a `git fetch` runs naturally when you interact with the repo. A future enhancement could add an optional fetch-on-scan mode.

**Performance:** Health checks run in parallel per repo (same `Promise.allSettled` pattern as existing scan). Each repo runs ~5 git commands total. For 35 repos in parallel, the added wall-clock time is ~1-2 seconds for local repos, plus SSH latency for Mac Mini repos (already bounded by 20s timeout). Well within the 5-minute interval.

### 8. Non-Goals

- No auto-fix actions from the dashboard (MC surfaces problems, you fix them in the terminal)
- No git operations (push, pull, commit) from the API
- No multi-user auth changes
- No changes to capture system, search, or command palette
- No notification push beyond the MCP session hook
- No changes to port monitoring system

### 9. Testing Strategy

- Health engine checks: unit tests with mocked git command output for each of the 7 check types
- Copy discovery: unit tests for URL normalization, grouping, divergence detection
- API routes: integration tests with seeded health findings
- MCP server: integration tests verifying tool responses match expected format
- Dashboard: component tests for risk feed, health dots, sprint timeline
- E2E: scan a test repo with known state, verify findings appear on dashboard

### 10. Migration & Rollout

1. Build health engine + new tables (schema migration)
2. Update scanner to run health checks
3. Build API routes for health/copies/risks
4. Build dashboard risk feed + health indicators
5. Replace heatmap with sprint timeline
6. Build MCP server package
7. Deploy to Mac Mini, swap MCP config
8. Archive portfolio-dashboard
