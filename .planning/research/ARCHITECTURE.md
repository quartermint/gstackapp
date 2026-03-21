# Architecture Patterns

**Domain:** Cross-project intelligence, iOS companion app, and knowledge unification integrated into existing Hono/SQLite/React/MCP platform
**Researched:** 2026-03-21

## Recommended Architecture

v1.4 adds three pillars (Cross-Project Intelligence, iOS Companion, Knowledge Unification) plus one dashboard enhancement. The integration strategy continues the v1.0-v1.3 pattern: **new services extend the existing scan-persist-emit pipeline, new health check types plug into the established `projectHealth` table, new API routes register via factory functions in `app.ts`, and new MCP tools follow the thin-HTTP-wrapper pattern.**

No new databases, no new runtimes, no new transport protocols. Every capability slots into the existing architecture.

```
                                    +--------------------------+
                                    |   iOS Companion App      |
                                    |   (SwiftUI + Core Data)  |
                                    |   ~/mission-control-ios  |
                                    +------+-------------------+
                                           | HTTP
                                           | /api/*
                                           |
+---+           SSH (CLAUDE.md cat)  +-----v-----------------------+
| ~ |  ----------------------------> |                             |
|Mac|   SSH (git health data)        |      Hono API (:3000)       |
|Mini|  ----------------------------> |                             |
+---+                                |  NEW SERVICES:              |     +-----------------------+
                                     |  +-- knowledge-service.ts   |     |  React Dashboard      |
+---+                                |  +-- convention-service.ts  |     |  NEW:                 |
|mc |   HTTP                         |  +-- dependency-service.ts  |<--->|  +-- d3-force graph   |
|cli|  ----------------------------> |  +-- visit-service.ts       | SSE |  +-- last-visit strip |
+---+   /api/*                       |                             |     |  +-- dep health cards |
                                     |  NEW ROUTES:                |     +-----------------------+
+-----+                              |  +-- routes/knowledge.ts    |
|MCP  |  HTTP                        |  +-- routes/conventions.ts  |
|svr  | ----------------------------> |  +-- routes/dependencies.ts|
+-----+  /api/*                      |                             |
                                     |  MODIFIED:                  |
+----------+                         |  +-- config.ts (dependsOn)  |
|Claude    |  HTTP                   |  +-- git-health.ts (+3 chks)|
|Code Hook |  /sessions/hook/*       |  +-- project-scanner.ts     |
+----------+ -----------------------> |  +-- event-bus.ts (+events) |
                                     +---+------+--+---------------+
                                         |      |  |
                                   write |  SSE |  | read CLAUDE.md
                                         v      v  v (SSH + local)
                                     +----------+
                                     | SQLite   |
                                     | NEW:     |
                                     | knowledge|
                                     | conventions|
                                     +----------+
```

### Integration Strategy: Extend, Do Not Replace

All 10 capabilities integrate by extending existing patterns:

1. **Dependency schema** (`dependsOn` in `mc.config.json`) -- Extends `projectEntrySchema` and `multiCopyEntrySchema` in `config.ts`. The dependency graph is derived from config at load time, not stored in SQLite.
2. **New health check types** -- Three new `checkType` values (`dependency_impact`, `convention_violation`, `stale_knowledge`) plug into the existing `projectHealth` table. The `upsertHealthFinding` / `resolveFindings` / `getActiveFindings` pipeline handles them without modification.
3. **CLAUDE.md aggregation** -- New `knowledge-service.ts` reads CLAUDE.md content via `readFileSync` (local) and `ssh cat` (Mac Mini), same SSH pattern as `discovery-scanner.ts`. Content-hash caching prevents redundant reads.
4. **Convention anti-pattern registry** -- Config-driven string matching in `convention-service.ts` that runs during the scan cycle. Produces `convention_violation` health findings via the existing pipeline.
5. **iOS companion** -- Sibling repo `~/mission-control-ios` calling the same `/api/*` endpoints. No API changes needed for basic read operations. Offline capture queue via Core Data with foreground HTTP sync.
6. **Core Data offline queue** -- iOS-side only. Queue entity with `rawContent`, `createdAt`, `synced` flag. Foreground flush POSTs to `POST /api/captures`.
7. **d3-force graph** -- New React component in `packages/web`. Consumes dependency data from `GET /api/dependencies` (derived from config). Only dependency: `d3-force` (~40KB, already approved in PROJECT.md).
8. **MCP knowledge tools** -- Three new tools (`project_knowledge`, `convention_check`, `cross_project_search`) following the established thin-HTTP-wrapper pattern in `packages/mcp`.
9. **Enhanced session startup hook** -- Extends `/sessions/hook/start` response to include project knowledge context (CLAUDE.md excerpt, active conventions, dependency status). No new endpoint needed.
10. **"Changes since last visit"** -- Client-side `localStorage` timestamp compared against API data. New `GET /api/changes-since?since=<ISO>` endpoint returns projects with commits/captures/findings after the timestamp.

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|-------------|
| **Knowledge Service** (`services/knowledge-service.ts`) | Read CLAUDE.md files, parse sections, cache by content hash | SSH, filesystem, DB | **NEW** |
| **Convention Service** (`services/convention-service.ts`) | Scan projects for anti-pattern violations | Config, Knowledge Service, Health DB | **NEW** |
| **Dependency Service** (`services/dependency-service.ts`) | Build dependency graph from config, detect impact chains | Config, Commits DB, Health DB | **NEW** |
| **Visit Service** (`services/visit-service.ts`) | Track and serve changes since a given timestamp | Commits DB, Captures DB, Health DB | **NEW** |
| **Knowledge Routes** (`routes/knowledge.ts`) | CLAUDE.md content, cross-project search | Knowledge Service | **NEW** |
| **Convention Routes** (`routes/conventions.ts`) | Convention list, violation feed | Convention Service | **NEW** |
| **Dependency Routes** (`routes/dependencies.ts`) | Dependency graph, impact analysis | Dependency Service | **NEW** |
| **Changes Route** (`routes/changes.ts`) | Changes-since-last-visit data | Visit Service | **NEW** |
| **D3-Force Graph** (`components/graph/dependency-graph.tsx`) | Interactive force-directed project graph | Dependency Routes | **NEW** |
| **Last Visit Strip** (`components/whats-new/last-visit-strip.tsx`) | Highlight mode for changed projects | Changes Route, localStorage | **NEW** |
| **MCP Knowledge Tools** (`mcp/tools/project-knowledge.ts` etc.) | project_knowledge, convention_check, cross_project_search | API via HTTP | **NEW** |
| **iOS App** (`~/mission-control-ios/`) | SwiftUI dashboard, share sheet capture, offline queue | API via HTTP | **NEW (sibling repo)** |
| **Config** (`lib/config.ts`) | `dependsOn` field on project entries, `conventions` config section | Config schema | **MODIFIED** |
| **Git Health** (`services/git-health.ts`) | Three new check functions for dependency/convention/knowledge | Health pipeline | **MODIFIED** |
| **Project Scanner** (`services/project-scanner.ts`) | Call knowledge + convention + dependency checks in post-scan | New services | **MODIFIED** |
| **Event Bus** (`services/event-bus.ts`) | Add knowledge/convention/dependency/visit event types | SSE route | **MODIFIED** |
| **Session Routes** (`routes/sessions.ts`) | Enrich hook/start response with knowledge context | Knowledge Service | **MODIFIED** |
| **Health Schema** (`shared/schemas/health.ts`) | Extend `healthCheckTypeEnum` with 3 new values | Shared types | **MODIFIED** |
| **MCP Index** (`mcp/index.ts`) | Register 3 new tools | MCP server | **MODIFIED** |
| **App** (`app.ts`) | Register 4 new route groups | Route chain | **MODIFIED** |
| **useSSE Hook** (`hooks/use-sse.ts`) | Add callbacks for new event types | Dashboard | **MODIFIED** |
| **Dashboard App** (`App.tsx`) | Integrate graph component, last-visit strip | New components | **MODIFIED** |

### What Does NOT Change

These components need zero modification:

- **Capture pipeline** (iOS POSTs to the same `POST /api/captures` -- zero changes)
- **SSE streaming mechanism** (generic `MCEvent` forwarding handles all new event types automatically)
- **Search and FTS5** (knowledge content can be indexed later; v1.4 uses direct queries)
- **Budget tracking and LM Studio probe** (orthogonal to all v1.4 features)
- **CLI package** (existing `mc capture` / `mc status` work as-is; new commands are additive)
- **Tailwind theming and design system** (d3-force graph uses SVG with Tailwind colors)
- **Hono RPC client pattern** (new routes chain onto `app.ts` like all others)
- **Discovery engine** (v1.3 auto-discovery is independent of dependency tracking)
- **Star intelligence** (v1.3 star system is independent of knowledge unification)

## Data Flow

### Dependency Impact Detection Flow

```
1. Config loaded at startup
   -> projectEntrySchema now includes optional `dependsOn: string[]` (slugs)
   -> dependency-service.ts builds adjacency list from config
   -> Graph is held in memory (not stored in SQLite -- it's derived data)

2. Post-scan health phase fires (EXISTING, every 5 minutes)
   -> dependency-service.ts runs AFTER per-repo health checks:
      a. For each project with dependencies:
         - Look at commit timestamps of dependsOn targets since last scan
         - If a dependency committed since the dependent's last scan:
           -> Upsert `dependency_impact` health finding on the dependent project
           -> Detail: "cocobanana committed since last nexusclaw scan"
           -> Severity: warning (informational, user decides action)
      b. Findings auto-resolve when dependent project is next scanned

3. Dashboard risk feed shows dependency impact cards
   -> Same rendering as existing health cards (no new component needed)
   -> Risk card links to both projects

4. MCP convention_check tool reports dependency status
   -> Claude Code sessions see which dependencies have changed
```

### CLAUDE.md Knowledge Aggregation Flow

```
1. Post-scan health phase fires (every 5 minutes)
   -> knowledge-service.ts runs for each project in config:
      a. Read CLAUDE.md:
         - Local: readFileSync(join(projectPath, "CLAUDE.md"))
         - Mac Mini: ssh cat "${projectPath}/CLAUDE.md"
         - GitHub: gh api repos/{owner}/{repo}/contents/CLAUDE.md (base64 decode)
      b. Compute SHA-256 content hash
      c. Compare against stored hash in knowledge table
      d. If changed: parse sections, store raw + parsed, update hash
      e. If unchanged: skip (content-hash caching)

2. knowledge table schema:
   - projectSlug (PK alongside host)
   - contentHash (SHA-256 of raw content)
   - rawContent (full CLAUDE.md text)
   - parsedSections (JSON: { overview, commands, testing, etc. })
   - lastReadAt (timestamp)
   - commitAge (days since CLAUDE.md was last modified via git log)

3. Stale knowledge detection:
   -> Compare CLAUDE.md last-modified (git log) with project commit activity
   -> If project has 50+ commits since CLAUDE.md was touched:
      -> Upsert `stale_knowledge` health finding
      -> Severity: info (nudge, not actionable alert)

4. API endpoint: GET /api/knowledge/:slug
   -> Returns parsed sections for a project
   -> Used by MCP tools and session startup enrichment

5. API endpoint: GET /api/knowledge/search?q=<query>
   -> Full-text search across all stored CLAUDE.md content
   -> Returns matching sections with project context
```

### Convention Enforcement Flow

```
1. Config defines conventions in mc.config.json:
   {
     "conventions": {
       "antiPatterns": [
         {
           "id": "no-any",
           "pattern": "as any",
           "scope": "*.ts",
           "severity": "warning",
           "message": "Avoid 'as any' -- use 'as unknown' instead"
         },
         {
           "id": "no-env-commit",
           "pattern": "\\.env$",
           "scope": "CLAUDE.md",
           "severity": "critical",
           "message": "CLAUDE.md references .env file directly"
         }
       ]
     }
   }

2. Convention service runs during post-scan phase:
   -> For each project:
      a. Read CLAUDE.md content (from knowledge cache)
      b. For each anti-pattern in config:
         - If scope matches "CLAUDE.md": check CLAUDE.md content
         - If scope matches "*.ts": defer (scan-time source analysis deferred)
      c. Pattern matching: simple string.includes() or RegExp
      d. If match found:
         -> Upsert `convention_violation` health finding
         -> metadata: { conventionId, matchedText, file }
      e. If no match and existing finding: auto-resolves via resolveFindings

3. Dashboard shows convention violations in risk feed
   -> Uses existing health card rendering
   -> Convention violations are filterable by severity

4. MCP convention_check tool:
   -> Input: { projectSlug }
   -> Returns: active violations + convention summary for the project
```

### iOS Companion Data Flow

```
1. Share Sheet Extension (iOS)
   -> User shares link/text from any app
   -> Extension writes to Core Data queue:
     CaptureQueueItem {
       id: UUID
       rawContent: String
       type: "text" | "link"
       createdAt: Date
       syncStatus: "pending"
       projectSlug: String? (explicit assignment optional)
     }
   -> If Tailscale reachable: immediate POST /api/captures
   -> If offline: stays in queue

2. Widget Capture (iOS)
   -> Tap widget -> text field -> type/dictate -> send
   -> Same flow: Core Data queue -> sync when reachable

3. Voice Capture (iOS)
   -> Apple Speech framework (SFSpeechRecognizer), max 60s
   -> Transcription stored as rawContent (type: "voice")
   -> Audio file stored locally in app container (not synced to API)
   -> Transcription text syncs to API via same queue

4. Foreground Sync (iOS)
   -> On app launch / foregrounding:
      a. Flush pending queue items to POST /api/captures
      b. GET /api/projects -> populate local project list
      c. GET /api/risks -> populate risk summary
      d. GET /api/captures?limit=20 -> recent captures
   -> No background sync in v1.4 (foreground-only per PROJECT.md decision)

5. Dashboard (iOS)
   -> Native SwiftUI list grouped by Active/Idle/Stale (mirrors web)
   -> Tap project -> detail view with commits, captures, health
   -> Pull-to-refresh triggers full sync
```

### "Changes Since Last Visit" Flow

```
1. Dashboard loads (App.tsx)
   -> Read localStorage key "mc:last-visit" (ISO timestamp)
   -> GET /api/changes-since?since=<ISO>
   -> API returns:
     {
       changedProjects: [
         {
           slug: "openefb",
           changes: {
             newCommits: 3,
             newCaptures: 1,
             newFindings: 2,
             resolvedFindings: 1
           }
         }
       ],
       totalChanges: 7
     }

2. Dashboard highlight mode (first render only):
   -> Changed project rows get a subtle left border accent
   -> Change count badge floats next to project name
   -> Auto-fades after 30 seconds or on first interaction
   -> localStorage timestamp updated to current time

3. No SSE integration needed:
   -> Last-visit is purely a "what happened while away" feature
   -> Only computed once on page load, not reactive
```

## Database Schema Design

### New Table: knowledge

```sql
CREATE TABLE knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_slug TEXT NOT NULL,
  host TEXT NOT NULL DEFAULT 'local',  -- where content was read from
  content_hash TEXT NOT NULL,          -- SHA-256 of raw content
  raw_content TEXT NOT NULL,           -- full CLAUDE.md text
  parsed_sections TEXT,                -- JSON: { overview, commands, testing, ... }
  file_modified_at TEXT,               -- git log timestamp of CLAUDE.md
  last_read_at TEXT NOT NULL,          -- when MC last read the file
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_slug)                 -- one knowledge record per project
);

CREATE INDEX knowledge_slug_idx ON knowledge(project_slug);
CREATE INDEX knowledge_hash_idx ON knowledge(content_hash);
```

### New Table: conventions

```sql
CREATE TABLE conventions (
  id TEXT PRIMARY KEY,                 -- config-defined ID (e.g., "no-any")
  pattern TEXT NOT NULL,               -- string or regex pattern
  scope TEXT NOT NULL DEFAULT '*',     -- file glob scope
  severity TEXT NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

**Note:** The `conventions` table is optional -- conventions can be read directly from config at runtime. The table exists only if we want to track user-modified enable/disable state per convention. For v1.4, reading from config is sufficient. If conventions become user-editable, add the table later.

### Existing Tables: No Schema Changes

The 10 capabilities require zero schema changes to existing tables:

- **projectHealth** -- Already has flexible `checkType` (TEXT) and `metadata` (TEXT/JSON). Three new check types (`dependency_impact`, `convention_violation`, `stale_knowledge`) work with zero schema migration.
- **projects** -- No new columns. Dependency graph is derived from config, not stored.
- **sessions** -- No new columns. Session startup enrichment adds data to the HTTP response, not the DB.
- **commits** -- No changes. Dependency impact detection reads existing commit timestamps.
- **captures** -- No changes. iOS POSTs to the same endpoint with the same schema.

### Schema Design Rationale

- **`knowledge` table separate from `projects`**: CLAUDE.md content is large (1-10KB per project). Storing it in the `projects` table would bloat every project query. Separate table with content-hash caching means reads are fast and writes are rare.
- **`knowledge` uses TEXT timestamps throughout**: Consistent with `projectHealth` and `projectCopies` patterns.
- **No `dependencies` table**: The dependency graph is small (35 projects, max ~50 edges), changes only when config changes, and is needed in-memory for graph analysis. Storing it in SQLite adds complexity without benefit. Derive from config at load time.
- **No new columns on `projects` for `dependsOn`**: Dependency data lives in config, not in the scanned state. The projects table represents scanner output; dependencies are user-declared configuration.
- **`conventions` table is optional**: Config-driven conventions are simpler. A table makes sense only if conventions become user-editable through the dashboard. For v1.4, read from config.

## Patterns to Follow

### Pattern 1: Content-Hash Caching for CLAUDE.md Reads

**What:** Read file content, compute SHA-256 hash, compare against stored hash. Only parse and store when content actually changes.
**When:** CLAUDE.md aggregation during scan cycle.
**Why:** CLAUDE.md files change rarely (weekly at most) but scans run every 5 minutes. Content-hash caching means 99%+ of reads result in zero DB writes.

```typescript
import { createHash } from "node:crypto";

export async function aggregateKnowledge(
  db: DrizzleDb,
  sqlite: Database.Database,
  projectSlug: string,
  content: string,
  fileModifiedAt: string | null
): Promise<boolean> {
  const hash = createHash("sha256").update(content).digest("hex");

  // Check existing record
  const existing = sqlite
    .prepare("SELECT content_hash FROM knowledge WHERE project_slug = ?")
    .get(projectSlug) as { content_hash: string } | undefined;

  if (existing?.content_hash === hash) {
    // Content unchanged -- update last_read_at only
    sqlite
      .prepare("UPDATE knowledge SET last_read_at = ? WHERE project_slug = ?")
      .run(new Date().toISOString(), projectSlug);
    return false; // no change
  }

  // Content changed -- parse sections and upsert
  const parsed = parseClaudeMdSections(content);
  const now = new Date().toISOString();

  sqlite
    .prepare(`INSERT INTO knowledge
      (project_slug, content_hash, raw_content, parsed_sections, file_modified_at, last_read_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_slug) DO UPDATE SET
        content_hash = excluded.content_hash,
        raw_content = excluded.raw_content,
        parsed_sections = excluded.parsed_sections,
        file_modified_at = excluded.file_modified_at,
        last_read_at = excluded.last_read_at,
        updated_at = excluded.updated_at`)
    .run(projectSlug, hash, content, JSON.stringify(parsed), fileModifiedAt, now, now, now);

  return true; // content changed
}
```

### Pattern 2: Config-Derived In-Memory Graph

**What:** Build adjacency list from `mc.config.json` at startup and on config reload. No database storage.
**When:** Dependency graph for cross-project impact detection and d3-force visualization.
**Why:** The graph is small (35 nodes, ~50 edges), changes only when config changes, and needs to be traversed in-memory for impact chain analysis.

```typescript
interface DependencyGraph {
  /** Maps slug -> set of slugs it depends on */
  dependsOn: Map<string, Set<string>>;
  /** Maps slug -> set of slugs that depend on it (reverse) */
  dependedOnBy: Map<string, Set<string>>;
}

export function buildDependencyGraph(config: MCConfig): DependencyGraph {
  const dependsOn = new Map<string, Set<string>>();
  const dependedOnBy = new Map<string, Set<string>>();

  for (const entry of config.projects) {
    const slug = entry.slug;
    const deps = ("dependsOn" in entry && entry.dependsOn) || [];

    if (deps.length > 0) {
      dependsOn.set(slug, new Set(deps));
      for (const dep of deps) {
        if (!dependedOnBy.has(dep)) dependedOnBy.set(dep, new Set());
        dependedOnBy.get(dep)!.add(slug);
      }
    }
  }

  return { dependsOn, dependedOnBy };
}
```

### Pattern 3: Extending healthCheckTypeEnum (Zero Migration)

**What:** Add new `checkType` string values to the Zod enum in `shared/schemas/health.ts`. The SQLite column is `TEXT` -- no migration needed.
**When:** Adding `dependency_impact`, `convention_violation`, `stale_knowledge`.
**Why:** The health pipeline is designed for extensibility. `upsertHealthFinding` takes any string checkType. The enum in shared types provides TypeScript safety without constraining the database.

```typescript
// In shared/schemas/health.ts
export const healthCheckTypeEnum = z.enum([
  // Existing (v1.0-v1.3)
  "unpushed_commits",
  "no_remote",
  "broken_tracking",
  "remote_branch_gone",
  "unpulled_commits",
  "dirty_working_tree",
  "diverged_copies",
  "session_file_conflict",
  "convergence",
  // New (v1.4)
  "dependency_impact",
  "convention_violation",
  "stale_knowledge",
]);
```

### Pattern 4: Session Hook Response Enrichment

**What:** Extend the `POST /sessions/hook/start` response JSON with knowledge context. No new endpoint.
**When:** Claude Code session startup.
**Why:** The startup hook response already contains `session` + optional `budgetContext`. Adding `knowledgeContext` follows the same pattern -- the hook consumer (Claude Code) reads what it needs from the response.

```typescript
// In sessions.ts hook/start handler, after budgetContext:
const knowledgeContext = buildKnowledgeContext(db, projectSlug);

return c.json({
  session,
  ...(budgetContext && { budgetContext }),
  ...(knowledgeContext && { knowledgeContext }),
}, 201);

function buildKnowledgeContext(
  db: DrizzleDb,
  projectSlug: string | null
): { claudeMd: string; conventions: string[]; dependencies: string[] } | undefined {
  if (!projectSlug) return undefined;

  const knowledge = getKnowledge(db, projectSlug);
  if (!knowledge) return undefined;

  const conventions = getActiveViolations(db, projectSlug);
  const deps = getDependencyStatus(db, projectSlug);

  return {
    claudeMd: knowledge.rawContent.slice(0, 2000), // First 2KB for banner
    conventions: conventions.map(v => v.message),
    dependencies: deps.map(d => `${d.slug}: ${d.status}`),
  };
}
```

### Pattern 5: iOS API Client (Same Pattern as CLI/MCP)

**What:** The iOS app calls the same `/api/*` endpoints using `URLSession`. No authentication (Tailscale network boundary). Same JSON schemas.
**When:** All iOS network operations.
**Why:** API-first architecture means iOS is just another client. The API doesn't know or care that the request comes from an iPhone.

```swift
// In MissionControlAPI.swift (iOS):
class MissionControlAPI {
    private let baseURL: URL

    init(baseURL: URL = URL(string: "http://100.x.x.x:3000")!) {
        self.baseURL = baseURL
    }

    func createCapture(rawContent: String, projectSlug: String? = nil) async throws -> CaptureResponse {
        var request = URLRequest(url: baseURL.appendingPathComponent("/api/captures"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = CreateCaptureRequest(rawContent: rawContent, projectSlug: projectSlug)
        request.httpBody = try JSONEncoder().encode(body)

        let (data, _) = try await URLSession.shared.data(for: request)
        return try JSONDecoder().decode(CaptureResponse.self, from: data)
    }
}
```

### Pattern 6: d3-force with React (Controlled Rendering)

**What:** Use `d3-force` for physics simulation only. React renders SVG nodes. d3 does not touch the DOM.
**When:** Dependency graph visualization.
**Why:** Letting d3 manage DOM directly conflicts with React's virtual DOM. The established pattern is: d3 computes positions, React renders.

```typescript
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from "d3-force";

interface GraphNode { slug: string; x: number; y: number; }
interface GraphLink { source: string; target: string; }

function useDependencyGraph(nodes: GraphNode[], links: GraphLink[]) {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());

  useEffect(() => {
    const simulation = forceSimulation(nodes)
      .force("link", forceLink(links).id((d: GraphNode) => d.slug).distance(80))
      .force("charge", forceManyBody().strength(-200))
      .force("center", forceCenter(width / 2, height / 2))
      .force("collide", forceCollide(30));

    simulation.on("tick", () => {
      const pos = new Map<string, { x: number; y: number }>();
      for (const node of nodes) {
        pos.set(node.slug, { x: node.x, y: node.y });
      }
      setPositions(new Map(pos));
    });

    return () => { simulation.stop(); };
  }, [nodes, links]);

  return positions;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Storing Dependency Graph in SQLite

**What:** Creating a `project_dependencies` join table to store slug-to-slug relationships.
**Why bad:** Dependencies are user-declared configuration, not scanner-discovered state. Storing them in SQLite means two sources of truth (config vs DB), sync headaches, and no benefit -- the graph is small enough to hold in memory.
**Instead:** Derive the graph from `mc.config.json` at load time. Hold in module-level variable. Rebuild on config reload. The `dependsOn` field on each project entry is the single source of truth.

### Anti-Pattern 2: CLAUDE.md Aggregation on Every Scan Tick

**What:** Reading 35+ CLAUDE.md files (including SSH reads) every 5 minutes.
**Why bad:** SSH reads cost 200-500ms each. 15+ Mac Mini projects = 3-7 seconds of SSH overhead per scan cycle. CLAUDE.md files change at most weekly.
**Instead:** Content-hash caching. On first read, store content + SHA-256 hash. On subsequent reads, check if file modification time changed (fast `stat` call), only read content if mtime changed. For SSH reads, batch into a single SSH command: `stat -f "%m" CLAUDE.md` for all Mac Mini projects in one call, then read only changed files.

### Anti-Pattern 3: iOS Background Sync

**What:** Implementing `BGAppRefreshTask` or `BGProcessingTask` for iOS background fetch.
**Why bad:** Background modes require entitlements, push notification infrastructure, and significant testing. For a single-user app on Tailscale, the complexity is disproportionate to the value.
**Instead:** Foreground sync only. Flush queue on `scenePhase == .active`. Pull-to-refresh for manual sync. If the app is open, sync. If it's not open, captures queue locally. This matches the PROJECT.md decision: "iOS foreground-only sync."

### Anti-Pattern 4: D3 Manipulating the DOM Directly

**What:** Using `d3.select(svgRef).append("circle")...` inside a React component.
**Why bad:** D3's DOM manipulation conflicts with React's virtual DOM reconciliation. Stale references, memory leaks, rendering glitches.
**Instead:** Use d3-force for physics simulation only (node positions, link forces). React renders SVG elements based on simulation state. d3 never touches `document` or `element.append`. This is the established "React + d3" pattern documented across the ecosystem.

### Anti-Pattern 5: Convention Enforcement at Runtime (Tool Call Interception)

**What:** Intercepting Claude Code tool calls via MCP middleware to enforce conventions in real-time.
**Why bad:** Adds latency to every tool call, requires MCP protocol interception (fragile), and creates a blocking enforcement model that Claude Code may not handle gracefully. PROJECT.md explicitly defers this.
**Instead:** Scan-time enforcement only. The convention service checks CLAUDE.md content during the 5-minute scan cycle. Violations surface as health findings in the risk feed and MCP banner. Claude Code sees violations at session start, not at tool-call time.

### Anti-Pattern 6: Separate Auth System for iOS

**What:** Building JWT auth, user registration, or API key management for the iOS app.
**Why bad:** Single user, single Mac Mini, Tailscale network boundary. Auth adds complexity with zero security benefit in this context. Phone theft threat model: revoke Tailscale device, not rotate API tokens.
**Instead:** Same trust model as the browser. Tailscale IP range is the access control. If multi-user is needed later, add auth at that point -- the API-first architecture makes this a clean addition.

### Anti-Pattern 7: Embedding d3 into a WebView on iOS

**What:** Using WKWebView to render the d3-force graph on iOS.
**Why bad:** WKWebView lacks native scroll physics, haptics, and gestures. It's also unnecessary -- iOS doesn't need the dependency graph visualization in v1.4. The iOS dashboard is a simple project list with capture and risk summary.
**Instead:** iOS gets a native SwiftUI list view. The d3-force graph is a web dashboard feature only. If iOS needs graph visualization later, use a native Swift charting library.

## New SSE Event Types

Extend `MCEventType` in `event-bus.ts`:

```typescript
export type MCEventType =
  | /* ... existing v1.0-v1.3 events ... */
  // v1.4 Knowledge events
  | "knowledge:updated"        // CLAUDE.md content changed for a project
  | "knowledge:stale"          // CLAUDE.md freshness alert
  // v1.4 Convention events
  | "convention:violation"     // new convention violation detected
  | "convention:resolved"      // convention violation resolved
  // v1.4 Dependency events
  | "dependency:impact"        // dependency committed, downstream may need update
```

Note: No new SSE events for iOS or "changes since last visit" -- iOS uses pull-based sync, and last-visit is computed on page load (not reactive).

## New API Endpoints

| Method | Path | Purpose | Notes |
|--------|------|---------|-------|
| GET | `/api/knowledge/:slug` | CLAUDE.md content for a project | Parsed sections + raw |
| GET | `/api/knowledge/search` | Cross-project CLAUDE.md search | `?q=<query>` full-text |
| GET | `/api/conventions` | List all configured conventions | From config |
| GET | `/api/conventions/violations` | Active convention violations | Filter by project/severity |
| GET | `/api/dependencies` | Dependency graph (nodes + edges) | Derived from config |
| GET | `/api/dependencies/:slug/impact` | Impact analysis for a project | Who depends on this? |
| GET | `/api/changes-since` | Changes since timestamp | `?since=<ISO>` |

**Existing endpoints consumed by iOS (no changes needed):**
- `POST /api/captures` -- capture creation
- `GET /api/projects` -- project list with scan data
- `GET /api/projects/:slug` -- project detail
- `GET /api/captures` -- capture list
- `GET /api/risks` -- risk summary
- `GET /api/health-checks/:slug` -- per-project findings

**Existing endpoint modified:**
- `POST /sessions/hook/start` -- response enriched with `knowledgeContext` field

## Config Extension

### dependsOn Field

Add `dependsOn` to both `projectEntrySchema` and `multiCopyEntrySchema`:

```typescript
// In config.ts:
export const projectEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  path: z.string(),
  host: z.enum(["local", "mac-mini", "github"]),
  tagline: z.string().optional(),
  repo: z.string().optional(),
  dependsOn: z.array(z.string()).optional(), // NEW: slugs of dependencies
});

export const multiCopyEntrySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string().optional(),
  repo: z.string().optional(),
  dependsOn: z.array(z.string()).optional(), // NEW
  copies: z.array(z.object({
    host: z.enum(["local", "mac-mini"]),
    path: z.string(),
  })).min(1),
});
```

Example in `mc.config.json`:

```json
{
  "name": "NexusClaw",
  "slug": "nexusclaw",
  "path": "/Users/ryanstern/nexusclaw",
  "host": "local",
  "tagline": "Native iOS client for ZeroClaw AI gateway",
  "dependsOn": ["mission-control"]
}
```

### Conventions Config Section

```typescript
const conventionPatternSchema = z.object({
  id: z.string().min(1),
  pattern: z.string().min(1),       // string match or /regex/
  scope: z.string().default("*"),    // file glob: "CLAUDE.md", "*.ts", "*"
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  message: z.string().min(1),
});

const conventionsConfigSchema = z.object({
  antiPatterns: z.array(conventionPatternSchema).default([]),
  scanOnStartup: z.boolean().default(true),
});

// Add to mcConfigSchema:
export const mcConfigSchema = z.object({
  // ... existing fields ...
  conventions: conventionsConfigSchema.default({}),
});
```

### Knowledge Config Section

```typescript
const knowledgeConfigSchema = z.object({
  aggregateClaudeMd: z.boolean().default(true),
  staleThresholdCommits: z.number().int().min(10).default(50),
  maxContentSizeKb: z.number().int().min(1).default(50),  // skip huge CLAUDE.md files
});

// Add to mcConfigSchema:
export const mcConfigSchema = z.object({
  // ... existing fields ...
  knowledge: knowledgeConfigSchema.default({}),
});
```

## iOS Companion Architecture

### Package Structure (Sibling Repo)

```
~/mission-control-ios/
  MissionControl.xcodeproj
  MissionControl/
    App/
      MissionControlApp.swift        # @main entry, scene lifecycle
    Models/
      CaptureQueueItem.swift          # Core Data entity
      Project.swift                   # Codable model from API
      RiskSummary.swift               # Risk data from API
    Services/
      MissionControlAPI.swift         # HTTP client (URLSession)
      SyncManager.swift               # Queue flush + data fetch
      CaptureStore.swift              # Core Data stack + queue operations
    Views/
      Dashboard/
        ProjectListView.swift         # Grouped by Active/Idle/Stale
        ProjectRowView.swift          # Name, status, health dot
        RiskSummaryView.swift         # Critical + warning counts
      Capture/
        QuickCaptureView.swift        # Widget-triggered capture
        VoiceCaptureView.swift        # Speech recognition + record
      Settings/
        SettingsView.swift            # API URL, sync status
    Extensions/
      ShareExtension/
        ShareViewController.swift     # NSExtensionContext handling
        ShareExtensionView.swift      # SwiftUI share sheet UI
    Widget/
      CaptureWidget.swift             # Home screen widget
  MissionControlTests/
  MissionControlUITests/
```

### Core Data Offline Queue

```swift
// CaptureQueueItem.xcdatamodeld
entity CaptureQueueItem {
    attribute id: UUID
    attribute rawContent: String
    attribute type: String            // "text" | "link" | "voice"
    attribute projectSlug: String?
    attribute createdAt: Date
    attribute syncStatus: String      // "pending" | "syncing" | "synced" | "failed"
    attribute retryCount: Int16
    attribute lastError: String?
}
```

Sync strategy:
- **Foreground flush**: On `scenePhase == .active`, fetch all `syncStatus == "pending"`, POST each to API.
- **Serial sync**: Process queue items one at a time (not parallel) to avoid overwhelming the API.
- **Retry with backoff**: On failure, increment `retryCount`, set `syncStatus = "failed"`. Retry on next foreground.
- **Max 3 retries**: After 3 failures, mark as permanently failed. Surface in Settings view.
- **Delete after sync**: Once API confirms 201, delete from Core Data.

### Share Extension

The share extension lives in the same Xcode project as a separate target. It shares the Core Data model with the main app via App Group container.

```swift
// ShareViewController.swift
class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()

        guard let item = extensionContext?.inputItems.first as? NSExtensionItem else { return }

        // Extract text or URL from share context
        for attachment in item.attachments ?? [] {
            if attachment.hasItemConformingToTypeIdentifier("public.url") {
                attachment.loadItem(forTypeIdentifier: "public.url") { url, _ in
                    if let url = url as? URL {
                        self.saveToQueue(content: url.absoluteString, type: "link")
                    }
                }
            } else if attachment.hasItemConformingToTypeIdentifier("public.plain-text") {
                attachment.loadItem(forTypeIdentifier: "public.plain-text") { text, _ in
                    if let text = text as? String {
                        self.saveToQueue(content: text, type: "text")
                    }
                }
            }
        }
    }

    private func saveToQueue(content: String, type: String) {
        // Write to shared App Group Core Data container
        let store = CaptureStore(appGroup: "group.com.quartermint.missioncontrol")
        store.enqueue(content: content, type: type)
        extensionContext?.completeRequest(returningItems: nil)
    }
}
```

## MCP Knowledge Tools

Three new MCP tools extend the existing 6-tool server:

### project_knowledge

```typescript
// mcp/tools/project-knowledge.ts
server.registerTool("project_knowledge", {
  description: "Get CLAUDE.md content and parsed sections for a project. " +
    "Returns project overview, dev commands, architecture notes, and conventions.",
  inputSchema: {
    slug: z.string().describe("Project slug"),
  },
}, async ({ slug }) => {
  const data = await fetchApi<KnowledgeResponse>(`/api/knowledge/${slug}`);
  // Format as readable text for Claude Code context
});
```

### convention_check

```typescript
// mcp/tools/convention-check.ts
server.registerTool("convention_check", {
  description: "Check convention compliance for a project. " +
    "Returns active violations and configured anti-patterns.",
  inputSchema: {
    slug: z.string().describe("Project slug (optional, omit for all)").optional(),
  },
}, async ({ slug }) => {
  const path = slug ? `/api/conventions/violations?project=${slug}` : "/api/conventions/violations";
  const data = await fetchApi<ViolationsResponse>(path);
  // Format violations as actionable list
});
```

### cross_project_search

```typescript
// mcp/tools/cross-project-search.ts
server.registerTool("cross_project_search", {
  description: "Search across all project CLAUDE.md files for patterns, " +
    "conventions, or technical decisions. Useful for finding how other " +
    "projects solved similar problems.",
  inputSchema: {
    query: z.string().describe("Search query"),
  },
}, async ({ query }) => {
  const data = await fetchApi<SearchResponse>(`/api/knowledge/search?q=${encodeURIComponent(query)}`);
  // Format as project-grouped results
});
```

## Scalability Considerations

| Concern | At current scale (35 projects) | At 100+ projects | At 500+ projects |
|---------|------|------|------|
| CLAUDE.md reads (scan cycle) | < 1s local + < 3s SSH | Content-hash eliminates most reads | Need batched SSH stat checks |
| Knowledge table size | ~35 rows, ~200KB total | ~100 rows, ~500KB | Need content size limits |
| Convention scanning | < 100ms (string matching) | < 500ms | Need per-project scope filtering |
| Dependency graph computation | < 1ms (35 nodes) | < 5ms | Fine at any realistic scale |
| d3-force simulation | Smooth at 35 nodes | Smooth at 100 | Need canvas rendering > 200 |
| iOS queue depth | ~10 items max (foreground flush) | Same (single user) | Same |
| Changes-since query | < 50ms (indexed by timestamp) | < 100ms | Need composite index |

## Suggested Build Order

Based on dependency analysis across all three pillars:

```
Phase 1: Config Foundation (dependsOn + conventions + knowledge config)
  - Add dependsOn to projectEntrySchema + multiCopyEntrySchema
  - Add conventions config section
  - Add knowledge config section
  - Extend healthCheckTypeEnum with 3 new values
  - Tests for config schema backward compatibility
  - Depends on: nothing (pure schema additions)

Phase 2: Knowledge Service + CLAUDE.md Aggregation
  - knowledge table (Drizzle schema + migration)
  - knowledge-service.ts (read, parse, cache by content hash)
  - SSH batched CLAUDE.md reads (extends existing SSH pattern)
  - Integration into post-scan phase
  - knowledge routes (GET /api/knowledge/:slug, GET /api/knowledge/search)
  - stale_knowledge health check
  - Depends on: Phase 1 (config schema)

Phase 3: Convention Service + Enforcement
  - convention-service.ts (config-driven pattern matching)
  - Integration into post-scan phase
  - convention_violation health findings
  - convention routes (GET /api/conventions, GET /api/conventions/violations)
  - Depends on: Phase 2 (reads knowledge cache for CLAUDE.md content)

Phase 4: Dependency Service + Impact Detection
  - dependency-service.ts (graph from config, impact chain analysis)
  - dependency_impact health findings
  - dependency routes (GET /api/dependencies, GET /api/dependencies/:slug/impact)
  - d3-force graph component (React dashboard)
  - Depends on: Phase 1 (dependsOn config), Phase 2 (uses scan cycle hook point)

Phase 5: MCP Knowledge Tools + Session Enrichment
  - project_knowledge MCP tool
  - convention_check MCP tool
  - cross_project_search MCP tool
  - Enhanced session startup hook response (knowledgeContext)
  - Event bus extension (knowledge/convention/dependency events)
  - Depends on: Phase 2-4 (needs all API endpoints)

Phase 6: Dashboard Enhancement (Changes Since Last Visit)
  - visit-service.ts (query changes since timestamp)
  - GET /api/changes-since endpoint
  - Last-visit strip component (localStorage + highlight mode)
  - Depends on: Phase 1 (minimal, mostly client-side)

Phase 7: iOS Companion (Parallel Track)
  - Xcode project setup (~/mission-control-ios)
  - Core Data model + offline queue
  - MissionControlAPI.swift (URLSession client)
  - SyncManager (foreground flush)
  - SwiftUI dashboard (project list, risk summary)
  - Share sheet extension (links/text capture)
  - Widget capture (3-tap flow)
  - Voice capture (Apple Speech, 60s max)
  - Depends on: existing API (no backend changes needed)
```

### Phase Ordering Rationale

1. **Config first** because all three pillars read from config extensions. Backward-compatible schema additions have zero risk.
2. **Knowledge service second** because convention checking reads CLAUDE.md content from the knowledge cache, and knowledge is the foundation for both conventions and session enrichment.
3. **Conventions third** because it depends on knowledge cache for CLAUDE.md content.
4. **Dependencies fourth** because it's independent of knowledge/conventions but benefits from the scan-cycle integration point established in Phase 2.
5. **MCP + session enrichment fifth** because it's the consumer of all Phase 2-4 APIs.
6. **Dashboard changes sixth** because it's a standalone enhancement with minimal backend dependency.
7. **iOS seventh (parallel track)** because it consumes only existing API endpoints. It can be built in parallel with Phases 2-6 since it requires zero backend changes.

### Parallelization Opportunities

- **Phase 7 (iOS)** can start in parallel with Phase 2 -- it only needs existing API endpoints.
- **Phase 4 (Dependencies)** and **Phase 3 (Conventions)** can run in parallel after Phase 2 completes.
- **Phase 6 (Last Visit)** can start in parallel with Phase 4 -- it has minimal API dependency.
- The d3-force graph component (Phase 4) is a frontend task that can overlap with backend work in Phase 3.

## Sources

- Existing MC codebase analysis (`config.ts`, `git-health.ts`, `project-scanner.ts`, `event-bus.ts`, `sessions.ts`, `app.ts`, `schema.ts`, MCP package) -- HIGH confidence
- [d3-force GitHub repository](https://github.com/d3/d3-force) -- force simulation API, HIGH confidence
- [react-force-graph](https://github.com/vasturiano/react-force-graph) -- React wrapper pattern (informational, we use raw d3-force), MEDIUM confidence
- [D3.js Force-directed Graph in 2025](https://dev.to/nigelsilonero/how-to-implement-a-d3js-force-directed-graph-in-2025-5cl1) -- contemporary integration patterns, MEDIUM confidence
- [Core Data offline sync strategies](https://ravi6997.medium.com/offline-sync-strategies-core-data-cloudkit-swiftdata-in-ios-apps-3760684567fd) -- iOS queue patterns, MEDIUM confidence
- [Handling Offline Support in iOS with Swift](https://medium.com/@kalidoss.shanmugam/handling-offline-support-and-data-synchronization-in-ios-with-swift-2130ecb3d7c1) -- foreground sync strategy, MEDIUM confidence
- [Core Data in SwiftUI 2025](https://medium.com/@bhumibhuva18/core-data-in-swiftui-2025-master-local-database-performance-and-seamless-backend-syncing-48665cf61385) -- Core Data + SwiftUI best practices, MEDIUM confidence
- PROJECT.md key decisions (iOS sibling repo, native SwiftUI, Tailscale trust, d3-force exception, scan-time enforcement only, foreground-only sync) -- HIGH confidence
