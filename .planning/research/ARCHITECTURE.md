# Architecture Patterns — v1.1 Git Health Intelligence + MCP

**Domain:** Extending API-first personal operating environment with git health engine, multi-host scanning, MCP server, and dashboard redesign
**Researched:** 2026-03-14
**Baseline:** v1.0 architecture (Hono API + SQLite + React dashboard, 3-package monorepo)

## Architecture Overview: What Changes

v1.1 adds four architectural surfaces to the existing system. No existing components are replaced — they are extended. One new package (`@mission-control/mcp`) joins the monorepo.

```
                                   EXISTING                    NEW/MODIFIED
                              +-----------------+
                              |   Tailscale VPN  |
                              +--------+--------+
                                       |
          +----------------------------+----------------------------+
          |                            |                            |
  +-------+-------+          +--------+--------+          +---------+--------+
  | Web Dashboard  |          | CLI / iOS       |          | MCP Server (NEW) |
  | (React SPA)    |          | (future)        |          | @mc/mcp package  |
  +-------+-------+          +-----------------+          +---------+--------+
          |                                                         |
          |    NEW: Risk feed, sprint timeline,                     |
          |         health dots on project rows                     |
          |                                                         |
          +------------------+-----------------------+--------------+
                             |                       |
                +------------v-----------+           |
                |    Hono API Server      |           |
                |    (Node.js)            |<----------+
                +-----+------+------+----+    (HTTP calls to API)
                      |      |      |
           +----------+   +--+--+   +----------+
           |              |     |              |
  +--------v--------+  +-v-----v-+  +---------v----------+
  | Project Scanner  |  | SQLite  |  | Git Health Engine   |
  | (MODIFIED)       |  | + FTS5  |  | (NEW service)       |
  | + remote checks  |  | + NEW:  |  | 7 checks per repo   |
  | + copy discovery |  | health  |  | risk scoring         |
  +--------+---------+  | tables  |  | copy reconciliation  |
           |            +---------+  +---------------------+
           |
  +--------v---------+
  | SSH Scanner       |
  | (EXISTING)        |
  | + NEW: health     |
  |   commands in     |
  |   SSH batch       |
  +---------+---------+
```

## Component Inventory: New vs Modified

### New Components

| Component | Package | File(s) | Purpose |
|-----------|---------|---------|---------|
| Git Health Engine | `api` | `src/services/git-health.ts` | 7 health checks, risk scoring, finding upsert/resolve logic |
| Health DB queries | `api` | `src/db/queries/health.ts` | CRUD for `project_health` and `project_copies` tables |
| Health API routes | `api` | `src/routes/health-checks.ts` | `/api/health-checks`, `/api/risks`, `/api/copies` endpoints |
| Sprint Timeline route | `api` | `src/routes/sprint-timeline.ts` | `/api/sprint-timeline` endpoint (new query on existing `commits` table) |
| DB migration 0005 | `api` | `drizzle/0005_git_health.sql` | `project_health` and `project_copies` tables |
| Drizzle schema additions | `api` | `src/db/schema.ts` | New table definitions for `projectHealth` and `projectCopies` |
| Health Zod schemas | `shared` | `src/schemas/health.ts` | Response schemas for health checks, risks, copies, sprint timeline |
| Health types | `shared` | `src/types/index.ts` | Exported TypeScript types for new schemas |
| Risk Feed component | `web` | `src/components/risk-feed/risk-feed.tsx` | Severity-grouped risk cards at top of dashboard |
| Risk Feed card | `web` | `src/components/risk-feed/risk-card.tsx` | Individual risk card (severity icon, project, description, duration) |
| Sprint Timeline component | `web` | `src/components/sprint-timeline/sprint-timeline.tsx` | Horizontal swimlane chart replacing heatmap |
| Sprint Timeline bar | `web` | `src/components/sprint-timeline/timeline-bar.tsx` | Per-project horizontal bar with density segments |
| Health dot component | `web` | `src/components/ui/health-dot.tsx` | Green/amber/red/split dot for project rows |
| Health findings panel | `web` | `src/components/departure-board/health-findings.tsx` | Inline expandable findings (like PreviouslyOn pattern) |
| `useHealthChecks` hook | `web` | `src/hooks/use-health-checks.ts` | Fetch `/api/risks` for risk feed |
| `useSprintTimeline` hook | `web` | `src/hooks/use-sprint-timeline.ts` | Fetch `/api/sprint-timeline` for swimlane chart |
| MCP Server package | `mcp` | `packages/mcp/` (new package) | Thin MCP server calling MC API via HTTP |
| MCP tool handlers | `mcp` | `src/tools/` | `project_health`, `project_risks`, `project_detail`, `sync_status` |

### Modified Components

| Component | File | Change | Impact |
|-----------|------|--------|--------|
| Event bus types | `api/src/services/event-bus.ts` | Add `"health:changed"` and `"copy:diverged"` to `MCEventType` union | Low — additive union extension |
| Project scanner | `api/src/services/project-scanner.ts` | After scan loop, call health engine + copy reconciliation | Medium — extends `scanAllProjects()` with post-scan phase |
| SSH batch script | `api/src/services/project-scanner.ts` | Add git remote/upstream/tracking commands to SSH batch | Medium — extends `scanRemoteProject()` command list |
| Config schema | `api/src/lib/config.ts` | Add `multiCopyEntrySchema` union variant to config parser | Low — backwards-compatible union |
| Config type | `shared` or `api` | `MCConfig` gains optional multi-copy format | Low — existing format unchanged |
| Project routes | `api/src/routes/projects.ts` | Add `healthScore`, `riskLevel`, `copyCount` to list/detail responses | Medium — extends response shape |
| Project list query | `api/src/db/queries/projects.ts` | Join or subquery for health aggregation in list endpoint | Medium — query becomes a join |
| App route registration | `api/src/app.ts` | Add `.route("/api", createHealthCheckRoutes(...))` and `.route("/api", createSprintTimelineRoutes(...))` | Low — additive route chain |
| SSE hook | `web/src/hooks/use-sse.ts` | Add `onHealthChanged` and `onCopyDiverged` event listeners | Low — additive handlers |
| App.tsx layout | `web/src/App.tsx` | Replace `<SprintHeatmap>` with `<SprintTimeline>`, add `<RiskFeed>` above it | Medium — layout reorder |
| Project row | `web/src/components/departure-board/project-row.tsx` | Add `<HealthDot>` component next to `<DirtyIndicator>` | Low — additive UI element |
| Project schema | `shared/src/schemas/project.ts` | Add optional `healthScore`, `riskLevel`, `copyCount` fields | Low — additive, nullable |
| Shared exports | `shared/src/index.ts` | Export new health schemas and types | Low — additive |
| Document title | `web/src/App.tsx` or layout | Dynamic `(N) Mission Control` title when risks exist | Low — `useEffect` with `document.title` |

### Deprecated (Not Removed in v1.1)

| Component | File | Status |
|-----------|------|--------|
| Heatmap route | `api/src/routes/heatmap.ts` | Keep route alive, mark deprecated in code comment |
| Heatmap components | `web/src/components/heatmap/*` | Keep files, remove from App.tsx import |
| `useHeatmap` hook | `web/src/hooks/use-heatmap.ts` | Keep file, remove usage from App.tsx |

## Data Model Changes

### New Tables

**`project_health` table:**

```sql
CREATE TABLE project_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL REFERENCES projects(slug),
  check_type TEXT NOT NULL,  -- 'unpushed' | 'no_remote' | 'broken_tracking' | 'remote_gone' | 'unpulled' | 'dirty_working_tree' | 'diverged_copies'
  severity TEXT NOT NULL,     -- 'info' | 'warning' | 'critical'
  detail TEXT NOT NULL,       -- "54 unpushed commits"
  metadata TEXT,              -- JSON: {"count": 54, "public": true}
  detected_at TEXT NOT NULL,  -- ISO timestamp, preserved on upsert
  resolved_at TEXT            -- ISO timestamp, null if active
);

CREATE INDEX idx_health_active ON project_health(project_slug, check_type, resolved_at);
```

**`project_copies` table:**

```sql
CREATE TABLE project_copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL REFERENCES projects(slug),
  host TEXT NOT NULL,          -- 'local' | 'mac-mini'
  path TEXT NOT NULL,
  remote_url TEXT,             -- Normalized origin URL
  head_commit TEXT,            -- Current HEAD hash
  branch TEXT,
  is_public INTEGER,          -- 1/0/null
  last_checked_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_copies_slug_host ON project_copies(project_slug, host);
CREATE INDEX idx_copies_remote_url ON project_copies(remote_url);
```

### Modified Response Shapes

**`GET /api/projects` response — each project gains:**
```typescript
{
  // ...existing fields...
  healthScore: number | null,    // 0-100, null for github-only
  riskLevel: 'healthy' | 'warning' | 'critical' | 'unmonitored',
  copyCount: number,             // 0 = single copy, 1+ = multi-copy
}
```

**`GET /api/projects/:slug` response — gains:**
```typescript
{
  // ...existing fields...
  healthScore: number | null,
  riskLevel: string,
  healthFindings: HealthFinding[],  // Active findings for this project
  copies: CopyInfo[],               // All known copies with sync status
}
```

## Data Flow Changes

### Extended Scan Cycle

The existing 5-minute scan cycle (`scanAllProjects`) gains two post-scan phases:

```
[Existing] For each project in config:
  |
  v
scanProject() / scanRemoteProject() / scanGithubProject()
  |-- git rev-parse --abbrev-ref HEAD
  |-- git status --porcelain
  |-- git log -50 --format=...
  |
  v
Upsert project record + cache scan data + persist commits
  |
  v
[NEW Phase 1: Health Checks]  <-- runs per-repo, in parallel
  |
  For each repo with local or mac-mini host:
  |-- git remote -v                          (no_remote check)
  |-- git rev-parse --abbrev-ref @{u}        (broken_tracking check)
  |-- git rev-list @{u}..HEAD --count        (unpushed check)
  |-- git rev-list HEAD..@{u} --count        (unpulled check)
  |-- git status -sb | grep '\[gone\]'       (remote_gone check)
  |-- (dirty check: reuse existing status data + age from detectedAt)
  |
  |-- Upsert findings to project_health (preserve detectedAt)
  |-- Auto-resolve findings that no longer apply
  |-- Compute healthScore + riskLevel per project
  |
  v
[NEW Phase 2: Copy Reconciliation]  <-- runs once after all repos scanned
  |
  For each project in project_copies:
  |-- Collect HEAD commits from both hosts (already in project_copies)
  |-- Compare: equal = synced, ancestor = behind, neither = diverged
  |-- If diverged or behind: upsert 'diverged_copies' finding
  |-- If synced: resolve any active 'diverged_copies' finding
  |
  v
[Existing] Emit SSE event
  |-- scan:complete (existing)
  |-- health:changed (NEW — emitted if any findings changed)
  |-- copy:diverged (NEW — emitted if divergence detected)
```

### SSH Batch Extension

The existing SSH batch command (`scanRemoteProject`) bundles all git commands into a single SSH connection. The health check commands are added to this same batch — no additional SSH round-trips.

**Current SSH batch (4 commands):**
```bash
cd "$path" && echo "===BRANCH===" && git rev-parse --abbrev-ref HEAD && echo "===STATUS===" && git status --porcelain && echo "===LOG===" && git log -50 --format='%h|%s|%ar|%aI' && echo "===GSD===" && cat .planning/STATE.md
```

**Extended SSH batch (9 commands, still 1 connection):**
```bash
cd "$path" && echo "===BRANCH===" && git rev-parse --abbrev-ref HEAD && echo "===STATUS===" && git status --porcelain && echo "===LOG===" && git log -50 --format='%h|%s|%ar|%aI' && echo "===GSD===" && cat .planning/STATE.md && echo "===REMOTE===" && git remote -v && echo "===UPSTREAM===" && git rev-parse --abbrev-ref @{u} && echo "===UNPUSHED===" && git rev-list @{u}..HEAD --count && echo "===UNPULLED===" && git rev-list HEAD..@{u} --count && echo "===STATUSBRANCH===" && git status -sb --no-ahead-behind
```

Return type extends from `GitScanResult` to include health-relevant raw data:

```typescript
export interface GitScanResult {
  // Existing fields
  branch: string;
  dirty: boolean;
  dirtyFiles: string[];
  commits: GitCommit[];
  gsdState: GsdState | null;
  // NEW fields for health engine
  remotes: string[];           // raw git remote -v output lines
  upstream: string | null;     // @{u} result or null if no tracking
  unpushedCount: number;       // rev-list count
  unpulledCount: number;       // rev-list count
  headCommit: string;          // full HEAD hash for copy comparison
  statusBranch: string;        // git status -sb output (for [gone] detection)
}
```

### MCP Server Data Flow

```
Claude Code session (MacBook)
    |
    v
@mission-control/mcp (stdio transport, runs on MacBook)
    |
    v
HTTP fetch to MC API (http://100.x.x.x:3000)
    |-- project_health  -> GET /api/health-checks
    |-- project_risks   -> GET /api/risks
    |-- project_detail  -> GET /api/projects/:slug
    |-- sync_status     -> GET /api/copies
    |
    v
Return structured JSON as MCP tool result
```

The MCP server is a thin translation layer. It does not touch the database, does not run git commands, does not scan repos. It calls the API and formats responses for MCP tool results.

### Dashboard SSE Flow Extension

```
Browser (React)
    |
    v
EventSource /api/events
    |
    |-- [existing] scan:complete     -> refetchProjects() + refetchHeatmap()
    |-- [NEW]      health:changed    -> refetchRisks() + refetchProjects()
    |-- [NEW]      copy:diverged     -> refetchRisks() + refetchProjects()
    |-- [existing] capture:created   -> handleCapturesChanged()
    |-- [existing] capture:enriched  -> handleCapturesChanged()
    |-- [existing] capture:archived  -> handleCapturesChanged()
```

## Component Boundaries (Detailed)

### Git Health Engine (`src/services/git-health.ts`)

**Responsibilities:**
- Run 7 health checks given a `GitScanResult` and project metadata
- Compute severity per check (with public repo escalation)
- Compute aggregate `healthScore` (0-100) and `riskLevel` per project
- Upsert findings into `project_health` (preserve `detectedAt`, update detail/severity)
- Auto-resolve findings when checks pass
- Emit SSE events on finding state changes

**Does NOT:**
- Run git commands (receives `GitScanResult` from scanner)
- Touch the scan cache
- Know about the HTTP layer

**Interface:**
```typescript
export interface HealthCheckContext {
  slug: string;
  scanResult: GitScanResult;
  isPublic: boolean | null;
  host: 'local' | 'mac-mini';
}

export interface HealthFinding {
  checkType: CheckType;
  severity: 'info' | 'warning' | 'critical';
  detail: string;
  metadata: Record<string, unknown>;
}

export function runHealthChecks(ctx: HealthCheckContext): HealthFinding[];
export function computeHealthScore(findings: HealthFinding[]): { score: number | null; level: RiskLevel };
export function reconcileCopies(db: DrizzleDb, slug: string): HealthFinding | null;
export function upsertFindings(db: DrizzleDb, slug: string, findings: HealthFinding[]): void;
```

### Copy Discovery (`src/services/git-health.ts` or separate `src/services/copy-discovery.ts`)

**Responsibilities:**
- Normalize remote URLs (strip `.git`, normalize `git@github.com:` -> `github.com/`)
- Match copies across hosts by normalized remote URL
- Update `project_copies` table with current HEAD, branch, remote URL
- Detect divergence via HEAD comparison (ancestry check on local repo)

**Interface:**
```typescript
export function normalizeRemoteUrl(rawUrl: string): string;
export function updateCopyRecord(db: DrizzleDb, copy: CopyUpdate): void;
export function detectDivergence(localHead: string, remoteHead: string, repoPath: string): Promise<'synced' | 'behind' | 'ahead' | 'diverged'>;
```

### MCP Server Package (`packages/mcp/`)

**Structure:**
```
packages/mcp/
  package.json          # @mission-control/mcp, dep on @modelcontextprotocol/sdk + zod
  tsconfig.json
  src/
    index.ts            # McpServer creation + stdio transport + tool registration
    api-client.ts       # fetch wrapper for MC API (base URL from env)
    tools/
      project-health.ts # project_health tool handler
      project-risks.ts  # project_risks tool handler
      project-detail.ts # project_detail tool handler
      sync-status.ts    # sync_status tool handler
```

**Key design decisions:**
- Standalone process (stdio transport) — required by MCP protocol for Claude Code
- No dependency on `@mission-control/api` — calls API via HTTP, not internal imports
- No dependency on `@mission-control/shared` — defines its own response types (avoids coupling to dashboard types)
- Configuration via `MC_API_URL` env var (defaults to Mac Mini Tailscale IP)
- Minimal dependencies: `@modelcontextprotocol/sdk`, `zod`, standard `fetch`

**NOT in the monorepo dependency graph for build** — it imports nothing from other packages. It shares the monorepo for co-location and `pnpm` workspace convenience, not for type sharing.

### Config Schema Extension

```typescript
// Existing (unchanged)
const projectEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  path: z.string(),
  host: z.enum(["local", "mac-mini", "github"]),
  tagline: z.string().optional(),
  repo: z.string().optional(),
});

// NEW — multi-copy variant
const multiCopyEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().optional(),
  repo: z.string().optional(),
  copies: z.array(z.object({
    host: z.enum(["local", "mac-mini"]),
    path: z.string(),
  })).min(1),
});

// Config accepts either format
const projectConfigEntry = z.union([projectEntrySchema, multiCopyEntrySchema]);
```

The scanner normalizes both formats into a flat `(slug, host, path)` tuple list before iterating. Existing configs work without modification.

## Patterns to Follow

### Pattern 1: Health Engine as Pure Function + Side-Effect Layer

**What:** The core health check logic is a pure function: `GitScanResult -> HealthFinding[]`. Database operations (upsert, resolve) are a separate layer.

**Why:** Makes unit testing trivial — mock git command output, assert findings. The scanner calls `runHealthChecks()` then `upsertFindings()` separately.

**Example:**
```typescript
// Pure logic — easy to test
export function runHealthChecks(ctx: HealthCheckContext): HealthFinding[] {
  const findings: HealthFinding[] = [];

  if (ctx.scanResult.remotes.length === 0) {
    findings.push({
      checkType: 'no_remote',
      severity: 'critical',
      detail: 'No remote configured',
      metadata: {},
    });
  }

  const unpushed = ctx.scanResult.unpushedCount;
  if (unpushed > 0) {
    const publicEscalation = ctx.isPublic && unpushed <= 5;
    findings.push({
      checkType: 'unpushed',
      severity: unpushed >= 6 || publicEscalation ? 'critical' : 'warning',
      detail: `${unpushed} unpushed commit${unpushed > 1 ? 's' : ''}`,
      metadata: { count: unpushed, public: ctx.isPublic },
    });
  }

  return findings;
}

// Side-effect layer — calls pure function, then writes DB
export async function processHealthForProject(
  db: DrizzleDb,
  ctx: HealthCheckContext
): Promise<void> {
  const findings = runHealthChecks(ctx);
  upsertFindings(db, ctx.slug, findings);
  // Resolve any check types not in current findings
  resolveAbsentFindings(db, ctx.slug, findings.map(f => f.checkType));
}
```

### Pattern 2: Post-Scan Phase (Not Inline)

**What:** Health checks run as a post-scan phase after all repos are scanned, not inline during each repo scan.

**Why:** Copy reconciliation requires data from ALL repos (both hosts) to detect divergence. Running it per-repo would miss cross-host comparisons. Running health checks as a post-scan phase also keeps the existing scan loop clean — it collects raw data, the health engine interprets it.

**Implementation:**
```typescript
// In scanAllProjects():
// ... existing scan loop ...

// Phase 2: Health checks (runs after all scans complete)
if (sqlite) {
  await processHealthChecks(db, sqlite, config, scanResults);
  await reconcileAllCopies(db, sqlite);
}

// Phase 3: Emit events
eventBus.emit("mc:event", { type: "scan:complete", id: "all" });
if (healthChanged) {
  eventBus.emit("mc:event", { type: "health:changed", id: "all" });
}
```

**Correction to spec note:** The spec says health checks run "in parallel per repo." This is correct for the per-repo checks (unpushed, no_remote, etc.), but the copy reconciliation step must run after ALL repos are scanned. The implementation should be: (1) scan all repos in parallel (existing), (2) run per-repo health checks in parallel, (3) run copy reconciliation as a single serial pass.

### Pattern 3: Extend GitScanResult, Don't Create Parallel Data Path

**What:** Add health-relevant fields to the existing `GitScanResult` interface. Don't create a separate `HealthScanResult` with its own scan function.

**Why:** The existing scanner already SSHes into Mac Mini, already runs git commands in batch. Adding 5 more git commands to the same SSH batch is the right approach — it avoids a second SSH connection and keeps the scan data cohesive.

### Pattern 4: MCP Server as API Client, Not DB Client

**What:** The MCP server package calls the MC API via HTTP. It does not import database modules or run git commands.

**Why:** Enforces the API-first architecture. If the MCP server needs data, the API must expose it. This means every MCP capability is also available to the dashboard, CLI, and iOS app. It also means the MCP server can run on any machine — it just needs network access to the API.

### Pattern 5: Sprint Timeline Query as New Endpoint, Not Heatmap Modification

**What:** Create a new `/api/sprint-timeline` endpoint that returns data grouped by project with continuous segments. Don't modify the existing `/api/heatmap` endpoint.

**Why:** The heatmap returns per-day cells. The sprint timeline needs per-project segments (start date, end date, commit count, density). These are fundamentally different queries and response shapes. Modifying the heatmap endpoint would break any future consumer. The heatmap route stays alive (deprecated) for backwards compatibility.

**Query approach:**
```sql
-- Sprint timeline: find continuous activity segments per project
-- A "segment" is a run of days with commits, allowing 1-2 day gaps
SELECT
  project_slug,
  MIN(date(author_date)) as start_date,
  MAX(date(author_date)) as end_date,
  COUNT(*) as commits
FROM commits
WHERE author_date >= ?  -- 12 weeks ago
GROUP BY project_slug,
  -- Segment grouping: assigns same group ID to commits within 2-day gaps
  (julianday(date(author_date)) - (
    SELECT COUNT(DISTINCT date(c2.author_date))
    FROM commits c2
    WHERE c2.project_slug = commits.project_slug
      AND date(c2.author_date) <= date(commits.author_date)
      AND c2.author_date >= ?
  ))
ORDER BY project_slug, start_date;
```

Alternatively, do the segmentation in TypeScript (simpler, more readable):

```typescript
function buildSegments(rows: {date: string, count: number}[], maxGapDays = 2): Segment[] {
  // Sort by date, merge adjacent days within gap threshold
}
```

Use TypeScript segmentation because the SQL approach for gap detection is fragile and harder to maintain. The per-day data from the existing heatmap query is sufficient input.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Running git fetch During Scan

**What:** Adding `git fetch` to the scan cycle to get fresh upstream data.

**Why bad:** `git fetch` is a write operation (updates remote tracking branches), can be slow (network latency), and could fail (auth issues, network timeouts). Running it on 35+ repos every 5 minutes is aggressive. The `@{u}` checks reflect the state as of the last manual fetch, which is sufficient — the common case (work that was never pushed) doesn't need a fresh fetch to detect.

**Instead:** Health checks use `@{u}` data from the last fetch. A future enhancement could add an optional "deep scan" mode that fetches before checking.

### Anti-Pattern 2: Health Checks Modifying the Scan Cache

**What:** Storing health findings in the `scanCache` TTL cache alongside `GitScanResult`.

**Why bad:** The scan cache is a TTL-based in-memory cache for request-level performance. Health findings are persistent data with `detectedAt` timestamps that must survive restarts. Mixing transient cache data with persistent health state creates confusion about source of truth.

**Instead:** Health findings go directly to SQLite (`project_health` table). The scan cache stores only `GitScanResult` (raw git data). API routes query SQLite for health data.

### Anti-Pattern 3: MCP Server Importing API Internals

**What:** Having `@mission-control/mcp` import from `@mission-control/api` or `@mission-control/shared` for type reuse.

**Why bad:** Creates a build dependency chain that couples the MCP server to the API's internal types. The MCP server should be deployable independently — it runs on the MacBook while the API runs on the Mac Mini. If the MCP server imports API types, TypeScript compilation requires the API package to be built first, and type changes in the API cascade to the MCP package.

**Instead:** The MCP server defines its own response types (or uses `unknown` + runtime validation). It fetches JSON from the API and reshapes it for MCP tool results. The API's response shapes are the contract — not TypeScript types.

### Anti-Pattern 4: Separate Health Scan Loop

**What:** Running health checks on a different timer or in a separate polling loop from the project scan.

**Why bad:** Two independent scan loops create race conditions (health check runs while scan is updating data), double SSH connections, and confusing timing (health data from 2 minutes ago, scan data from 30 seconds ago).

**Instead:** Health checks are a post-scan phase within the existing `scanAllProjects()` cycle. One timer, one flow, consistent data.

## Suggested Build Order

The build order is driven by data dependencies: later phases consume data produced by earlier phases.

```
Phase 1: Data Foundation
  |
  |  New DB tables (project_health, project_copies)
  |  Drizzle schema additions + migration 0005
  |  Health Zod schemas in shared package
  |  DB query functions (health CRUD, copy CRUD)
  |
  |  WHY FIRST: Everything else reads/writes these tables.
  |  No UI, no API routes — just the data layer.
  |
  v
Phase 2: Git Health Engine
  |
  |  Health check logic (pure functions)
  |  GitScanResult extension (new fields)
  |  SSH batch command extension
  |  Scanner integration (post-scan health phase)
  |  Copy discovery + divergence detection
  |  Unit tests for all 7 checks + scoring
  |
  |  WHY SECOND: Produces the data that API routes and
  |  dashboard consume. Can be tested independently with
  |  mocked git output — no UI needed.
  |
  v
Phase 3: API Routes
  |
  |  GET /api/health-checks (all, by slug)
  |  GET /api/risks (aggregated, sorted by severity)
  |  GET /api/copies (all, by slug)
  |  GET /api/sprint-timeline
  |  Modified: GET /api/projects (add healthScore, riskLevel, copyCount)
  |  SSE event extensions (health:changed, copy:diverged)
  |  Integration tests
  |
  |  WHY THIRD: API routes are simple once the data layer
  |  and health engine exist. Dashboard and MCP both consume
  |  these routes — build them before either consumer.
  |
  v
Phase 4: Dashboard Changes
  |
  |  Risk feed component (severity-grouped cards)
  |  Sprint timeline component (replaces heatmap)
  |  Health dots on project rows
  |  Inline health findings panel
  |  useHealthChecks + useSprintTimeline hooks
  |  SSE handler extensions
  |  Dynamic document title with risk count
  |  Component tests
  |
  |  WHY FOURTH: The visible payoff. All data is flowing
  |  from scanner -> health engine -> DB -> API -> dashboard.
  |  This phase is pure frontend — no backend changes.
  |
  v
Phase 5: MCP Server + Deprecation
  |
  |  New @mission-control/mcp package
  |  Tool handlers (project_health, project_risks, project_detail, sync_status)
  |  stdio transport setup
  |  Claude Code MCP config update
  |  portfolio-dashboard deprecation
  |  Integration tests
  |
  |  WHY LAST: The MCP server is a thin HTTP client wrapper.
  |  It depends on the API routes being stable and tested.
  |  portfolio-dashboard can't be deprecated until the
  |  replacement is proven.
```

### Phase Dependencies Graph

```
Phase 1 (Data) ─────> Phase 2 (Engine) ─────> Phase 3 (API) ──+──> Phase 4 (Dashboard)
                                                               |
                                                               +──> Phase 5 (MCP)
                                                          (4 and 5 are independent)
```

Phases 4 and 5 can run in parallel after Phase 3 is complete. However, Phase 4 should be prioritized — the dashboard is the primary consumer and validates the data before the MCP server exposes it externally.

## Config Changes Required

### mc.config.json

No changes required for existing projects. Multi-copy entries are opt-in:

```json
{
  "projects": [
    // Existing format (unchanged):
    { "slug": "nexusclaw", "name": "NexusClaw", "path": "~/nexusclaw", "host": "local" },

    // NEW: Explicit multi-copy:
    {
      "slug": "streamline",
      "name": "Streamline",
      "tagline": "Team workspace",
      "copies": [
        { "host": "local", "path": "~/streamline" },
        { "host": "mac-mini", "path": "~/streamline" }
      ]
    }
  ]
}
```

Auto-discovery finds multi-copy projects even without explicit config — it matches by normalized remote URL across hosts.

### Claude Code MCP Config

After Phase 5:

```json
{
  "mcpServers": {
    "mission-control": {
      "command": "node",
      "args": ["/path/to/mission-control/packages/mcp/dist/index.js"],
      "env": {
        "MC_API_URL": "http://100.x.x.x:3000"
      }
    }
  }
}
```

Replaces the existing `portfolio-dashboard` entry.

## Performance Considerations

| Concern | Current (v1.0) | After v1.1 | Mitigation |
|---------|---------------|------------|------------|
| Scan cycle duration | ~2-3s (35 repos, parallel) | ~3-5s (additional git commands) | Commands added to existing SSH batch — no extra connections |
| SSH round-trips | 1 per Mac Mini repo | Still 1 per Mac Mini repo | Health commands in same SSH batch |
| SQLite writes per cycle | ~35 project upserts + ~1750 commit upserts | +~35 health upserts + ~35 copy upserts | Negligible — SQLite handles this easily |
| API response size | Projects list: ~35 objects | +3 fields per project (healthScore, riskLevel, copyCount) | Negligible payload increase |
| Dashboard initial load | 3 API calls (projects, heatmap, captures) | 4 API calls (+risks or sprint-timeline) | Parallel fetch, small payloads |

## Sources

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Official MCP server SDK (HIGH confidence)
- [MCP SDK documentation](https://ts.sdk.modelcontextprotocol.io/) — Server creation patterns (HIGH confidence)
- [MCP build server guide](https://modelcontextprotocol.io/docs/develop/build-server) — Official build guide (HIGH confidence)
- Mission Control v1.0 codebase — Direct code examination (HIGH confidence)
- Mission Control v1.1 design spec — `docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md` (HIGH confidence)
- Hono SSE streaming: https://hono.dev/docs/helpers/streaming (HIGH confidence)
- Drizzle ORM SQLite: https://orm.drizzle.team/docs/get-started-sqlite (HIGH confidence)
