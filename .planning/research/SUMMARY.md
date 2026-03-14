# Project Research Summary

**Project:** Mission Control v1.1 — Git Health Intelligence + MCP
**Domain:** Personal operating environment — git health monitoring, multi-host scanning, MCP server, dashboard visualization
**Researched:** 2026-03-14
**Confidence:** HIGH

## Executive Summary

Mission Control v1.1 is a well-scoped additive milestone on a production system: the existing v1.0 codebase is a 3-package monorepo (Hono API + SQLite + React dashboard) running on Mac Mini behind Tailscale. The v1.1 work adds git health intelligence (7 checks per repo), multi-host copy divergence detection, a risk feed on the dashboard, a sprint timeline visualization, and a new MCP server package that replaces the existing Python portfolio-dashboard. The recommended approach is purely additive: extend the scanner, add two new DB tables, create new API routes, add frontend components, and add a new `@mission-control/mcp` package. Zero existing packages are replaced; almost zero new dependencies are needed (only `@modelcontextprotocol/sdk` v1.27.1).

The recommended build order is strict and data-flow-driven: schema migration first, then the health engine, then API routes, then dashboard components, then MCP server. This order is non-negotiable because each phase produces artifacts the next phase consumes. Phases 4 and 5 (dashboard and MCP) are parallelizable after Phase 3 completes, but Phase 4 should be prioritized as the primary validation surface before Phase 5 exposes data to Claude Code.

The highest-risk areas are: (1) the git health engine, which has subtle correctness requirements around `@{u}` failure modes, upsert semantics for `detectedAt` preservation, and child process volume; (2) multi-host divergence detection, which depends on SSH scan freshness and correct remote URL normalization; and (3) the MCP server's stdio transport, which silently breaks if any non-JSON-RPC output reaches stdout. Alert fatigue from over-sensitive thresholds is the most likely adoption killer and must be addressed at design time with higher default thresholds, not tuned after the fact.

## Key Findings

### Recommended Stack

The v1.1 stack adds almost nothing to v1.0. The entire git health engine is pure Node.js standard library (`child_process.execFile`) extending the existing scanner pattern. SQLite schema additions use existing Drizzle ORM. The sprint timeline is custom SVG/CSS (~100 lines), following the same pattern as the existing heatmap — no charting library needed or wanted. The only genuinely new dependency is `@modelcontextprotocol/sdk` v1.27.1 for the MCP server package.

**Core technologies:**
- `@modelcontextprotocol/sdk` v1.27.1: MCP server SDK — official TypeScript SDK, stdio transport for local Claude Code integration
- `node:child_process` execFile: git command spawning — already in use across the codebase, zero new dependency
- Drizzle ORM + better-sqlite3: two new table additions — existing stack, standard migration pattern
- Native `fetch` (Node.js 22 built-in): MCP → API HTTP calls — no axios/undici/got needed
- Custom SVG + React: sprint timeline chart — existing heatmap uses same zero-dependency approach

**Explicitly rejected:**
- `@hono/mcp` — wrong architecture; MCP server must run on MacBook (stdio), not embedded in Mac Mini Hono server
- Recharts / Chart.js / D3.js — one simple horizontal bar chart does not justify 50-230KB of charting library
- `simple-git` — abstraction over what is already 5-line execFile calls; obscures exit code handling needed for health checks
- `ssh2` npm package — `execFile("ssh", [...])` already works; ssh2 adds unnecessary abstraction

### Expected Features

**Must have (table stakes):**
- Unpushed commit detection — every git GUI exposes this; absence makes the health engine feel incomplete
- Remote existence check — critical severity; no remote = zero backup
- Upstream tracking status — broken tracking silently prevents push/pull
- Health score per project (0-100) — single glanceable metric for prioritization
- Risk level classification (healthy/warning/critical/unmonitored) — green/amber/red/gray dot per project
- Dirty working tree age tracking — age-based severity escalation (3 days = warning, 7 days = critical)
- Visual severity indicators on project cards — inline with existing departure board rows
- MCP tool for project risks — replaces portfolio-dashboard with richer, centralized data

**Should have (differentiators):**
- Multi-host copy divergence detection — no mainstream tool does cross-machine comparison; this was the triggering audit finding
- Public repo severity escalation — escalate unpushed findings one tier for public repos
- Risk feed with non-dismissable cards — alerts disappear only when issues resolve; no dismiss-all antipattern
- Sprint timeline replacing heatmap — swimlane visualization fits serial sprint work patterns better than GitHub-style contribution grid
- MCP session startup hook surfacing critical risks — proactive rather than pull-only

**Defer to v2+:**
- Auto-fix actions from dashboard (push, pull, commit) — dashboard is awareness, not action surface
- Git fetch on scan — write operation, adds network load; not needed for common-case detection
- Historical trend graphs for health scores — binary signals don't trend meaningfully
- Webhook/notification on health change — pull-based by design; notification fatigue kills adoption faster than missing features
- Code quality checks (lint, test coverage, type errors) — different domain from sync health; different tooling
- Branch-level health — overengineering for single-user serial sprint workflow

### Architecture Approach

v1.1 extends four surfaces of the existing system without replacing anything. One new package (`@mission-control/mcp`) joins the monorepo. The Git Health Engine is structured as pure functions (`GitScanResult -> HealthFinding[]`) with a separate DB write layer — makes unit testing trivial and keeps concerns separate. Health checks run as a post-scan phase after all repos are scanned (not inline), because copy reconciliation requires data from both hosts. The MCP server is deliberately decoupled from the API package: it imports nothing from `@mission-control/api` or `@mission-control/shared`, communicates only via HTTP, and can be deployed independently on the MacBook.

**Major components:**
1. Git Health Engine (`api/src/services/git-health.ts`) — 7 health checks as pure functions, risk scoring, finding upsert/resolve with `detectedAt` preservation, copy reconciliation
2. Scanner Extension (`api/src/services/project-scanner.ts`) — extended SSH batch (9 commands, still 1 connection), new `GitScanResult` fields, post-scan health phase appended to `scanAllProjects()`
3. Health DB Layer (`api/src/db/queries/health.ts`) — CRUD for `project_health` and `project_copies` tables; upsert semantics that preserve `detectedAt` on conflict
4. Health API Routes (`api/src/routes/health-checks.ts`, `sprint-timeline.ts`) — 6 new endpoints plus modifications to `/api/projects` list/detail responses
5. Risk Feed + Sprint Timeline (`web/src/components/risk-feed/`, `web/src/components/sprint-timeline/`) — severity-grouped non-dismissable cards, custom SVG swimlane chart replacing heatmap
6. MCP Server Package (`packages/mcp/`) — standalone stdio process, 4 tools as thin HTTP wrappers over MC API

**Key patterns to follow:**
- Health engine as pure function + separate side-effect layer (enables testing without DB or SSH)
- Post-scan phase, not inline: run per-repo health checks in parallel after all scans, then copy reconciliation as a serial pass
- Extend `GitScanResult`, don't create a parallel data path (avoids second SSH connection)
- MCP server as API client, not DB client (enforces API-first; every MCP capability also available to dashboard/CLI/iOS)
- New `/api/sprint-timeline` endpoint rather than modifying existing `/api/heatmap` (different query shape, backwards compatibility)

### Critical Pitfalls

1. **Git command process flooding** — 35 repos x 8 commands = ~280 concurrent `execFile` calls causes `EMFILE` errors and git lock contention on Mac Mini. Prevent by: serializing commands within each repo (one `sh -c` invocation), adding `p-limit(10-15)` for cross-repo concurrency, and batching the SSH health commands into the existing single SSH connection.

2. **`@{u}` failures on detached HEAD and new branches** — `git rev-list @{u}..HEAD` returns exit 128 for detached HEAD, new untracked branch, and orphan branch. Without handling, these become false critical alerts that train the user to ignore the risk feed. Run checks in dependency order: detect detached HEAD via `git symbolic-ref --short HEAD` first; distinguish "no upstream configured" (`git config branch.<name>.remote` absent) from "broken tracking" (config exists but ref resolution fails).

3. **`detectedAt` overwritten on upsert, killing dirty age tracking** — SQLite `INSERT OR REPLACE` is DELETE + INSERT, resetting `detectedAt` to now every 5-minute cycle. Dirty age escalation silently never fires. Use Drizzle `onConflictDoUpdate` with `detectedAt` explicitly excluded from the `set` clause. Write a specific regression test: insert a finding with 4-day-old `detectedAt`, run upsert, assert timestamp unchanged.

4. **SSH stale data corrupts divergence detection** — When Mac Mini is briefly unreachable, SSH may succeed with partial data. For v1.1, SSH data feeds health scoring and divergence alerts. Track `lastCheckedAt` per copy; demote divergence findings to `warning` when data is stale (>2 scan cycles); mark copies as `unreachable` on SSH failure rather than falling back to cached data.

5. **MCP stdout pollution breaks stdio protocol** — `console.log()`, Node.js warnings, or library debug output written to stdout corrupt the JSON-RPC stream; Claude Code silently disconnects. Redirect all console methods to stderr at entry point before any imports. Integration-test that stdout contains only valid JSON-RPC output.

## Implications for Roadmap

Based on research, the build order is strictly dependency-driven. Each phase produces data consumed by the next, making cross-phase parallelism impossible until Phase 3 is complete.

### Phase 1: Data Foundation

**Rationale:** Everything else reads from or writes to these tables. No UI, no API routes, no scanner changes — just the data layer. Must come first; upsert semantics cannot be retrofitted after data starts flowing.
**Delivers:** Two new SQLite tables (`project_health`, `project_copies`), Drizzle schema definitions and migration `0005_git_health.sql`, DB query functions (health CRUD, copy CRUD with `detectedAt` preservation), health Zod schemas in shared package
**Addresses:** Prerequisite for all 8 table-stakes features
**Avoids:** Pitfall 4 (`detectedAt` overwrite) — upsert semantics designed here, not retrofitted later

### Phase 2: Git Health Engine

**Rationale:** Produces the data that API routes and the dashboard consume. Can be fully unit-tested with mocked git output — no UI or API needed. SSH batch extension happens here, adding 5 health commands to the existing 4-command batch (still one connection per Mac Mini repo).
**Delivers:** Pure-function health checks for all 7 check types, `GitScanResult` extended with health fields, SSH batch extension, post-scan health phase in `scanAllProjects()`, copy discovery with remote URL normalization, divergence detection, unit tests for all checks and scoring
**Addresses:** Unpushed detection, remote existence, tracking status, dirty age tracking, multi-host divergence, public repo escalation
**Avoids:** Pitfall 1 (process flooding — concurrency limiter + single-script batching), Pitfall 2 (`@{u}` edge cases — dependency-ordered checks), Pitfall 3 (SSH staleness — `lastCheckedAt` tracking), Pitfall 10 (URL normalization — lowercase + strip protocol/credentials/`.git` suffix)

### Phase 3: API Routes

**Rationale:** Straightforward once data layer and health engine exist. Both dashboard and MCP server are consumers — building routes before either consumer avoids mocking and validates the data contract.
**Delivers:** 6 new API endpoints (`/api/health-checks`, `/api/risks`, `/api/copies`, `/api/sprint-timeline`, plus modified `/api/projects`), SSE event extensions (`health:changed`, `copy:diverged`), integration tests
**Addresses:** Health score surfacing, risk feed data, copy status, sprint timeline query aggregation
**Avoids:** Pitfall 8 (Hono RPC type chain — minimize `.route()` calls, verify RPC types after each addition), Pitfall 11 (event bus firehose — single batch `health:changed` per scan cycle, not per-project)

### Phase 4: Dashboard Changes

**Rationale:** Primary validation surface. End-to-end pipeline (scanner → health engine → DB → API → dashboard) is proven here before the MCP server exposes it to Claude Code. Pure frontend work — no backend changes needed.
**Delivers:** Risk feed with severity-grouped non-dismissable cards, sprint timeline component replacing heatmap, health dots on project rows, inline findings panel, dynamic document title with risk count, SSE handler extensions, component tests
**Addresses:** Visual severity indicators, risk feed (differentiator), sprint timeline (differentiator), page title risk count
**Avoids:** Pitfall 6 (alert fatigue — higher default thresholds at 10+ for warning, suppress for currently-focused project), Pitfall 7 (timeline DOM performance — CSS divs not SVG rects, filter top-10 projects by activity, `React.memo`), Pitfall 16 (layout shift — zero-height empty risk feed), Pitfall 17 (segment gap algorithm — 3-day threshold, TypeScript segmentation not SQL)

### Phase 5: MCP Server + Portfolio-Dashboard Deprecation

**Rationale:** Thin HTTP client over stable, tested API routes. Depends on Phase 3 being complete and Phase 4 validating the data. Portfolio-dashboard cannot be deprecated until the replacement is proven in at least one live Claude Code session.
**Delivers:** New `@mission-control/mcp` package with 4 tools (`project_health`, `project_risks`, `project_detail`, `sync_status`), stdio transport, Claude Code MCP config updated, portfolio-dashboard archived, integration tests
**Addresses:** MCP tool for project risks (table stakes), session startup hook (differentiator), ecosystem cleanup
**Avoids:** Pitfall 5 (stdout pollution — redirect console to stderr before any imports, integration test validates stdout), Pitfall 9 (hook name migration — grep all configs for old tool names, run both servers in parallel before cutover), Pitfall 12 (API unreachable — try/catch all fetch, return errors as MCP content not exceptions), Pitfall 15 (standalone build — bundle with tsup, verify execution outside monorepo)

### Phase Ordering Rationale

- Phases 1 → 2 → 3 are strictly sequential: schema before engine before routes; data must flow before it can be consumed
- Phases 4 and 5 are parallelizable after Phase 3, but Phase 4 should be prioritized — it validates correctness before Phase 5 exposes data externally
- The sprint timeline (Phase 4) queries existing commit data with a new aggregation endpoint (Phase 3); it has no Phase 2 dependency
- Portfolio-dashboard deprecation (Phase 5) cannot proceed until the replacement is proven through live use; run both servers in parallel during cutover session

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Git Health Engine):** The `@{u}` edge case matrix (detached HEAD, orphan branch, new branch, gone upstream, shallow clone) needs test-case enumeration before writing the health check logic. The copy divergence algorithm edge cases (force-pushed history, no common ancestor between hosts) also warrant a focused review.
- **Phase 5 (MCP Server):** Verify Zod v3.25.76 compatibility with MCP SDK v1.27 at integration time. Monitor for MCP SDK v2 release during implementation.

Phases with standard patterns (skip additional research):
- **Phase 1 (Data Foundation):** Drizzle SQLite migrations and `onConflictDoUpdate` are well-documented; upsert semantics are resolved in the pitfall analysis.
- **Phase 3 (API Routes):** Hono route handlers follow existing codebase patterns exactly; queries are straightforward aggregations on well-defined tables.
- **Phase 4 (Dashboard):** React components, TanStack Query hooks, and SSE handlers follow established patterns already present in the codebase.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Almost no new dependencies. MCP SDK v1.27.1 verified against npm registry and GitHub releases. Zod v3.25.76 compatibility confirmed. Node.js 22 built-in fetch verified. |
| Features | HIGH | Detailed design spec covers every check, table, API route, and component. Feature boundaries are sharp: no auto-fix, no git fetch on scan, no notification push. |
| Architecture | HIGH | Based on direct codebase examination and design spec. Build order is data-flow-driven. MCP architecture decision (stdio standalone vs embedded Hono middleware) is verified against SDK docs and confirmed correct. |
| Pitfalls | HIGH | 18 specific pitfalls identified with prevention strategies. Critical pitfalls have concrete code-level solutions. Only alert fatigue thresholds require runtime calibration after initial deployment. |

**Overall confidence:** HIGH

### Gaps to Address

- **Alert fatigue threshold calibration:** The spec defines Warning at 1-5 unpushed commits, Critical at 6+. Research recommends Warning at 10+, Critical at 25+, with suppression for the currently-focused project (most commits in last 7 days). Start conservative; add a config option; tune after one week of real data.
- **Copy divergence edge cases:** Shallow clones and force-pushed history can cause `git merge-base --is-ancestor` to return misleading results. Verify commit existence with `git cat-file -t` before ancestry check. Enumerate specific edge cases during Phase 2 planning.
- **MCP SDK v2 timeline:** Research notes v2 is anticipated Q1 2026. Building on v1.27.1 is correct; if v2 ships during implementation, evaluate whether to target v2 or stay on v1.x. SDK maintainers commit to v1.x bug fixes for 6 months post-v2.
- **Sprint timeline gap threshold:** The spec suggests 2-day gap as segment break; research recommends 3 calendar days. Make it configurable via query parameter; validate with real commit data from the 12-week window.

## Sources

### Primary (HIGH confidence)
- Mission Control v1.0 codebase — direct examination of `project-scanner.ts`, `event-bus.ts`, `db/index.ts`, `app.ts`, `use-sse.ts`
- Mission Control v1.1 design spec — `docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md`
- `@modelcontextprotocol/sdk` v1.27.1 — npm registry, GitHub releases, official TypeScript SDK docs, `server.md`
- Drizzle ORM SQLite docs — migration patterns, `onConflictDoUpdate`, upsert semantics
- Hono docs — SSE streaming, route chaining, RPC type inference
- Node.js docs — `child_process.execFile`, file descriptor limits
- SQLite UPSERT documentation — `INSERT OR REPLACE` = DELETE + INSERT behavior confirmed
- PatternFly Status and Severity Patterns — severity icon/color conventions

### Secondary (MEDIUM confidence)
- MCP best practices documentation — single-purpose servers, error handling, transport patterns
- MCP 2026 roadmap blog — SDK v2 timeline, OAuth 2.1 direction
- Existing portfolio-dashboard (`server.py`) — stderr logging pattern reference, tool API being replaced
- 2025 SANS Detection & Response Survey — alert fatigue research, 40%+ false positive threshold triggers dismissal
- Graphite guide: Git divergent branches — divergence detection mechanics and `merge-base` behavior
- `@hono/mcp` v0.2.4 — evaluated and rejected; wrong architecture for MacBook/Mac Mini split

### Tertiary (LOW confidence)
- Timelines-chart by Vasturiano — D3-based swimlane patterns; referenced to confirm custom SVG is simpler for this use case
- Repo Doctor (AI-powered health scoring) — P0/P1/P2 prioritization patterns; limited confidence, reference only

---
*Research completed: 2026-03-14*
*Ready for roadmap: yes*
