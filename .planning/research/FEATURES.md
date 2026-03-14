# Feature Landscape: v1.1 Git Health Intelligence + MCP

**Domain:** Git health monitoring, multi-host repository management, risk visualization, developer dashboard intelligence, MCP server
**Researched:** 2026-03-14
**Confidence:** HIGH (well-defined spec, proven ecosystem patterns, existing codebase understood)

## Context

This research covers **only the new v1.1 features** being added to Mission Control. The existing v1.0 features (departure board, capture pipeline, AI search, command palette, sprint heatmap, SSE, health pulse) are already shipped. The v1.1 milestone adds git health intelligence, multi-host copy awareness, dashboard risk visualization, a new sprint timeline visualization, and an MCP server that replaces the existing portfolio-dashboard.

## Table Stakes

Features that users of a git health monitoring system expect. Missing any of these makes the health engine feel incomplete or unreliable.

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|--------------|------------|--------------|-------|
| Unpushed commit detection | Every git GUI (GitKraken, Fork, Tower, SourceTree) shows ahead/behind counts. A health engine that cannot detect unpushed work is fundamentally broken. This is the most common "silent data loss" risk in multi-project workflows. | LOW | Existing scanner, `git rev-list @{u}..HEAD --count` | Relies on `@{u}` (upstream tracking). Fails gracefully if no upstream is set -- that triggers the "broken tracking" check instead. No `git fetch` required; checks last-known remote state. |
| Remote existence check | GitHub Desktop, VS Code Git, and every git client warns when no remote is configured. A repo with no remote means zero backup and zero collaboration capability. For a tool focused on sync health, this is non-negotiable. | LOW | `git remote -v`, existing scanner | Simple empty-check on remote output. Critical severity because a remoteless repo is one disk failure from total loss. |
| Upstream tracking status | `git status -sb` shows tracking info natively. Broken tracking (orphaned branch, deleted upstream) silently prevents push/pull. Tools like GitLens and Fork surface this prominently. | LOW | `git rev-parse --abbrev-ref @{u}`, `git status -sb` | Two distinct checks: broken tracking (upstream ref fails) and remote branch gone (`[gone]` marker). Both are critical because they silently break the push/pull workflow. |
| Health score per project | OpenSSF Scorecard (0-10 per check, weighted aggregate), Checkmarx Repository Health, and GitGuardian all provide per-project health scores. Developers expect a single glanceable metric. Without it, you have a list of findings but no prioritization signal. | MEDIUM | All 7 health checks must produce severity levels that roll up into a composite score | Score = 0-100, derived from worst-case severity across checks. This is simpler than OpenSSF's weighted approach because MC has 7 checks (not 18) and the severity tiers are already defined. `null` for github-only projects. |
| Risk level classification | Every monitoring system (Datadog, PagerDuty, Sentry) uses severity tiers. Healthy/warning/critical is the minimum. Users need to know "is this bad?" at a glance, not interpret raw check output. | LOW | Health score computation | Four levels: healthy, warning, critical, unmonitored. Maps directly to visual indicators (green/amber/red/gray dots). |
| Dirty working tree age tracking | Git status shows dirty files, but not how long they have been dirty. The spec identifies this as a key escalation signal: dirty for 3 days is a warning, dirty for 7 days is critical. No mainstream tool does this natively, but MC already tracks dirty state -- adding age is the natural evolution. | MEDIUM | Existing dirty detection, `detectedAt` timestamp in `project_health` table | Upsert semantics preserve `detectedAt` across scan cycles. Age = `now - detectedAt`. Not a separate check type -- it is the dirty_working_tree check with severity that escalates based on age. |
| Visual severity indicators on project cards | PatternFly, Material Design, and every ops dashboard uses color-coded status indicators. Green/amber/red dots alongside project names is the universal pattern. Without visual indicators, users must navigate to a separate view to understand health. | LOW | Health score + risk level on project list API response | Adds a dot next to the existing dirty-files badge on project rows. Same inline expansion pattern as "Previously On" commits -- click to see details, no new page or modal. |
| MCP tool for project risks | The existing portfolio-dashboard MCP has `find_uncommitted` and `portfolio_status`. The replacement must provide equivalent or better risk visibility. Claude Code sessions calling `project_risks` at startup is the primary consumer. | MEDIUM | API routes for health/risks, MCP TypeScript SDK | Thin client over the MC API. Does not duplicate scanning logic. The `@modelcontextprotocol/sdk` v1.x is the stable choice (v2 anticipated Q1 2026 but v1.x is recommended for production). |

## Differentiators

Features that make MC's health intelligence genuinely novel compared to existing tools. Not expected by users, but high-value when present.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| Multi-host copy divergence detection | No mainstream developer tool automatically detects when the same repo on two machines has diverged. GitKraken, Fork, Tower -- all are single-machine tools. Git-mirror and git-sync exist but are sync tools, not detection tools. MC uniquely scans both MacBook and Mac Mini, compares HEAD commits, and flags divergence. This is the feature that would have caught the 2026-03-14 audit findings automatically. | HIGH | Scanner running on both hosts, `project_copies` table, remote URL normalization, `git merge-base --is-ancestor` for ancestry checks | Auto-discovery via normalized remote URLs. Explicit config takes precedence. Post-scan reconciliation pass compares stored HEAD hashes without additional SSH round-trips. Staleness warning when Mac Mini was unreachable during scan. |
| Public repo severity escalation | No health tool differentiates between unpushed commits on a private vs public repo. MC escalates public repo severity because stale published code is a different risk than stale private code. The 54 unpushed commits on `open-ez` (a public repo) would have been flagged as critical immediately. | LOW | `gh api repos/{owner}/{repo} --jq .private` check, cached in `project_copies.isPublic` | One-time API call per repo, cached. Escalation rule: 1-5 unpushed on public = Critical (not Warning). Simple but genuinely useful differentiation. |
| Risk feed with non-dismissable cards | Most dashboards let you dismiss or snooze alerts. MC deliberately makes risk cards non-dismissable -- they disappear only when the underlying issue is resolved. This prevents the "dismiss all warnings" antipattern that plagues monitoring tools. Combined with duration tracking ("detected 3 days ago"), it creates accountability pressure without notification spam. | MEDIUM | `/api/risks` endpoint, new React component, severity grouping | Cards grouped by severity (critical first), showing project name, problem description, duration, and action hint. Count in page title: `(3) Mission Control`. Disappears completely when all findings are info or resolved. |
| Sprint timeline (swimlane) replacing heatmap | The GitHub-style contribution grid is designed for single-repo OSS contribution patterns. It does not show serial sprint patterns across 12+ projects. The swimlane timeline directly answers: "which project am I focused on right now?" and "how fragmented is my focus?" -- questions the heatmap cannot answer. This is the visualization that fits the user's actual work pattern (serial sprints, one project at a time). | MEDIUM | Existing commits table (no new data collection), new `/api/sprint-timeline` endpoint | Different rendering of existing data. Horizontal bars per project, colored by commit density. X-axis = days (12-week window), Y-axis = projects with activity. Currently-focused project highlighted. Hover shows commit count + date range. Click navigates to project card. |
| MCP server as portfolio-dashboard replacement | The existing portfolio-dashboard is a standalone Python/FastMCP server that directly scans git repos. The MC MCP server is a thin API client that gets richer data (health scores, copy status, risk findings) from the centralized MC API. This is architecturally superior: one scan engine, multiple consumers, richer data. No other personal dev tool exposes MCP with health intelligence. | MEDIUM | MC API routes for health/risks/copies, `@modelcontextprotocol/sdk`, MCP transport (stdio for local Claude Code) | 4 tools: `project_health`, `project_risks`, `project_detail`, `sync_status`. Session startup hook calls `project_risks` and surfaces critical findings in the Claude Code startup banner. Zero noise when healthy. |
| Split health dot for multi-copy divergence | A half-green/half-red dot on a project card visually communicates "this project exists in multiple places and they disagree." No existing tool has this visual vocabulary. It immediately tells you something is wrong across machines without needing to open a detail view. | LOW | Multi-copy detection, custom CSS for split indicator | Small visual touch but highly informative. Same principle as the existing dirty-files badge but for cross-host state. |
| Unpulled commit detection | Complementary to unpushed detection. Shows when the remote has commits you haven't pulled. While less critical than unpushed (unpulled doesn't risk data loss), it indicates your local copy is stale. Most git GUIs show this but personal dashboards don't aggregate it across 35+ repos. | LOW | `git rev-list HEAD..@{u} --count` | Warning severity only. Less urgent than unpushed because unpulled means the remote has the canonical state. |

## Anti-Features

Features that seem logical for a git health system but would undermine MC's philosophy or add complexity without proportional benefit.

| Anti-Feature | Why It Seems Logical | Why Problematic | What to Do Instead |
|--------------|---------------------|-----------------|-------------------|
| Auto-fix actions from dashboard (push, pull, commit) | "You detected the problem, why not fix it?" Every monitoring tool adds remediation buttons eventually. | MC surfaces problems; you fix them in the terminal. Adding git operations to the API creates a dangerous action surface -- an accidental push, a merge conflict during auto-pull, a commit with the wrong message. The spec explicitly lists this as a non-goal. Dashboard is awareness, not action. | Show action hints ("push", "create remote", "pull") as text labels. The user knows what to do; they need the terminal to do it safely. |
| Git fetch on scan | "Unpushed/unpulled counts might be stale without fetching." The counts reflect the state as of the last fetch, which could be hours old. | `git fetch` is a write operation (updates remote refs) and can be slow on flaky connections. Running it every 5 minutes across 35 repos adds network load, can trigger rate limits on GitHub, and occasionally fails (hanging connections). The common case (work that was never pushed) is caught without fetching. | Accept staleness. Checks catch the majority case. A `git fetch` runs naturally when you interact with the repo. A future optional "fetch-on-scan" mode could be added, but default should be read-only. |
| Branch-level health (per-branch checks) | "What if main is clean but a feature branch has issues?" Multi-branch awareness seems more complete. | MC tracks the current branch only, which is the user's actual working state. Scanning all branches multiplies complexity by N branches and adds noise for branches that may be abandoned. The user works on main (stated in CLAUDE.md). Feature branches are rare and short-lived. | Check current branch only. If the user switches branches, the next scan cycle picks up the new state. Branch-level health is overengineering for a single-user tool. |
| Historical trend graphs for health | "Show me health score over time." Trend visualization is a staple of monitoring dashboards (Grafana, Datadog). | MC's health checks are binary: a problem exists or it doesn't. Trending a binary signal adds storage overhead (health history table) and UI complexity for minimal insight. The risk feed already shows duration ("detected 3 days ago") which is the only temporal dimension that matters. | Duration in risk cards covers the temporal need. Resolved findings stay in the database with `resolvedAt` timestamps for future analysis if needed, but don't build the UI for it now. |
| Webhook/notification on health change | "Alert me via Slack/email/push when something goes critical." Push notifications are the natural extension of monitoring. | The spec and v1.0 philosophy explicitly reject notification push. "Notification fatigue kills adoption faster than any missing feature." Dashboard is pull-based by design. The MCP session hook provides the one proactive surface: critical risks appear when you start a Claude Code session. | MCP session startup hook surfaces risks when you start working. Dashboard shows risks when you check it. SSE event `health:changed` updates the dashboard in real-time if it's open. No external push. |
| Code quality health checks (lint, test coverage, type errors) | OpenSSF Scorecard includes code quality checks. "A health engine should check code health too." | Code quality is a different domain from sync health. MC's health engine is specifically about remote sync status and multi-host consistency. Adding code quality checks would require running lint/test/typecheck across 35 repos every 5 minutes -- a massive computational cost. Different tools solve different problems. | Stay focused on sync health. Code quality is handled by CI/CD, pre-commit hooks, and IDE tooling. MC surfaces what those tools can't: cross-repo, cross-host sync state. |
| Dependency vulnerability scanning | "While checking repo health, scan for vulnerable dependencies." Security scanning is increasingly expected in DevOps dashboards. | Dependency scanning is a heavy operation (npm audit, pip audit) that requires network access, can be slow, and produces results that change based on advisory database updates, not local state. It's a different problem space. GitHub Dependabot already does this well. | Out of scope. MC's health engine is about git sync state, not dependency state. Link to GitHub's security tab if needed. |
| Multi-copy auto-sync | "If you detect divergence, why not auto-merge?" The natural extension of divergence detection. | Auto-merging across hosts without user review is dangerous. Merge conflicts, force-pushes, and unintended changes are all possible. The user needs to decide which copy is canonical and how to resolve. | Detect and flag divergence. Show which copy is ahead, which is behind, whether they've truly diverged (neither is ancestor of the other). Let the user resolve in the terminal. |

## Feature Dependencies

```
[Existing Scanner (project-scanner.ts)]
    |
    +--extends--> [Git Health Engine (7 checks)]
    |                 |
    |                 +--requires--> [project_health table (schema migration)]
    |                 +--requires--> [Risk scoring computation]
    |                 +--enables--> [Health findings API routes]
    |                 +--enables--> [SSE events: health:changed]
    |
    +--extends--> [Multi-Host Copy Discovery]
    |                 |
    |                 +--requires--> [project_copies table (schema migration)]
    |                 +--requires--> [Remote URL normalization]
    |                 +--requires--> [Config schema extension (multiCopyEntrySchema)]
    |                 +--enables--> [Divergence detection (post-scan reconciliation)]
    |                 +--enables--> [Copy API routes]
    |                 +--enables--> [SSE events: copy:diverged]
    |
    +--enables--> [Dashboard Risk Feed]
    |                 +--requires--> [Health findings API (/api/risks)]
    |                 +--requires--> [Risk level on project list response]
    |
    +--enables--> [Project Card Health Indicators]
    |                 +--requires--> [healthScore + riskLevel on /api/projects response]
    |                 +--requires--> [Health findings on /api/projects/:slug response]
    |
    +--enables--> [Sprint Timeline]
    |                 +--requires--> [/api/sprint-timeline endpoint]
    |                 +--uses--> [Existing commits table (no new data)]
    |                 +--replaces--> [Sprint Heatmap component]
    |
    +--enables--> [MCP Server (@mission-control/mcp)]
                      +--requires--> [All health/risk/copy API routes stable]
                      +--requires--> [@modelcontextprotocol/sdk]
                      +--replaces--> [portfolio-dashboard MCP]
```

### Critical Path

1. **Schema migration** (project_health + project_copies tables) must come first -- everything writes to or reads from these.
2. **Scanner extension** (health checks + copy discovery) depends on the schema.
3. **API routes** (health-checks, copies, risks, sprint-timeline) depend on scanner writing data.
4. **Dashboard components** (risk feed, health dots, sprint timeline) depend on API routes.
5. **MCP server** depends on API routes being stable and tested.
6. **Portfolio-dashboard deprecation** depends on MCP server being functional.

### Parallel Opportunities

- Sprint timeline (API + component) is independent of health engine -- can be built in parallel.
- MCP server development can start once API contracts are defined (before routes are fully implemented) by mocking responses.
- Dashboard risk feed and health indicators can be built in parallel once the API shape is known.

## MVP Recommendation for v1.1

### Must Ship (Core Value)

These features collectively answer "is my code safe across all machines?" -- the problem that triggered this milestone.

1. **Git Health Engine with all 7 checks** -- This is the entire point. Partial checks (e.g., skipping divergence detection) would leave the same gaps that caused the 2026-03-14 audit findings.
2. **Multi-host copy discovery** -- Without this, the health engine only knows about one machine. The divergence between MacBook and Mac Mini copies was a key finding.
3. **Health indicators on project cards** -- The departure board is the primary UI. Health must be visible there, not in a separate view.
4. **Risk feed** -- Aggregated view of all problems, severity-sorted. This is the "smarter in 3 seconds" delivery mechanism for health intelligence.
5. **MCP server with `project_risks` tool** -- Claude Code startup hook calling `project_risks` is the proactive surface that catches problems when you start working.

### Should Ship (High Value, Moderate Effort)

6. **Sprint timeline replacing heatmap** -- The heatmap is acknowledged as not fitting the serial sprint pattern. The timeline is a better visualization but is not blocking health intelligence.
7. **Portfolio-dashboard deprecation** -- Clean up the ecosystem by removing the redundant MCP server. Depends on MC MCP being stable.
8. **Public repo severity escalation** -- Simple rule with high signal value. Low effort once `isPublic` flag is cached.

### Defer If Needed (Lower Priority)

9. **Split health dot for multi-copy divergence** -- Nice visual touch but standard red dot already communicates "problem." Splitting the dot is polish.
10. **Page title risk count** -- `(3) Mission Control` in the browser tab. Useful but not critical for the core value proposition.

## Complexity Assessment

| Feature | Estimated Complexity | Rationale |
|---------|---------------------|-----------|
| Schema migration (2 new tables) | LOW | Standard Drizzle migration. Tables are well-defined in the spec. |
| Health engine (7 git checks) | MEDIUM | 5 simple git commands + 2 complex checks (dirty age, divergence). Each check needs error handling for missing refs, SSH failures, etc. |
| Remote URL normalization | LOW | String manipulation: strip `.git`, normalize `git@github.com:` to `github.com/`. Well-defined algorithm. |
| Copy auto-discovery | MEDIUM | Requires scanning both hosts, collecting remotes, grouping by normalized URL. Post-scan reconciliation logic. |
| Divergence detection | MEDIUM | `git merge-base --is-ancestor` works when repos share history via same remote. Edge cases: shallow clones, force-pushed history, repos with no common ancestor. |
| Risk scoring | LOW | Worst-case severity across checks. Simple reduce over findings. |
| Health API routes (6 new routes) | MEDIUM | Standard Hono route handlers. Filterable queries, severity grouping, project joins. |
| Risk feed component | MEDIUM | New React component with severity-grouped cards. Conditional rendering (disappears when clean). Page title manipulation. |
| Health dot on project cards | LOW | Small addition to existing `ProjectRow` component. CSS for green/amber/red/split dots. |
| Sprint timeline API | LOW | Aggregation query over existing commits table. Group by project, bucket by day, compute density. |
| Sprint timeline component | MEDIUM | Horizontal bar chart. Either custom SVG/CSS or a lightweight library. Hover interactions, click navigation. No external dependency needed for the simple bar rendering described in the spec. |
| MCP server package | MEDIUM | New package in monorepo. `@modelcontextprotocol/sdk` with stdio transport. 4 tools as API client wrappers. Integration tests. |
| Config schema extension | LOW | Zod discriminated union for single-host vs multi-copy entries. Backward compatible. |
| SSE event extension | LOW | Add 2 event types to `MCEventType` union. Emit from scanner. Frontend `useSSE` hook already handles new event types. |
| Portfolio-dashboard deprecation | LOW | Update Claude Code MCP config. Archive repo. No code changes to MC itself. |

## Competitor/Prior Art Analysis

| Capability | OpenSSF Scorecard | GitGuardian | GitKraken | Fork | Tower | MC v1.1 |
|-----------|-------------------|-------------|-----------|------|-------|---------|
| Health score | 0-10 per check + aggregate | Per-repo score | N/A | N/A | N/A | 0-100 per project |
| Unpushed detection | N/A (security focus) | N/A | Yes (single repo) | Yes (single repo) | Yes (single repo) | Yes, all repos, severity tiers |
| Multi-host awareness | N/A | N/A | N/A | N/A | N/A | Yes (MacBook + Mac Mini) |
| Divergence detection | N/A | N/A | Per-branch | Per-branch | Per-branch | Cross-host, same branch |
| Risk feed | N/A | Alert dashboard | N/A | N/A | N/A | Severity-grouped cards |
| MCP integration | N/A | N/A | N/A | N/A | N/A | 4 tools, session startup hook |
| Public repo differentiation | N/A | N/A | N/A | N/A | N/A | Severity escalation |
| Multi-repo aggregate | Badge per repo | Portfolio view | N/A | N/A | N/A | 35+ repos, single dashboard |

**Key Insight:** No existing tool combines multi-repo health monitoring, multi-host divergence detection, and MCP integration. Individual pieces exist (git GUIs show ahead/behind, OpenSSF scores repos) but the aggregation across 35+ repos on multiple machines with AI-assisted surfacing via MCP is genuinely novel.

## Sources

- [OpenSSF Scorecard](https://github.com/ossf/scorecard) -- Security health metrics, 0-10 scoring methodology, 18 automated checks (HIGH confidence)
- [Checkmarx Repository Health](https://checkmarx.com/product/repository-health/) -- Continuous health scoring for repositories (MEDIUM confidence)
- [PatternFly Status and Severity Patterns](https://www.patternfly.org/patterns/status-and-severity/) -- Icon + color + text severity patterns, aggregate status cards (HIGH confidence)
- [PatternFly Dashboard Patterns](https://www.patternfly.org/patterns/dashboard/design-guidelines/) -- Card layouts, event cards, severity icon groups (HIGH confidence)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- Official SDK, v1.x stable, v2 anticipated Q1 2026 (HIGH confidence)
- [MCP Best Practices](https://modelcontextprotocol.info/docs/best-practices/) -- Single-purpose servers, error handling, transport patterns (MEDIUM confidence)
- [MCP 2026 Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) -- OAuth 2.1, horizontal scaling, v2 timeline (MEDIUM confidence)
- [Timelines-chart by Vasturiano](https://github.com/vasturiano/timelines-chart) -- D3-based swimlane visualization, no official React wrapper (HIGH confidence)
- [SVAR React Gantt Chart Comparison](https://svar.dev/blog/top-react-gantt-charts/) -- Gantt/timeline library landscape for React (MEDIUM confidence)
- [Git Divergent Branches Guide](https://graphite.com/guides/git-divergent-branches) -- Divergence detection mechanics (HIGH confidence)
- [Repo Doctor](https://dev.to/glaucia86/repo-doctor-ai-powered-github-repository-health-analyzer-136n) -- AI-powered health scoring, P0/P1/P2 prioritization (LOW confidence)
- [Existing portfolio-dashboard MCP](file:///Users/ryanstern/portfolio-dashboard/src/portfolio_dashboard/server.py) -- 5 tools being replaced (HIGH confidence, direct codebase)
- [Existing MC scanner](file:///Users/ryanstern/mission-control/packages/api/src/services/project-scanner.ts) -- Current scan capabilities, extension points (HIGH confidence, direct codebase)

---
*Feature research for: Mission Control v1.1 Git Health Intelligence + MCP*
*Researched: 2026-03-14*
