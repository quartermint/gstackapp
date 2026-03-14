# Mission Control v1.1 — Git Health Intelligence + MCP

**Date:** 2026-03-14
**Status:** Draft
**Scope:** Git sync health engine, multi-host copy discovery, dashboard risk feed + sprint timeline, MCP server, portfolio-dashboard deprecation

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

Extend the project scanner to perform 8 remote-aware health checks after each scan cycle.

#### Checks

| Check | Command | Severity Logic |
|-------|---------|---------------|
| Unpushed commits | `git rev-list @{u}..HEAD --count` | Warning: 1-5, Critical: 6+ |
| No remote | `git remote -v` returns empty | Critical |
| Broken tracking | `git rev-parse --abbrev-ref @{u}` fails | Critical |
| Remote branch gone | `git status -sb` shows `[gone]` | Critical |
| Unpulled commits | `git rev-list HEAD..@{u} --count` | Warning |
| Dirty working tree | Existing check, add age tracking | Info: fresh, Warning: 3+ days, Critical: 7+ days |
| Stale dirty age | First-seen timestamp of dirty state | Escalates dirty severity over time |
| Diverged copies | Compare HEAD across hosts (see Section 2) | Critical |

Public repos get a severity multiplier — unpushed commits on a public repo are more urgent than on a private one.

#### Risk Scoring

Each project gets:
- `healthScore`: 0-100, computed from worst severity across all checks
- `riskLevel`: `healthy` / `warning` / `critical`

#### Data Model

**`project_health` table (new):**

| Column | Type | Purpose |
|--------|------|---------|
| id | integer PK | Auto-increment |
| projectSlug | text FK | Links to projects |
| checkType | text | One of the 8 check types |
| severity | text | info / warning / critical |
| detail | text | Human-readable description, e.g. "54 unpushed commits" |
| metadata | text (JSON) | Machine-readable data, e.g. `{"count": 54, "public": true}` |
| detectedAt | text | ISO timestamp when first detected |
| resolvedAt | text | ISO timestamp when resolved, null if active |

Indexed on `(projectSlug, checkType, resolvedAt)` for fast "active risks" queries.

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
| lastCheckedAt | text | ISO timestamp |

Indexed on `(projectSlug, host)` unique, and on `remoteUrl` for copy matching.

### 2. Multi-Host Copy Discovery

#### Auto-Discovery

After scanning all repos on both hosts:
1. Collect `origin` remote URL for each repo
2. Normalize URLs: strip `.git` suffix, normalize `git@github.com:` to `github.com/`
3. Group by normalized URL
4. Any slug appearing on multiple hosts → multi-copy project
5. Repos with no remote → flagged but cannot be auto-matched

#### Config Support

`mc.config.json` supports both single-host (existing) and multi-host entries:

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

Explicit config takes precedence over auto-discovery. Auto-discovered copies are surfaced on the dashboard as "discovered" — they don't silently modify config.

#### Divergence Detection

For multi-copy projects, after scanning both copies:
1. Compare HEAD commit hashes
2. If equal: synced
3. If one is ancestor of the other (`git merge-base --is-ancestor`): one copy is behind (Warning)
4. If neither is ancestor: diverged (Critical)

The ancestry check for Mac Mini copies runs via SSH: `ssh ryans-mac-mini 'cd <path> && git merge-base --is-ancestor <hash1> <hash2>'`

### 3. Dashboard Changes

#### Risk Feed

New section at top of dashboard, above the departure board. Appears only when active risks exist. Disappears when clean.

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

**Data source:** Existing `commits` table. No new data collection — different rendering of what's already there.

### 4. MCP Server

New package: `@mission-control/mcp` in the pnpm monorepo.

#### Architecture

Thin MCP server process that calls the Mission Control API (`http://100.123.8.125:3000`) as a client. Does not duplicate scanning logic. Translates API responses into MCP tool results.

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
| `sprint_history` | `project_detail` (includes sprint timeline data) |

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
| GET | `/api/sprint-timeline` | Commit data formatted for swimlane rendering |

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
5. Emit new SSE events: `health:changed`, `copy:diverged`

**Performance:** Remote checks add ~1 `git` command per check per repo. For 35 repos, this adds ~5-10 seconds to the scan cycle. Acceptable for a 5-minute interval. SSH commands to Mac Mini already have a 20s timeout.

### 8. Non-Goals

- No auto-fix actions from the dashboard (MC surfaces problems, you fix them in the terminal)
- No git operations (push, pull, commit) from the API
- No multi-user auth changes
- No changes to capture system, search, or command palette
- No notification push beyond the MCP session hook
- No changes to port monitoring system

### 9. Testing Strategy

- Health engine checks: unit tests with mocked git command output for each of the 8 check types
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
