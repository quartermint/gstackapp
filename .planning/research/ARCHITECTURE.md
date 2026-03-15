# Architecture Patterns — v1.2 Auto-Discovery + Star Intelligence

**Domain:** Extending API-first personal operating environment with project auto-discovery, GitHub star intelligence, and config write capability
**Researched:** 2026-03-15
**Baseline:** v1.1 architecture (Hono API + SQLite + React dashboard + MCP, 4-package monorepo)

## Architecture Overview: What Changes

v1.2 adds two major architectural surfaces to the existing system. No existing components are replaced -- they are extended with new neighbors.

| Surface | Type | Touches |
|---------|------|---------|
| Discovery engine | New service + timer | `index.ts`, event-bus, config |
| Discovery data layer | New table + queries | `schema.ts`, drizzle migration |
| Discovery API routes | New route group | `app.ts` route chain |
| Config write capability | New mutation path | `config.ts` (read-only today) |
| Shared discovery schemas | New schema file | `packages/shared` |
| Dashboard discoveries section | New UI components | `App.tsx`, new hooks |
| SSE event extensions | Modified event types | `event-bus.ts`, `use-sse.ts` |

### What Does NOT Change

- Project scanner (`project-scanner.ts`) -- runs on its own 5-min cycle, untouched
- Health engine (`git-health.ts`) -- receives promoted projects automatically via next scan
- Existing API routes -- no breaking changes, only additive
- MCP server -- no changes in v1.2 (could add discovery tools in future)
- Database structure for existing tables -- no migrations touching existing tables

## Component Architecture

### New Components

```
packages/api/src/
  services/
    discovery-scanner.ts      # NEW: 30-min discovery engine
    config-writer.ts          # NEW: Config mutation with mutex
  db/queries/
    discoveries.ts            # NEW: CRUD for discovered_projects table
  routes/
    discoveries.ts            # NEW: 5 API routes for discovery management

packages/shared/src/
  schemas/
    discovery.ts              # NEW: Zod schemas for discovery types

packages/web/src/
  hooks/
    use-discoveries.ts        # NEW: TanStack Query hook
  components/
    discoveries/
      discovery-section.tsx   # NEW: Container with visibility logic
      discovery-card.tsx      # NEW: Individual discovery card
      promote-form.tsx        # NEW: Inline edit form for promote
      star-categorize.tsx     # NEW: Star intent categorization panel
```

### Modified Components

| File | Change | Why |
|------|--------|-----|
| `packages/api/src/app.ts` | Add `.route("/api", createDiscoveryRoutes(...))` | Register new route group in Hono chain |
| `packages/api/src/index.ts` | Add discovery timer alongside health timer | Second `setInterval` for 30-min cycle |
| `packages/api/src/db/schema.ts` | Add `discoveredProjects` table definition | New Drizzle schema |
| `packages/api/src/services/event-bus.ts` | Add `"discovery:new"` and `"config:changed"` to `MCEventType` | New domain events |
| `packages/api/src/lib/config.ts` | Add `discovery` section to config schema, add `reloadConfig()` export | Discovery settings + hot reload |
| `packages/shared/src/schemas/project.ts` | Add `discoveryCount` to project list query response | Dashboard visibility signal |
| `packages/shared/src/index.ts` | Export new discovery schemas and types | Barrel file update |
| `packages/shared/src/types/index.ts` | Add discovery type exports | Type inference exports |
| `packages/web/src/App.tsx` | Add `DiscoverySection` between RiskFeed and SprintTimeline | Dashboard layout integration |
| `packages/web/src/hooks/use-sse.ts` | Add `onDiscoveryNew` handler | SSE event for live discovery |

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `discovery-scanner.ts` | Scans 4 sources, dedup, inserts discoveries | `discoveries.ts` (queries), `event-bus.ts`, `config.ts` |
| `config-writer.ts` | Mutex-protected config file writes | `config.ts` (read), filesystem (write) |
| `discoveries.ts` (queries) | CRUD operations on `discovered_projects` | Database only |
| `discoveries.ts` (routes) | HTTP API for discovery management | Query layer, `config-writer.ts` (promote), `discovery-scanner.ts` (manual scan) |
| `discovery-section.tsx` | Container with conditional visibility | `use-discoveries.ts` hook |
| `discovery-card.tsx` | Single discovery card rendering | Parent component |
| `promote-form.tsx` | Inline edit + confirm for promoting | API client (POST promote) |
| `star-categorize.tsx` | Intent selection + project picker | API client (POST categorize) |

## Data Flow

### Discovery Scan Cycle (30 minutes)

```
Timer fires (index.ts)
  |
  v
discovery-scanner.ts: scanForDiscoveries(config, db)
  |
  +-- Local: find ~/ -maxdepth 2 -name .git
  +-- SSH:   ssh mac-mini "find ~/ -maxdepth 2 -name .git" (single connection)
  +-- GitHub Orgs: gh api /orgs/{org}/repos (for each org)
  +-- GitHub Stars: gh api /user/starred?sort=created&per_page=10
  |   (all 4 sources run in parallel via Promise.allSettled)
  |
  v
Dedup against:
  1. projects table (path match, remoteUrl normalized match, repo field match)
  2. discovered_projects table (source+host+path unique key)
  |
  v
For new repos:
  +-- Infer metadata (package.json/Cargo.toml/go.mod/dir name)
  +-- Insert into discovered_projects (status: 'new')
  +-- Queue async AI tagline generation (queueMicrotask, same pattern as capture enrichment)
  |
For dismissed repos:
  +-- Check re-surface rules (activity > dismissedAt OR 30-day decay)
  +-- If re-surfaced: status 'dismissed' -> 'new', preserve previouslyDismissedAt
  |
  v
eventBus.emit("discovery:new")  // only if new discoveries found
```

### Promote Flow (User Action)

```
User clicks [Track] on discovery card
  |
  v
Dashboard: POST /api/discoveries/:id/promote { name?, slug?, tagline? }
  |
  v
Route handler:
  1. Validate discovery exists and status != 'promoted'
  2. Call config-writer.ts: promoteToConfig(discovery, overrides)
     |
     v
     config-writer.ts (mutex-protected):
       a. Acquire Promise-chain mutex
       b. Re-read mc.config.json from disk (NOT startup cache)
       c. Parse with Zod (validate current state)
       d. Append new ProjectConfigEntry to projects array
       e. Write back with JSON.stringify(config, null, 2)
       f. Update module-level currentConfig reference
       g. Release mutex
       h. Emit config:changed event
  3. Upsert into projects table (same as scanAllProjects does)
  4. Update discovered_projects.status = 'promoted', set promotedAt
  5. Emit scan:complete (triggers project list refresh on dashboard)
  |
  v
Next 5-min health scan automatically picks up new project from currentConfig
```

### Star Categorization Flow

```
User clicks [Categorize] on star card -> inline panel expands
  |
  v
User selects intent (reference/try/tool/inspiration) + optional project
  |
  v
Dashboard: POST /api/discoveries/:id/categorize { intent, project? }
  |
  v
Route handler:
  1. Update discovered_projects: starIntent, starProject, status = 'promoted'
  2. Attempt GitHub star list management (async, non-blocking):
     a. Check/create list: gh api --method POST /user/lists -f name="{list-name}"
     b. Add star to list: GitHub Lists API
     c. If API fails: save intent locally, retry on next scan cycle
  3. Return success (don't wait for GitHub API)
```

### SSE Event Flow

```
Existing events (unchanged):
  capture:created, capture:enriched, capture:archived
  scan:complete, health:changed, copy:diverged

New events:
  discovery:new     -> Dashboard invalidates discovery query -> section appears/updates
  config:changed    -> Dashboard refetches project list (promoted project now in list)
```

## Data Model Integration

### New Table: `discovered_projects`

```typescript
// packages/api/src/db/schema.ts (addition)
export const discoveredProjects = sqliteTable(
  "discovered_projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    path: text("path").notNull(),
    host: text("host", { enum: ["local", "mac-mini", "github"] }).notNull(),
    source: text("source", {
      enum: ["directory-scan", "github-org", "github-star"],
    }).notNull(),
    tagline: text("tagline"),
    remoteUrl: text("remote_url"),
    language: text("language"),
    lastActivityAt: text("last_activity_at"),
    status: text("status", { enum: ["new", "dismissed", "promoted"] })
      .notNull()
      .default("new"),
    discoveredAt: text("discovered_at").notNull(),
    dismissedAt: text("dismissed_at"),
    previouslyDismissedAt: text("previously_dismissed_at"),
    dismissCount: integer("dismiss_count").notNull().default(0),
    promotedAt: text("promoted_at"),
    starIntent: text("star_intent", {
      enum: ["reference", "try", "tool", "inspiration"],
    }),
    starProject: text("star_project"),
    metadata: text("metadata"), // JSON string
  },
  (table) => [
    index("disc_status_idx").on(table.status),
    uniqueIndex("disc_source_host_path_uniq").on(
      table.source,
      table.host,
      table.path
    ),
    index("disc_source_idx").on(table.source),
  ]
);
```

### Migration File: `0006_discovered_projects.sql`

This follows the existing numbered migration convention (`0000` through `0005`). The migration creates the table and indexes. No existing tables are altered.

### Drizzle ORM Pattern

The existing codebase uses Drizzle for schema definition + migrations, but queries are written using raw `better-sqlite3` prepared statements for performance (see `queries/captures.ts`, `queries/health.ts`). Discovery queries should follow the same pattern: Drizzle for schema, raw SQL for queries. This avoids the Drizzle query builder overhead for simple CRUD.

### Timestamp Convention

Existing tables use two conventions:
- `captures`, `projects`, `commits`: `integer("created_at", { mode: "timestamp" })` (Unix epoch)
- `projectHealth`, `projectCopies`: `text("detected_at")` (ISO strings)

The design spec uses text ISO timestamps for the discovered_projects table (`discoveredAt`, `dismissedAt`, etc.), which aligns with the health/copies pattern. Use text ISO timestamps -- they're easier for age calculations and human-readable in SQL debugging.

## Config Architecture Changes

### Current Config Shape

```typescript
{
  projects: ProjectConfigEntry[],    // existing
  dataDir: string,                   // existing
  services: ServiceEntry[],          // existing
  macMiniSshHost: string,            // existing
}
```

### Extended Config Shape

```typescript
{
  projects: ProjectConfigEntry[],    // existing
  dataDir: string,                   // existing
  services: ServiceEntry[],          // existing
  macMiniSshHost: string,            // existing
  discovery: {                       // NEW
    enabled: boolean,
    scanDirs: string[],              // e.g. ["~/"]
    githubOrgs: string[],            // e.g. ["quartermint", "vanboompow"]
    scanStars: boolean,
    intervalMinutes: number,         // default 30
    ignorePaths: string[],           // user additions merged with hardcoded defaults
  },
}
```

### Config Hot Reload Pattern

Today, `config.ts` exports `loadConfig()` which reads from disk once at startup. The config reference is passed into `scanAllProjects()` by value from `index.ts`.

v1.2 introduces config mutation (promote flow). The pattern:

1. **Module-level mutable reference in `index.ts`:** Replace `const config` with `let currentConfig`. Both the health scan timer and discovery scan timer read `currentConfig` at cycle start.
2. **Config writer updates the reference:** After writing to disk, `config-writer.ts` calls a setter (or the route handler updates `currentConfig` directly) to refresh the in-memory reference.
3. **No process restart needed:** The next 5-min health scan automatically picks up the newly promoted project because it reads `currentConfig`.

This is deliberately simple. The alternative (file-watching with `fs.watch`) adds complexity for a single-user system where config changes are infrequent and initiated by MC itself.

### Config Write Safety

The config write is the only destructive filesystem operation in MC. Safety measures:

1. **Promise-chain mutex:** A module-level let `writeChain: Promise<void> = Promise.resolve()` that serializes all writes. Each `promoteToConfig()` call chains onto the previous.
2. **Re-read before write:** Never modify the startup snapshot. Re-read from disk to pick up any manual edits.
3. **Zod validation:** Parse the re-read config to ensure it's valid before appending.
4. **Atomic write:** Use `writeFileSync` (not async) within the mutex -- the file is small (~3KB), and atomicity matters more than async I/O here.
5. **No backup/rollback:** Single-user system. If the write corrupts the file, the user can fix it manually. The re-read + Zod validation prevents writing bad data.

## API Route Integration

### Route Registration in `app.ts`

```typescript
// Add to the method chain (order doesn't matter for Hono routing, but
// convention is to add after existing routes for readability)
.route("/api", createDiscoveryRoutes(getInstance, () => currentConfig ?? null, discoveryScanner))
```

The route factory receives:
- `getInstance`: Database accessor (same pattern as all other routes)
- `getConfig`: Config accessor (for promote flow config write)
- `discoveryScanner`: Reference to scanner instance (for manual scan trigger)

### Route Details

| Route | Method | Handler Pattern |
|-------|--------|-----------------|
| `GET /api/discoveries` | Query `discovered_projects` with status/source filters | Same as `GET /api/health-checks` |
| `POST /api/discoveries/:id/promote` | DB update + config write + project upsert | Unique -- only route that writes to filesystem |
| `POST /api/discoveries/:id/dismiss` | DB update (status + dismissedAt + dismissCount) | Simple mutation |
| `POST /api/discoveries/:id/categorize` | DB update + async GitHub API call | Similar to capture enrichment async pattern |
| `POST /api/discover` | Trigger manual scan (non-blocking) | Same pattern as `POST /api/projects/refresh` |

### Hono RPC Type Preservation

The Hono RPC client (`hc<AppType>`) requires method chaining in `app.ts` for TypeScript to preserve the route type graph. The new `.route("/api", createDiscoveryRoutes(...))` must be added to the existing chain, not as a separate `app.use()` call. This is the same requirement that exists for all current route groups.

## Dashboard Integration

### Layout Position

Per the design spec, the discoveries section goes between Risk Feed and Sprint Timeline:

```
Capture Field
Risk Feed
**Discoveries** (NEW -- conditional on having new discoveries)
Sprint Timeline
Hero Card
Departure Board
Loose Thoughts
```

### Conditional Rendering

The section only appears when `status: 'new'` discoveries exist. Two approaches:

**Option A: Dedicated count endpoint.** Add `GET /api/discoveries/count` returning just the count. Dashboard polls this cheaply.

**Option B: Piggyback on project list.** Add `discoveryCount` to the `GET /api/projects` response. Dashboard already fetches this on mount.

**Recommendation: Option B.** It eliminates an extra HTTP request and follows the existing pattern where `GET /api/projects` already enriches the response with `healthScore`, `riskLevel`, and `copyCount`. The `discoveryCount` is a single `SELECT COUNT(*) FROM discovered_projects WHERE status = 'new'` query that runs alongside the existing batch queries in the projects route handler.

### TanStack Query Integration

```typescript
// use-discoveries.ts
function useDiscoveries() {
  return useQuery({
    queryKey: ["discoveries"],
    queryFn: async () => {
      const res = await client.api.discoveries.$get();
      return res.json();
    },
  });
}
```

SSE `discovery:new` event invalidates the `["discoveries"]` query key, same pattern as `health:changed` invalidating risks.

### SSE Hook Extension

The existing `useSSE` hook needs two new callback options:

```typescript
interface SSEOptions {
  // ... existing ...
  onDiscoveryNew?: () => void;
  onConfigChanged?: () => void;
}
```

These map to `discovery:new` and `config:changed` SSE event types. The `config:changed` event triggers a project list refetch (newly promoted project appears in departure board).

## Patterns to Follow

### Pattern 1: Background Service with Timer

The discovery engine follows the exact same lifecycle pattern as the project scanner:

```typescript
// index.ts
let discoveryTimer: ReturnType<typeof setInterval> | null = null;

if (config?.discovery?.enabled) {
  // Initial discovery scan
  discoverAll(config, db, sqlite).catch(err =>
    console.error("Initial discovery scan failed:", err)
  );

  // Recurring scan
  const intervalMs = (config.discovery.intervalMinutes ?? 30) * 60_000;
  discoveryTimer = setInterval(() => {
    discoverAll(currentConfig, db, sqlite).catch(err =>
      console.error("Discovery scan failed:", err)
    );
  }, intervalMs);
}

// In shutdown():
if (discoveryTimer) {
  clearInterval(discoveryTimer);
  discoveryTimer = null;
}
```

### Pattern 2: SSH Batch Script

The Mac Mini directory scan uses the same `===SECTION===` delimiter pattern as the health scanner, bundled into a single SSH connection:

```bash
ssh mac-mini-host "
  echo '===FIND==='
  find ~/ -maxdepth 2 -name .git -type d -not -path '*/node_modules/*' 2>/dev/null
  echo '===DONE==='
"
```

This produces a list of paths. For each new discovery, metadata inference (package.json, git log) runs in a second SSH connection using the same batch script pattern. Important: batch the metadata inference into one SSH call for all new repos on Mac Mini, not one connection per repo.

### Pattern 3: Async Enrichment (Fire and Forget)

AI tagline generation follows the capture enrichment pattern:

```typescript
// After inserting discovery into DB
queueMicrotask(() => {
  generateTagline(db, discoveryId, readmePath).catch(err =>
    console.error("Tagline generation failed:", err)
  );
});
```

This is the same `queueMicrotask` pattern used by `enrichCapture()` -- the discovery insert returns immediately, and AI processing happens in the background.

### Pattern 4: Query Layer Pattern

Follow the raw SQL prepared statement pattern used throughout the codebase:

```typescript
// queries/discoveries.ts
export function insertDiscovery(db: DrizzleDb, data: NewDiscovery): void {
  const stmt = db.$client.prepare(`
    INSERT INTO discovered_projects (slug, name, path, host, source, ...)
    VALUES (?, ?, ?, ?, ?, ...)
  `);
  stmt.run(data.slug, data.name, data.path, ...);
}

export function getNewDiscoveries(db: DrizzleDb): DiscoveryRow[] {
  const stmt = db.$client.prepare(`
    SELECT * FROM discovered_projects WHERE status = 'new'
    ORDER BY discovered_at DESC
  `);
  return stmt.all() as DiscoveryRow[];
}
```

### Pattern 5: Event Bus Extension

Add new event types to the union type and emit through the singleton:

```typescript
// event-bus.ts
export type MCEventType =
  | "capture:created"
  | "capture:enriched"
  | "capture:archived"
  | "scan:complete"
  | "health:changed"
  | "copy:diverged"
  | "discovery:new"     // NEW
  | "config:changed";   // NEW
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Scanning Inside the Health Timer

**What:** Running discovery as part of `scanAllProjects()` in the 5-min cycle.
**Why bad:** Discovery is expensive (filesystem `find`, SSH, GitHub API) and doesn't need to run every 5 minutes. Coupling it to the health scan makes both harder to reason about and increases the blast radius of failures.
**Instead:** Separate timer, separate service, separate failure isolation. Discovery failures never affect health scanning.

### Anti-Pattern 2: Modifying Startup Config Reference

**What:** Directly mutating the config object passed to `scanAllProjects()` when promoting a project.
**Why bad:** The object reference may be shared, mutations are invisible, and it creates a confusing read path where the config in memory doesn't match the file on disk.
**Instead:** Module-level `let currentConfig` that is explicitly reassigned after successful file write. Both timers read `currentConfig` at cycle start, capturing a snapshot.

### Anti-Pattern 3: File Lock for Config Writes

**What:** Using OS-level file locks (`flock`, `lockfile`) for mc.config.json writes.
**Why bad:** Single-user, single-process system. File locks add platform-specific complexity for no benefit. The only writer is MC itself.
**Instead:** In-process Promise-chain mutex. Simple, portable, sufficient.

### Anti-Pattern 4: Storing Star Categories Locally as Primary Store

**What:** Only saving star intent in the `discovered_projects` table, ignoring GitHub star lists.
**Why bad:** Misses the design intent -- GitHub star lists ARE the canonical store. MC is the triage UI, not the database.
**Instead:** Write to GitHub star lists as primary, fall back to local DB only when the GitHub API is unavailable. Mark fallback entries for retry on next scan cycle.

### Anti-Pattern 5: Deep Scanning or Recursive Find

**What:** `find ~/ -name .git` without `-maxdepth 2`.
**Why bad:** Will scan inside node_modules, nested git repos, monorepo subdirectories, and take minutes to complete.
**Instead:** Always use `-maxdepth 2`. The spec is explicit about this. Combined with `ignorePaths` defaults, this keeps scans under 2 seconds.

## Integration Dependency Graph

```
Phase 1: Data Foundation
  schema.ts changes (new table)
  migration 0006
  queries/discoveries.ts (CRUD)
  config.ts changes (discovery section schema)
  config-writer.ts (new, mutex write)
  shared/schemas/discovery.ts (new Zod schemas)

Phase 2: Discovery Engine
  discovery-scanner.ts (new service)
    depends on: queries/discoveries.ts, config.ts, event-bus.ts
  index.ts changes (second timer)
    depends on: discovery-scanner.ts, config.ts changes

Phase 3: API Routes
  routes/discoveries.ts (new)
    depends on: queries/discoveries.ts, config-writer.ts, discovery-scanner.ts
  app.ts changes (route registration)
    depends on: routes/discoveries.ts
  projects.ts changes (discoveryCount in response)
    depends on: queries/discoveries.ts

Phase 4: Dashboard Integration
  use-discoveries.ts (new hook)
    depends on: API routes (Phase 3), shared schemas
  discovery-section.tsx + discovery-card.tsx (new components)
    depends on: use-discoveries.ts
  promote-form.tsx + star-categorize.tsx (new components)
    depends on: API routes (Phase 3)
  App.tsx changes (layout integration)
    depends on: all new components
  use-sse.ts changes (new event handlers)
    depends on: event-bus.ts changes (Phase 1)

Phase 5: Star Intelligence
  GitHub star list management (in discovery-scanner.ts or separate star-manager.ts)
    depends on: discovery-scanner.ts (Phase 2), routes (Phase 3)
  Star triage UI (star-categorize.tsx)
    depends on: Phase 4 components
```

## Suggested Build Order

Based on the dependency graph above, the build order that minimizes blocked work:

1. **Data foundation first:** Schema, migration, query functions, config extension, shared schemas. Everything else depends on this layer existing.

2. **Discovery engine second:** The scanner service with all 4 sources. Can be tested end-to-end with manual invocation before the API layer exists. Write unit tests with mocked exec/SSH output.

3. **API routes third:** Expose discovery data and actions. The promote flow is the most complex route (config write + project upsert + status update). Test with curl/httpie before building UI.

4. **Dashboard fourth:** UI components, hooks, SSE integration. Build card components first, then promote/dismiss actions, then the section container with conditional visibility.

5. **Star intelligence last:** Depends on the discovery engine finding stars and the dashboard rendering them. Star list management (GitHub Lists API) is the riskiest integration -- verify API availability during Phase 2 research, build the fallback-first approach.

## Scalability Considerations

| Concern | Current Scale | v1.2 Addition | Mitigation |
|---------|--------------|---------------|------------|
| Scan duration | 33 projects, ~3s | +filesystem find (1-2s), +GitHub API (1-2s) | All sources parallel, p-limit(10) |
| Database size | ~5 tables, <1MB | +1 table, ~100 rows max | Negligible |
| SSH connections | 1 per 5-min cycle | +1 per 30-min cycle | Batched commands, single connection |
| GitHub API calls | ~33 per 5-min (isPublic checks, cached) | +2-4 per 30-min (org repos + stars) | Well within rate limits |
| Config file writes | Never (read-only) | ~1-2 per day (promotes) | Mutex, re-read, validate |
| SSE events | ~6 types | +2 types | Same channel, negligible |
| Dashboard queries | 5-6 on mount | +1 (discoveries, conditional) | Only when new discoveries exist |

## Sources

- v1.2 Design Spec: `docs/superpowers/specs/2026-03-15-auto-discovery-star-intelligence-design.md` (rev 2)
- Existing codebase analysis: `packages/api/src/services/project-scanner.ts`, `packages/api/src/index.ts`, `packages/api/src/app.ts`, `packages/api/src/db/schema.ts`, `packages/api/src/lib/config.ts`
- Architecture patterns extracted from v1.0 + v1.1 implementation
- Confidence: HIGH -- this is integration research into a known codebase with a detailed design spec
