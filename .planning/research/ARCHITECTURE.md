# Architecture Patterns

**Domain:** Auto-discovery engine, GitHub star intelligence, session enrichment, and CLI client integrated into existing Hono/SQLite/React monorepo
**Researched:** 2026-03-16

## Recommended Architecture

v1.3 adds four capabilities to the existing Mission Control architecture. The integration strategy follows the established MC pattern: **new services slot into the existing scan-persist-emit pipeline, new API routes register via factory functions in `app.ts`, and the dashboard consumes everything through the same SSE + fetchCounter mechanisms.**

```
                          GitHub API
                         (gh cli / REST)
                              |
                         stars + orgs
                              |
+---------+   fs walk    +----v--------------------+
| ~/      | -----------> |                         |
| Mac Mini|   SSH walk   |    Hono API (:3000)     |
+---------+ -----------> |                         |
                         |  NEW:                   |
                         |  +-- discovery-engine.ts |    +------------------+
                         |  +-- star-service.ts     |    |  React Dashboard |
                         |  +-- convergence.ts      |<-->|  NEW:            |
                         |  +-- routes/discover.ts  | SSE|  +-- discoveries |
                         |  +-- routes/stars.ts     |    |  +-- conv alerts |
                         |                          |    +------------------+
+----------+             |  EXISTING:               |
| mc CLI   |   HTTP      |  +-- project-scanner.ts  |
| (Node.js)| ----------->|  +-- session-service.ts  |
+----------+  /api/*     |  +-- event-bus.ts        |
                         +---+----+-----------------+
                             |    |
                       write |    | SSE
                             v    v
                         +----------+
                         | SQLite   |
                         | NEW:     |
                         | discoveries |
                         | stars    |
                         +----------+
```

### Integration Strategy: Extend, Do Not Replace

All four v1.3 features integrate by **extending existing patterns**, not introducing new ones:

1. **Auto-discovery engine** -- Extends `project-scanner.ts` with a parallel filesystem walker that runs on the same 5-minute background poll. Discovered repos land in a new `discoveries` table, NOT the `projects` table. Projects are promoted only via explicit user action.
2. **GitHub star categorization** -- New service using `gh` CLI (already used by `fetchIsPublic`). Stars land in a `stars` table with AI categorization following the same persist-first-enrich-later pattern as captures.
3. **Session convergence** -- Extends the existing session lifecycle. When a session ends and another session on the same project ended recently, emit a convergence event. Piggybacks on the scan cycle for commit correlation.
4. **CLI client** -- New `packages/cli` package that imports types from `@mission-control/shared` and makes HTTP calls to the same API. Zero backend changes needed for basic capture/status commands.

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|-------------|
| **Discovery Engine** (`services/discovery-engine.ts`) | Walk filesystem dirs for `.git` repos, compare against known projects | Config, DB, Event Bus | **NEW** |
| **Star Service** (`services/star-service.ts`) | Fetch GitHub stars via `gh api`, AI categorize intent | `gh` CLI, AI Categorizer, DB | **NEW** |
| **Convergence Detector** (`services/convergence-detector.ts`) | Detect when parallel sessions are ready to merge | Session queries, Commit queries, Event Bus | **NEW** |
| **Discovery Routes** (`routes/discoveries.ts`) | CRUD for discovered repos, promote/dismiss actions | Discovery Engine, DB | **NEW** |
| **Star Routes** (`routes/stars.ts`) | List/categorize/dismiss starred repos | Star Service, DB | **NEW** |
| **CLI Package** (`packages/cli`) | Terminal client for capture, status, project list | API via HTTP fetch | **NEW** |
| **MCP Session Tools** (`mcp/tools/session-*.ts`) | session_status, session_conflicts tools | API via HTTP | **NEW** |
| **Project Scanner** (`services/project-scanner.ts`) | Add discovery scan after project scan | Discovery Engine | **MODIFIED** (hook point) |
| **Session Service** (`services/session-service.ts`) | Add convergence check on session end | Convergence Detector | **MODIFIED** (few lines) |
| **Event Bus** (`services/event-bus.ts`) | Add discovery/star/convergence event types | SSE route | **MODIFIED** (type union) |
| **useSSE Hook** (`hooks/use-sse.ts`) | Add callbacks for new event types | Dashboard components | **MODIFIED** |
| **App** (`app.ts`) | Register discovery + star routes | New routes | **MODIFIED** (2 lines) |
| **Index** (`index.ts`) | Start star sync timer, discovery scan | New services | **MODIFIED** (few lines) |
| **DB Schema** (`db/schema.ts`) | Add discoveries + stars tables | Drizzle ORM | **MODIFIED** |
| **Config** (`lib/config.ts`) | Add discovery scan paths, GitHub orgs | Config schema | **MODIFIED** |
| **Dashboard App** (`App.tsx`) | Add discoveries section, convergence alerts | New components | **MODIFIED** |

### What Does NOT Change

These components need zero modification:

- SSE streaming mechanism (generic event handler already forwards all `MCEvent` types)
- Capture pipeline and AI categorization infrastructure (star categorization reuses `ai-categorizer.ts` pattern)
- Search and FTS5 indexing (discoveries/stars can be indexed later)
- Existing health engine and risk feed pipeline
- Existing session lifecycle (convergence is additive)
- Budget tracking and LM Studio probe
- Tailwind theming and design system
- Hono RPC client pattern (`hc<AppType>`)

## Data Flow

### Auto-Discovery Flow

```
1. Background poll fires (5-minute interval, AFTER project scan completes)
   -> Discovery engine walks configured directories:
      - MacBook: ~/  (1 level deep, skip node_modules/.Trash/Library)
      - Mac Mini: ~/  via SSH (1 level deep)
      - GitHub: gh api /user/repos + org repos for configured orgs
   -> For each .git dir found:
      - Extract remote URL, branch, last commit date
      - Compare against known projects (config + DB)
      - If new: insert into discoveries table (status: "new")
      - If known: skip silently
   -> Event bus emits discovery:found (with count of new discoveries)
   -> Dashboard shows badge on discoveries section

2. User reviews in dashboard
   -> Track: promotes to mc.config.json (triggers scan on next cycle)
   -> Dismiss: marks status as "dismissed" (hidden from UI, never re-surfaces)
   -> Ignore: no action, stays in discoveries list

3. Promotion to tracked project
   -> Writes to mc.config.json via API endpoint
   -> Triggers immediate scan for the new project
   -> Removes from discoveries table
   -> Event bus emits discovery:promoted
```

### GitHub Star Categorization Flow

```
1. Star sync timer fires (hourly, or on-demand via API)
   -> gh api --paginate user/starred --header "Accept: application/vnd.github.star+json"
   -> Returns repos with starred_at timestamp
   -> For each star not already in DB:
      - Insert into stars table (status: "new", intent: null)
      - Queue AI categorization (same persist-first pattern as captures)

2. AI categorization (async, fire-and-forget)
   -> Gemini structured output with intent schema:
      { intent: "reference" | "try" | "tool" | "inspiration", confidence: 0-1, reasoning: string }
   -> Update star record with AI fields
   -> Event bus emits star:categorized

3. Dashboard discoveries section
   -> Groups stars by intent category
   -> User can override AI categorization
   -> "Try" intent stars can be promoted to discovery tracking
```

### Session Convergence Flow

```
1. Session ends (hook/stop fires)
   -> Session service marks session complete (EXISTING)
   -> Convergence detector runs:
      a. Find other sessions on same projectSlug that ended in last 2 hours
      b. If found: check if both sessions produced commits (via commits table)
      c. If both committed: emit convergence:ready event with session pairs
      d. If only one committed: no action (normal workflow)

2. Next scan cycle detects commits
   -> Convergence detector cross-references:
      - Sessions that ended since last scan
      - New commits on same project from different branches/authors
   -> If divergence detected: upgrade convergence:ready to convergence:action_needed

3. Dashboard shows convergence alert
   -> "Sessions A and B both committed to project-x. Ready to merge?"
   -> Links to git diff / manual resolution instructions
   -> Auto-resolves when next scan shows commits merged (single HEAD)
```

### CLI Client Flow

```
1. mc capture "thought about openefb nav"
   -> POST /api/captures { rawContent: "thought about openefb nav", source: "cli" }
   -> API persists, triggers async AI categorization (EXISTING flow)
   -> CLI prints: "Captured. AI: openefb (0.87)"

2. mc status
   -> GET /api/projects (with scan data)
   -> GET /api/sessions?status=active
   -> GET /api/risks
   -> CLI renders compact table:
     PROJECT        STATUS    RISK    SESSIONS
     mission-control active   healthy  1 (opus)
     openefb         idle     warning  0

3. mc projects
   -> GET /api/projects
   -> CLI renders departure board as terminal table

4. echo "batch idea" | mc capture
   -> Reads stdin, POSTs to /api/captures
   -> Supports piped input for scripting integration
```

## Database Schema Design

### New Tables

```sql
-- Discovered git repositories not yet tracked
CREATE TABLE discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,                    -- filesystem path or github full_name
  host TEXT NOT NULL,                    -- 'local' | 'mac-mini' | 'github'
  remote_url TEXT,                       -- git remote origin URL
  branch TEXT,                           -- default branch
  last_commit_date TEXT,                 -- ISO timestamp of latest commit
  repo_name TEXT,                        -- derived from path/URL
  status TEXT NOT NULL DEFAULT 'new',    -- 'new' | 'dismissed' | 'promoted'
  discovered_at TEXT NOT NULL,           -- ISO timestamp
  dismissed_at TEXT,                     -- when user dismissed
  UNIQUE(path, host)                     -- prevent duplicates per host
);

CREATE INDEX discoveries_status_idx ON discoveries(status);
CREATE INDEX discoveries_host_idx ON discoveries(host);

-- GitHub starred repositories with AI intent categorization
CREATE TABLE stars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  github_id INTEGER NOT NULL UNIQUE,     -- GitHub repo ID (stable identifier)
  full_name TEXT NOT NULL,               -- "owner/repo"
  description TEXT,                      -- repo description
  language TEXT,                         -- primary language
  stars_count INTEGER,                   -- repo star count
  topics TEXT,                           -- JSON array of topics
  starred_at TEXT NOT NULL,              -- when user starred it (ISO)
  intent TEXT,                           -- 'reference' | 'try' | 'tool' | 'inspiration' | null
  ai_confidence REAL,                    -- 0-1 confidence score
  ai_reasoning TEXT,                     -- why AI chose this intent
  status TEXT NOT NULL DEFAULT 'new',    -- 'new' | 'categorized' | 'dismissed' | 'tracking'
  enriched_at TEXT,                      -- when AI categorized
  created_at TEXT NOT NULL,              -- when first synced
  UNIQUE(full_name)
);

CREATE INDEX stars_status_idx ON stars(status);
CREATE INDEX stars_intent_idx ON stars(intent);
CREATE INDEX stars_starred_at_idx ON stars(starred_at);
```

### Schema Design Rationale

- **Discoveries separate from projects**: Discoveries are candidates, not tracked projects. Mixing them into the `projects` table would pollute scan results and health checks. Promotion copies data to `mc.config.json` + `projects` table, then removes from `discoveries`.
- **Discoveries use TEXT timestamps throughout**: Consistent with `project_health` and `project_copies` patterns (detectedAt, lastCheckedAt are TEXT ISO). No Drizzle `mode: timestamp` epoch conversion needed.
- **Stars use github_id as unique key**: GitHub repo IDs are stable even if repos are renamed or transferred. `full_name` is also unique but serves as human-readable identifier.
- **Stars topics as JSON text**: Same pattern as `sessions.filesJson`. Topics are read-only display data, never queried as individual values.
- **Intent as nullable column**: Null means not yet categorized (persist first, enrich later). Non-null means AI or user has categorized.
- **No FTS on discoveries/stars in v1.3**: These tables are small (hundreds of rows, not thousands). Simple LIKE queries suffice. Add to `search_index` if volume grows.
- **UNIQUE(path, host) on discoveries**: Prevents the same repo being discovered twice from different scan cycles. The `host` qualifier handles the case where the same repo exists on MacBook and Mac Mini.

### Existing Tables Modified

No existing tables need schema changes. Convergence detection uses existing `sessions` and `commits` tables:
- `sessions.projectSlug` + `sessions.status` + `sessions.endedAt` for finding recent completed sessions
- `commits.projectSlug` + `commits.authorDate` for correlating commits with session windows

## Patterns to Follow

### Pattern 1: Persist-First-Enrich-Later (from captures.ts)

Stars follow the identical pattern to captures: persist the raw data immediately, trigger async AI categorization via `queueMicrotask`, emit SSE event when enrichment completes.

**What:** Sync write to DB, async AI enrichment, event emission on completion.
**When:** GitHub star ingestion (new stars persist immediately, AI intent categorization runs async).
**Example:**

```typescript
// In star sync service:
for (const star of newStars) {
  // 1. Persist immediately
  insertStar(db, {
    githubId: star.id,
    fullName: star.full_name,
    description: star.description,
    starredAt: star.starred_at,
    status: "new",
  });

  // 2. Fire-and-forget AI categorization
  queueMicrotask(() => {
    categorizeStarIntent(db, star.id).catch((err) => {
      console.error(`Star categorization failed for ${star.full_name}:`, err);
    });
  });
}

// 3. Emit batch event
eventBus.emit("mc:event", { type: "star:synced", id: "all" });
```

### Pattern 2: Background Timer Integration (from index.ts)

Discovery scan and star sync run as background timers alongside the existing project scan and session reaper. Same startup/shutdown pattern.

**What:** `setInterval` with cleanup on SIGTERM, started in `index.ts`.
**When:** Discovery scan (piggyback on project scan, 5-min interval), star sync (hourly).
**Example:**

```typescript
// In index.ts, after existing poll setup:
let starSyncTimer: ReturnType<typeof setInterval> | null = null;

if (config) {
  // Initial star sync
  syncGitHubStars(config, db).catch(err =>
    console.error("Initial star sync failed:", err)
  );

  // Hourly star sync
  starSyncTimer = setInterval(() => {
    syncGitHubStars(config, db).catch(err =>
      console.error("Star sync failed:", err)
    );
  }, 3_600_000);
  console.log("GitHub star sync started (1-hour interval)");
}

// In shutdown():
if (starSyncTimer) {
  clearInterval(starSyncTimer);
  starSyncTimer = null;
}
```

### Pattern 3: Route Factory with DB Injection (from app.ts)

New route groups follow the established factory pattern. Chain onto the existing app for type preservation.

**What:** `createDiscoveryRoutes(getInstance)` and `createStarRoutes(getInstance)` registered in `app.ts`.
**When:** Adding any new route group.
**Example:**

```typescript
// In app.ts:
const app = new Hono()
  .route("/api", createHealthRoutes(() => config ?? null))
  // ... existing routes ...
  .route("/api", createDiscoveryRoutes(getInstance))
  .route("/api", createStarRoutes(getInstance));
```

### Pattern 4: External CLI via `gh` CLI (from project-scanner.ts)

The existing scanner uses `execFile("gh", [...])` for GitHub API calls (`fetchIsPublic`, `scanGithubProject`). Star fetching follows the same pattern -- shell out to `gh api` with `--paginate` and `--jq` for data extraction.

**What:** Use `gh api --paginate` for paginated GitHub data, `gh api` for single requests.
**When:** Fetching starred repos, listing org repos.
**Example:**

```typescript
export async function fetchStarredRepos(): Promise<StarredRepo[]> {
  const result = await execFile("gh", [
    "api", "--paginate",
    "user/starred",
    "--header", "Accept: application/vnd.github.star+json",
    "--jq", '.[].repo | {id: .id, full_name: .full_name, description: .description, language: .language, stargazers_count: .stargazers_count, topics: .topics}',
  ], { timeout: 30_000 });

  // gh --paginate emits one JSON array per page; parse and flatten
  return result.stdout.trim().split("\n")
    .filter(line => line.length > 0)
    .map(line => JSON.parse(line) as StarredRepo);
}
```

### Pattern 5: AI Categorization with Structured Output (from ai-categorizer.ts)

Star intent categorization reuses the exact same Gemini structured output pattern as capture categorization. Different schema, same infrastructure.

**What:** `generateText` with `Output.object` and a Zod schema.
**When:** Categorizing GitHub star intent.
**Example:**

```typescript
const starIntentSchema = z.object({
  intent: z.enum(["reference", "try", "tool", "inspiration"])
    .describe("Why the user likely starred this repo"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export async function categorizeStarIntent(
  star: { fullName: string; description: string | null; language: string | null; topics: string[] }
): Promise<z.infer<typeof starIntentSchema>> {
  const { output } = await generateText({
    model: google(process.env["AI_MODEL"] ?? "gemini-3-flash-preview"),
    output: Output.object({ schema: starIntentSchema }),
    prompt: `Categorize why a developer starred this GitHub repository.

Repo: ${star.fullName}
Description: ${star.description ?? "No description"}
Language: ${star.language ?? "Unknown"}
Topics: ${star.topics.join(", ") || "None"}

Categories:
- reference: Starred to look at later for learning/patterns
- try: Starred to try using in a project
- tool: Starred because it's a useful dev tool to use regularly
- inspiration: Starred for design/UX/concept inspiration`,
  });

  return output ?? { intent: "reference", confidence: 0, reasoning: "AI categorization failed" };
}
```

### Pattern 6: CLI as Thin API Client (from mcp/api-client.ts)

The MCP package already demonstrates the pattern: a thin HTTP client that calls the same API endpoints. The CLI follows the same approach -- plain `fetch()` calls to `http://100.x.x.x:3000/api/*`.

**What:** Node.js CLI with `fetch()` to MC API, no Hono RPC client (CLI is standalone binary, not monorepo consumer at runtime).
**When:** All CLI commands.

**Why not Hono RPC (`hc`)?** The RPC client requires importing `AppType` from `@mission-control/api`, which brings in the entire API package as a runtime dependency. The CLI should be a lightweight standalone binary. Use plain `fetch()` with types from `@mission-control/shared` for request/response validation.

```typescript
// packages/cli/src/api.ts
const API_BASE = process.env["MC_API_URL"] ?? "http://100.x.x.x:3000";

export async function createCapture(content: string): Promise<CaptureResponse> {
  const res = await fetch(`${API_BASE}/api/captures`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rawContent: content }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<CaptureResponse>;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Discovery Engine Scanning Recursively
**What:** Walking the entire filesystem tree recursively to find every .git directory.
**Why bad:** MacBook home dirs have tens of thousands of directories (node_modules, Library, .Trash, caches). Recursive walk would take minutes and thrash disk I/O.
**Instead:** Walk configured root directories 1 level deep only. `~/` contains project repos at the top level. If a repo is nested (e.g., `~/projects/foo/`), the user adds `~/projects/` to the discovery scan paths in config. Explicit is better than magical.

### Anti-Pattern 2: Writing mc.config.json from API
**What:** Auto-promoting discovered repos by having the API write to `mc.config.json` directly.
**Why bad:** The config file is a source of truth that lives on disk. Writing to it from the API creates race conditions (what if someone is editing it?), loses comments/formatting, and couples the API to filesystem details.
**Instead:** Discovery promotion flow: API returns the JSON snippet to add. Dashboard shows "add to config" with copy-to-clipboard. Or: API writes to a `config.d/` directory with individual JSON files that get merged at load time (future consideration). For v1.3, keep it simple: the API marks the discovery as "promoted" and the user manually adds it to config.

### Anti-Pattern 3: Separate Star Sync Database
**What:** Storing GitHub stars in a separate SQLite database or external service.
**Why bad:** Stars need to cross-reference with existing projects (is a starred repo already tracked?), and the dashboard queries both tables. Separate databases mean no joins, no transactions, and complex sync logic.
**Instead:** Same SQLite database, new table. The `stars.full_name` can be compared against `project_copies.remote_url` (normalized) to find already-tracked repos.

### Anti-Pattern 4: CLI Using Hono RPC Client
**What:** Having the CLI import `hc<AppType>` from `@mission-control/api` for type-safe API calls.
**Why bad:** Pulls the entire API package (Hono, Drizzle, better-sqlite3) into the CLI bundle. The CLI should be a lightweight standalone tool, potentially distributed as a single binary.
**Instead:** Plain `fetch()` with types imported from `@mission-control/shared` (Zod schemas only, no runtime deps). The shared package is already designed for this -- it exports schemas and types, nothing else.

### Anti-Pattern 5: Convergence Detection Requiring Git Hooks
**What:** Installing post-commit hooks in every repo to notify MC of commits in real-time.
**Why bad:** Same reasons as v1.2 ARCHITECTURE.md: requires touching 35+ repos, hook maintenance, breaks on re-clone. Invasive and fragile.
**Instead:** Convergence detection piggybacks on the existing 5-minute scan cycle. Sessions table records which sessions touched which project. Commits table records which commits appeared. Cross-referencing these after each scan gives convergence data with at most 5-minute latency -- acceptable for "ready to merge" notifications.

### Anti-Pattern 6: CLI Package Bundled with Webpack/esbuild
**What:** Setting up a complex build pipeline for the CLI with bundling, tree-shaking, etc.
**Why bad:** Over-engineering for a personal tool. The CLI is a handful of TypeScript files that shell out to fetch. No browser compatibility concerns, no bundle size budget.
**Instead:** Compile with `tsc`, run with `node`. Add a shebang and `"bin"` field in package.json. Optionally create a shell wrapper (`mc`) that runs the compiled JS. If a single-binary distribution is wanted later, use `pkg` or `bun build --compile`.

## New SSE Event Types

Extend `MCEventType` in `event-bus.ts`:

```typescript
export type MCEventType =
  | "capture:created"
  | "capture:enriched"
  | "capture:archived"
  | "scan:complete"
  | "health:changed"
  | "copy:diverged"
  | "session:started"
  | "session:ended"
  | "session:conflict"
  | "session:abandoned"
  | "budget:updated"
  // v1.3 events
  | "discovery:found"       // new repos discovered during scan
  | "discovery:promoted"    // repo promoted to tracked project
  | "star:synced"           // star sync completed (batch)
  | "star:categorized"      // single star AI-categorized
  | "convergence:ready"     // parallel sessions ready to merge
  | "convergence:resolved"; // convergence resolved (merged or dismissed)
```

## New API Endpoints

| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| GET | `/api/discoveries` | List discovered repos | Filter by status, host |
| POST | `/api/discoveries/:id/promote` | Mark discovery as promoted | Returns config snippet |
| POST | `/api/discoveries/:id/dismiss` | Mark discovery as dismissed | Permanent, never re-surfaces |
| POST | `/api/discoveries/scan` | Trigger manual discovery scan | Async, returns 202 |
| GET | `/api/stars` | List starred repos | Filter by intent, status |
| POST | `/api/stars/sync` | Trigger manual star sync | Async, returns 202 |
| PATCH | `/api/stars/:id` | Update star intent/status | User override of AI |
| GET | `/api/sessions/convergence` | List convergence candidates | Active convergence alerts |
| POST | `/api/sessions/convergence/:id/resolve` | Mark convergence resolved | User acknowledges merge |

Existing endpoints consumed by CLI (no changes needed):
- `POST /api/captures` -- capture creation
- `GET /api/projects` -- project list
- `GET /api/sessions` -- session list
- `GET /api/risks` -- risk summary

## Config Extension

Add discovery and star configuration to `mc.config.json`:

```typescript
const discoveryConfigSchema = z.object({
  scanPaths: z.array(z.object({
    path: z.string(),
    host: z.enum(["local", "mac-mini"]),
    depth: z.number().int().min(1).max(3).default(1),
  })).default([
    { path: "/Users/ryanstern", host: "local", depth: 1 },
    { path: "/Users/ryanstern", host: "mac-mini", depth: 1 },
  ]),
  githubOrgs: z.array(z.string()).default(["quartermint", "vanboompow"]),
  excludePatterns: z.array(z.string()).default([
    "node_modules", ".Trash", "Library", ".cache", ".npm", ".pnpm-store",
    "Applications", "Desktop", "Documents", "Downloads", "Music", "Pictures",
  ]),
  scanIntervalMs: z.number().int().min(60_000).default(300_000), // 5 minutes
});

const starConfigSchema = z.object({
  enabled: z.boolean().default(true),
  syncIntervalMs: z.number().int().min(300_000).default(3_600_000), // 1 hour
  autoCategorizze: z.boolean().default(true), // AI categorization
});

// Add to mcConfigSchema:
export const mcConfigSchema = z.object({
  // ... existing fields ...
  discovery: discoveryConfigSchema.default({}),
  stars: starConfigSchema.default({}),
});
```

## CLI Package Architecture

### Package Structure

```
packages/cli/
  package.json          # @mission-control/cli, bin: { mc: "./dist/index.js" }
  tsconfig.json         # extends root, target: ES2022
  src/
    index.ts            # CLI entry point with command router
    commands/
      capture.ts        # mc capture "thought"
      status.ts         # mc status
      projects.ts       # mc projects
    lib/
      api.ts            # fetch wrapper with MC_API_URL
      output.ts         # terminal formatting (colors, tables)
      config.ts         # CLI config (~/.mcrc or env vars)
```

### CLI Design Decisions

| Decision | Rationale |
|----------|-----------|
| No CLI framework (no Commander/yargs) | 3 commands do not justify a dependency. `process.argv` parsing is trivial. |
| Plain `fetch()`, not Hono RPC | Avoids pulling API package as runtime dep. Shared types via `@mission-control/shared`. |
| Output to stdout, errors to stderr | Standard Unix convention. Supports piping: `mc projects \| grep active`. |
| `MC_API_URL` env var | Same pattern as hook scripts. Default: `http://100.x.x.x:3000`. |
| Stdin support via `-` flag or pipe detection | `mc capture -` reads from stdin. `echo "idea" \| mc capture` auto-detects pipe. |
| Color output via ANSI codes | No `chalk` dependency. Respect `NO_COLOR` env var. |

### Global Install

```bash
# From monorepo root:
pnpm --filter @mission-control/cli build
npm link packages/cli  # or: ln -s /path/to/packages/cli/dist/index.js /usr/local/bin/mc
```

## MCP Session Tools

Two new MCP tools extend the existing 4-tool MCP server:

```typescript
// mcp/tools/session-status.ts
registerSessionStatus(server);
// Tool: session_status
// Input: { projectSlug?: string }
// Output: Active sessions, recent sessions, convergence alerts

// mcp/tools/session-conflicts.ts
registerSessionConflicts(server);
// Tool: session_conflicts
// Input: { projectSlug?: string }
// Output: Active file conflicts across sessions
```

These follow the exact pattern of existing MCP tools: thin HTTP wrappers around API endpoints using the `api-client.ts` module.

## Scalability Considerations

| Concern | At current scale (35 projects) | At 100+ projects | At 500+ projects |
|---------|------|------|------|
| Discovery scan time | < 2s (1-level walk of ~/) | < 5s (more dirs to check) | Need parallel SSH + throttling |
| Discovery table size | ~50 rows (repos on disk) | ~200 rows | Need periodic cleanup of dismissed |
| Star table size | ~100-500 rows (typical user) | Same (stars don't scale with projects) | Same |
| Star sync API calls | 1-5 pages (100/page) | Same | Same |
| Convergence detection | Linear scan of recent sessions (< 20) | Fine with index | Needs project-scoped query optimization |
| CLI response time | < 200ms (local network fetch) | Same | Same |

## Suggested Build Order

Based on dependency analysis:

```
Phase 1: Discovery Data Foundation
  - discoveries table + Drizzle migration
  - stars table + Drizzle migration
  - Config schema extension (discovery paths, star settings, GitHub orgs)
  - Zod schemas in shared package for discoveries + stars
  - Depends on: nothing (pure additions)

Phase 2: Auto-Discovery Engine
  - Discovery engine service (filesystem walk, SSH walk, GitHub org listing)
  - Discovery routes (list, promote, dismiss, trigger scan)
  - Integration into project scanner (post-scan hook)
  - Event bus extension (discovery events)
  - Depends on: Phase 1 (needs schema + config)

Phase 3: GitHub Star Intelligence
  - Star service (gh CLI fetch, AI categorization)
  - Star routes (list, sync, update)
  - Background timer for hourly sync
  - Depends on: Phase 1 (needs schema), uses existing AI categorizer pattern

Phase 4: Session Enrichment
  - Convergence detector service
  - Convergence API endpoints
  - MCP session tools (session_status, session_conflicts)
  - Integration into session service (convergence check on session end)
  - Event bus extension (convergence events)
  - Depends on: existing v1.2 session infrastructure

Phase 5: Dashboard - Discoveries + Stars
  - Discoveries section component
  - Star browser component with intent grouping
  - Convergence alert cards in risk feed
  - useSSE extensions for new events
  - Depends on: Phase 2-4 (needs all API endpoints)

Phase 6: CLI Client
  - packages/cli scaffold
  - mc capture command
  - mc status command
  - mc projects command
  - stdin/pipe support
  - Depends on: existing API (no new endpoints needed)
```

**Phase ordering rationale:**
1. Schema first because discovery engine and star service both depend on it.
2. Discovery engine second because it extends the existing scan cycle and is the highest-value feature (surfaces unknown repos).
3. Star intelligence third because it's independent of discovery but shares the schema foundation.
4. Session enrichment fourth because it builds on the existing v1.2 session infrastructure with no schema dependencies.
5. Dashboard fifth because it needs all backend APIs to render.
6. CLI last because it only consumes existing endpoints -- zero backend changes needed. It can also be built in parallel with Phase 5 since it has no dependency on dashboard work.

**Parallelization opportunity:** Phase 6 (CLI) can be built in parallel with Phase 5 (Dashboard) since they share no code dependencies.

## Sources

- [GitHub REST API - Starring endpoints](https://docs.github.com/en/rest/activity/starring) -- star listing with timestamps, HIGH confidence
- [gh api manual](https://cli.github.com/manual/gh_api) -- pagination with --paginate and --slurp, HIGH confidence
- [gh CLI starred repos discussion](https://github.com/cli/cli/discussions/6612) -- using gh api for star data, MEDIUM confidence
- [Hono RPC in monorepos](https://catalins.tech/hono-rpc-in-monorepos/) -- TypeScript project reference patterns, MEDIUM confidence
- Existing MC codebase analysis (project-scanner.ts, ai-categorizer.ts, session-service.ts, event-bus.ts, app.ts, schema.ts, mcp/index.ts) -- HIGH confidence
- [node-git-repos](https://github.com/IonicaBizau/node-git-repos) -- recursive git repo finder pattern, LOW confidence (prefer custom implementation)
