# Architecture Patterns

**Domain:** API-first personal operating environment / dashboard + universal capture
**Researched:** 2026-03-09

## Recommended Architecture

```
                        +------------------+
                        |   Tailscale VPN  |
                        +--------+---------+
                                 |
           +---------------------+---------------------+
           |                     |                     |
    +------+------+    +---------+--------+    +-------+------+
    | Web Dashboard|    | iOS Companion    |    | CLI Client   |
    | (React SPA)  |    | (Swift/SwiftUI)  |    | (capture cmd)|
    +------+------+    +---------+--------+    +-------+------+
           |                     |                     |
           +---------------------+---------------------+
                                 |
                    +------------v-----------+
                    |    Hono API Server      |  <--- The Core Product
                    | (Node.js + @hono/       |
                    |  node-server)           |
                    +------------+-----------+
                                 |
              +------------------+------------------+
              |                  |                  |
    +---------v------+  +--------v--------+  +-----v---------+
    | SQLite + FTS5  |  | File Storage    |  | AI Processing |
    | (Drizzle ORM   |  | (audio, blobs)  |  | (Claude API)  |
    | better-sqlite3)|  | (local fs)      |  | + Whisper STT  |
    | + sqlite-vec   |  +-----------------+  +---------------+
    +----------------+
              |
    +---------v------+
    | MCP Layer      |
    | Consumes:      |
    |  - portfolio-  |
    |    dashboard   |
    |  - mac-mini-   |
    |    bridge      |
    | Exposes:       |
    |  - MC tools    |
    |  - MC resources|
    +----------------+
```

### Core Principle: The API Is the Product

Everything talks to the API server. The web dashboard is the first client, the iOS app is the second, the CLI is the third, and the MCP server is the fourth. No client gets special treatment or shortcuts to the data layer. This is what makes the "everyone builds their own lightsaber" vision possible.

**The API server runs on the Mac Mini, behind Tailscale.** All clients connect via Tailscale IP. No public internet exposure for v1. This simplifies security to "is this device on my Tailscale network?" -- which is exactly right for a single-user system.

**Runtime decision: Node.js, not Bun.** While Bun has attractive features (native SQLite, faster startup), Node.js with better-sqlite3 is the safer production choice. better-sqlite3 has years of production usage, sqlite-vec loads cleanly as a Node extension, and @hono/node-server is battle-tested. Bun's native SQLite driver has had issues with drizzle-kit (see GitHub issue #1520). If Bun matures further, the switch is trivial since Hono runs on both runtimes.

### Component Boundaries

| Component | Responsibility | Communicates With | Hosted On |
|-----------|---------------|-------------------|-----------|
| **API Server** | All business logic, data access, capture processing, AI orchestration | All clients, SQLite, filesystem, MCP layer | Mac Mini |
| **Web Dashboard** | Visual interface, real-time updates, quick capture | API Server (REST + SSE) | Mac Mini (static files served by API or Caddy) |
| **iOS Companion** | Capture (widget, share sheet, voice), read-only dashboard | API Server (REST), local queue (offline) | User's iPhone |
| **CLI Client** | Developer capture during coding sessions | API Server (REST) | MacBook (installed via pnpm link) |
| **MCP Server** | Expose MC data to Claude Code sessions | API Server (internal calls), Claude Code (stdio) | Mac Mini or MacBook |
| **MCP Client** | Consume portfolio-dashboard, mac-mini-bridge data | External MCP servers (stdio/SSE) | Mac Mini (within API server process) |
| **SQLite Database** | Captures, project state, metadata, FTS5 index, vector embeddings | API Server (direct, same process via better-sqlite3) | Mac Mini |
| **File Storage** | Audio recordings, large blobs | API Server (filesystem ops) | Mac Mini (~/.mission-control/audio/) |
| **AI Processing** | Categorization, search, triage, transcription | API Server (orchestrates), Claude API, Whisper | Mac Mini + external APIs |

### Data Flow

**Capture Flow (the sacred path):**
```
User input (any client)
    |
    v
[Client-side validation: non-empty, size limit]
    |
    v
POST /api/captures  (with type: text|voice|link|image)
    |
    v
[API Server: persist raw capture immediately]  <-- Durability first
    |
    v
[Background: AI categorization]
    |-- Claude API: classify intent, extract entities, suggest project
    |-- If voice: Whisper transcription (store both audio + text)
    |-- If link: metadata extraction (title, description, favicon)
    |
    v
[Update capture with AI enrichments]
    |
    v
[SSE push: notify dashboard of new/updated capture]
```

**The capture path is sacred.** Raw input is persisted before any AI processing. If Claude API is down, if Whisper fails, if the Mac Mini is overloaded -- the capture is safe. AI enrichment happens asynchronously and can be retried.

**Offline Capture Flow (iOS/CLI):**
```
User input (offline)
    |
    v
[Local queue: SwiftData on device / JSON file on CLI]
    |
    v
[Device detects connectivity to Tailscale]
    |
    v
POST /api/captures/batch  (idempotent, with client-generated UUIDs)
    |
    v
[API Server: dedup by UUID, persist, trigger AI processing]
    |
    v
[Client: mark queued captures as synced, delete local copies]
```

**Dashboard Data Flow:**
```
Browser opens dashboard
    |
    v
GET /api/dashboard  (initial load: projects, captures, health)
    |
    v
[Render full dashboard state]
    |
    v
EventSource /api/events  (SSE stream)
    |-- project_updated: re-render project card
    |-- capture_created: add capture to relevant project
    |-- capture_enriched: update capture with AI results
    |-- health_pulse: update Mac Mini indicators
    |
    v
[Incremental UI updates -- TanStack Query invalidates relevant queries]
```

**MCP Data Flow:**
```
Claude Code session
    |
    v
MCP stdio transport -> MC MCP Server
    |
    v
[MCP Server calls API Server internally]
    |-- Tool: create_capture -> POST /api/captures
    |-- Tool: search_captures -> GET /api/search?q=...
    |-- Resource: project_status -> GET /api/projects
    |-- Resource: recent_captures -> GET /api/captures?limit=10
    |
    v
[Return structured data to Claude Code]
```

**Portfolio Data Flow (consuming external MCP):**
```
API Server (on startup + periodic refresh every 60s)
    |
    v
[MCP Client connects to portfolio-dashboard via stdio]
    |-- portfolio_status -> all project git states
    |-- sprint_history -> commit patterns
    |
    v
[Cache in SQLite with TTL]
    |
    v
[Serve to dashboard via REST / push updates via SSE]
```

## Patterns to Follow

### Pattern 1: API-First with Internal Dogfooding

**What:** The API server serves all data through REST endpoints. Even the MCP server calls the API rather than accessing the database directly.

**When:** Always. Every new feature starts with the API endpoint, then the client integration.

**Why:** Prevents the "works on dashboard but not on iOS" problem. Every client gets the same contract. Also means the API is automatically tested by real usage from day one.

**Example:**
```typescript
// API route (the source of truth)
app.get('/api/captures', async (c) => {
  const captures = await db.query.captures.findMany({
    where: filters,
    with: { project: true, enrichments: true },
    orderBy: desc(captures.createdAt),
    limit: c.req.query('limit') ?? 50,
  });
  return c.json({ captures });
});

// MCP server (calls the API, doesn't touch DB)
server.tool('recent_captures', { limit: z.number().optional() }, async ({ limit }) => {
  const res = await fetch(`http://localhost:${API_PORT}/api/captures?limit=${limit ?? 10}`);
  const { captures } = await res.json();
  return { content: [{ type: 'text', text: JSON.stringify(captures, null, 2) }] };
});

// Dashboard (calls the API via TanStack Query + Hono RPC)
function useCaptures(limit = 50) {
  return useQuery({
    queryKey: ['captures', limit],
    queryFn: () => client.api.captures.$get({ query: { limit } }).then(r => r.json()),
  });
}
```

### Pattern 2: SSE for Real-Time, REST for Everything Else

**What:** Dashboard connects to a single SSE endpoint for real-time updates. All data mutations and initial loads go through REST.

**When:** Any time the dashboard needs to reflect changes without polling.

**Why:** SSE is dramatically simpler than WebSockets for server-to-client push. No bidirectional protocol to manage. Works through load balancers and proxies. Auto-reconnects via the browser's EventSource API. The dashboard is 95% read-heavy -- SSE covers that perfectly. The 5% of writes (new capture, dismiss) go through REST POST/PUT/DELETE.

**Example:**
```typescript
// Server: SSE event bus (in-process, no Redis needed for single user)
import { EventEmitter } from 'events';
const eventBus = new EventEmitter();

app.get('/api/events', async (c) => {
  return streamSSE(c, async (stream) => {
    const handler = (event: ServerEvent) => {
      stream.writeSSE({ data: JSON.stringify(event), event: event.type });
    };
    eventBus.on('event', handler);
    stream.onAbort(() => eventBus.off('event', handler));
    // Keep-alive ping every 30s
    while (true) {
      await stream.writeSSE({ data: '', event: 'ping' });
      await stream.sleep(30000);
    }
  });
});

// After any mutation, emit event:
eventBus.emit('event', { type: 'capture_created', data: newCapture });
```

### Pattern 3: Persist First, Enrich Later

**What:** Write the raw capture to SQLite immediately. Queue AI enrichment as a background job. Update the capture record when enrichment completes.

**When:** Every capture, every AI-dependent operation.

**Why:** The AI layer is the most fragile part of the system. API calls fail, rate limits hit, models are slow. The capture path must never block on AI. Users see their raw capture instantly; enrichments appear as they complete (pushed via SSE).

**Example:**
```typescript
app.post('/api/captures', async (c) => {
  const body = await c.req.json();
  // 1. Persist immediately
  const capture = await db.insert(captures).values({
    id: body.clientId ?? nanoid(),
    rawContent: body.content,
    type: body.type, // text | voice | link | image
    status: 'pending_enrichment',
    createdAt: new Date(),
  }).returning();

  // 2. Queue enrichment (non-blocking)
  enrichmentQueue.push(capture[0].id);

  // 3. Notify SSE listeners
  eventBus.emit('event', { type: 'capture_created', data: capture[0] });

  // 4. Return immediately
  return c.json({ capture: capture[0] }, 201);
});
```

### Pattern 4: Single SQLite Database, Multiple Access Patterns

**What:** One SQLite database file with WAL mode. Regular tables for structured data. FTS5 virtual tables for full-text search. sqlite-vec for vector similarity search. All in one file, one process.

**When:** Always for v1. The single-user, single-server constraint makes this ideal.

**Why:** No connection pooling, no separate search service, no vector database to manage. SQLite with WAL handles concurrent reads from multiple HTTP request handlers while the single writer processes enrichments. For a single-user system doing <100 writes/minute, this is massively overprovisioned. better-sqlite3's synchronous API means no async overhead -- queries return immediately.

### Pattern 5: Client-Generated IDs for Offline Sync

**What:** Clients generate nanoid-based IDs for captures before sending. Server uses these for idempotent deduplication.

**When:** Any capture from iOS or CLI that might be offline-queued.

**Why:** Enables safe retry without duplicates. If the client sends a capture, loses connection before getting the response, and retries -- the server recognizes the ID and returns the existing record instead of creating a duplicate. nanoid is shorter than UUID (21 chars vs 36) and URL-safe.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Capture Inbox

**What:** Building captures as a separate list/inbox that lives independently from projects.

**Why bad:** This is the #1 pattern that causes capture systems to become graveyards. Captures pile up in the inbox, review becomes a chore, items get stale. The PROJECT.md explicitly calls this out: "captures woven into project cards on dashboard -- not a separate inbox."

**Instead:** Captures appear on project cards via AI categorization. Unlinked captures get a brief "triage" section -- a small, visible area on the dashboard, not a separate page. The goal: open dashboard, see your captures where they belong.

### Anti-Pattern 2: GraphQL for a Single-User API

**What:** Using GraphQL for the API layer.

**Why bad:** GraphQL solves the problem of multiple clients with different data needs at scale. For a single-user system with 3-4 known clients, it adds massive complexity (schema definition, resolvers, code generation, caching) for zero benefit. REST with Hono's type-safe RPC client gives you the type safety without the protocol overhead.

**Instead:** REST endpoints with Hono RPC for the dashboard (type-safe). Standard REST for iOS/CLI/MCP. If an endpoint returns too much data, add a `fields` query parameter.

### Anti-Pattern 3: Microservices / Separate Processes

**What:** Running the AI processing as a separate service, the MCP server as a separate service, the dashboard server as a separate process.

**Why bad:** This is a single-user system running on one Mac Mini. Microservices add deployment complexity, inter-process communication overhead, and operational burden. There is no scaling requirement that justifies process separation.

**Instead:** One Node.js process runs everything: the Hono API server serves static dashboard files, processes AI enrichments in-process with a simple queue, and the MCP server runs as a separate stdio process (required by MCP protocol, but talks to the same API). PM2 manages the process with auto-restart.

### Anti-Pattern 4: Over-Engineering Auth for v1

**What:** Building JWT auth, API keys, OAuth, or any auth system for v1.

**Why bad:** Single user behind Tailscale. The network IS the auth. Building auth now means building it twice -- once wrong (because you don't know the multi-user requirements yet) and once right (when a real second user appears).

**Instead:** Optional API key header for the MCP server (so random Tailscale devices can't accidentally hit the API). A single `MC_API_KEY` env var checked via middleware. 5 lines of code, not an auth system.

### Anti-Pattern 5: Premature Plugin Architecture

**What:** Building a formal plugin system with registration, lifecycle hooks, dependency injection.

**Why bad:** You don't know what a plugin looks like until you have two plugins. The PROJECT.md says "formalize plugin system when there's a second plugin to build."

**Instead:** Clean module boundaries in code. The MCP layer is a module. The AI enrichment pipeline is a module. The portfolio data fetcher is a module. Each has a clear interface. When the second plugin arrives, extract the pattern into a formal system based on what you learned from the first two.

## Build Order (Dependencies Between Components)

The build order is driven by two principles: (1) what has the most dependencies must be built first, and (2) each phase must deliver visible, usable value.

```
Phase 1: API Server + SQLite Schema + Basic Dashboard
   |
   |  Why first: Everything depends on the API. Can't build clients
   |  without endpoints. Can't test capture without storage.
   |  Delivers: Working dashboard showing project data from
   |  portfolio-dashboard MCP / seeded data.
   |
   v
Phase 2: Capture Pipeline (API + Dashboard Capture)
   |
   |  Why second: Capture is the core value proposition. Dashboard
   |  quick-capture field is the simplest client to build.
   |  Delivers: Type text into dashboard, see it appear as a capture.
   |
   v
Phase 3: AI Enrichment + Search
   |
   |  Why third: Enrichment makes captures useful. Without AI
   |  categorization, captures are just a list. With it, they're
   |  woven into projects. Search makes the system retrievable.
   |  Delivers: Captures auto-categorize, full-text + vector search.
   |
   v
Phase 4: MCP Integration (consume + expose)
   |
   |  Why fourth: MCP consumption (portfolio-dashboard) enriches the
   |  dashboard with real project data. MCP exposure lets Claude Code
   |  sessions read/write captures. Both require the API to be stable.
   |  Delivers: Real git data on dashboard, capture from Claude Code.
   |
   v
Phase 5: Real-Time (SSE) + Dashboard Polish
   |
   |  Why fifth: SSE makes the dashboard feel alive. Until now,
   |  refreshing the page gets new data. Now it streams in.
   |  Arc browser design energy applied -- opinionated visual identity.
   |  Delivers: Dashboard that updates live, looks distinctive.
   |
   v
Phase 6: CLI Client
   |
   |  Why sixth: Simple client -- just POST to /api/captures.
   |  High developer value (capture during Claude Code sessions).
   |  Depends on: stable capture API, offline queue pattern.
   |  Delivers: `mc capture "brain noodle about X"` from terminal.
   |
   v
Phase 7: iOS Companion
   |
   |  Why last: Most complex client. Requires: stable API, tested
   |  capture pipeline, offline sync, share sheet extension,
   |  widget, voice capture with Whisper integration.
   |  Delivers: Full mobile capture + read-only dashboard.
```

**Key dependency chain:** API Server -> Capture Pipeline -> AI Enrichment -> everything else can parallelize. The CLI and iOS app are independent of each other but both depend on a stable capture API.

**Build order rationale:** Each phase builds on the last, and each delivers something usable. After Phase 2, you can capture thoughts. After Phase 3, they auto-organize. After Phase 4, Claude Code integrates. This means the system is useful from Phase 2 onward, not just Phase 7. This directly mitigates the "perfectionism trap" pitfall -- ship value early, evolve the foundation.

## Scalability Considerations

| Concern | At 1 user (v1) | At 5 users (v2) | At 50 users (v3) |
|---------|----------------|------------------|-------------------|
| **Database** | SQLite WAL, single file, ~100 writes/min max | SQLite still fine -- WAL handles concurrent reads, serialize writes | Migrate to PostgreSQL or Turso (hosted SQLite) |
| **API Server** | Single Node.js process, ~30K req/sec with Hono | Same process, still underutilized | Multiple workers behind Caddy reverse proxy |
| **File Storage** | Local filesystem, date-partitioned directories | Local filesystem, hashed subdirectories | MinIO (S3-compatible) or cloud storage |
| **AI Processing** | In-process queue, sequential | In-process queue, sequential (still fast enough) | Separate worker process with BullMQ |
| **Auth** | Tailscale network = auth | Per-user API keys, simple middleware | JWT + RBAC, proper auth system |
| **Real-Time** | Single SSE connection | Per-user SSE connections (still fine) | Redis pub/sub for SSE fan-out |
| **Search** | FTS5 + sqlite-vec in-process | Same (still fast for <100K captures) | Dedicated search (Meilisearch or Typesense) |

**The key insight:** v1 architecture (monolithic Node.js process + SQLite) comfortably handles 1-10 users. The first real scaling pressure comes at auth, not performance. When multi-user arrives, add auth first, worry about infrastructure later.

## Sources

- Hono.js documentation: https://hono.dev/
- Hono SSE streaming helper: https://hono.dev/docs/helpers/streaming
- Hono RPC client: https://hono.dev/docs/guides/rpc
- @hono/node-server: https://github.com/honojs/node-server
- Drizzle ORM SQLite: https://orm.drizzle.team/docs/get-started-sqlite
- better-sqlite3: https://github.com/WiseLibs/better-sqlite3
- sqlite-vec hybrid search: https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/index.html
- SQLite Vector extension: https://www.sqlite.ai/sqlite-vector
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP build server guide: https://modelcontextprotocol.io/docs/develop/build-server
- Offline-first iOS architecture: https://dev.to/vijaya_saimunduru_c9579b/architecting-offline-first-ios-apps-with-idle-aware-background-sync-1dhh
- TanStack Router + Vite: https://tanstack.com/router/latest/docs/framework/react/routing/installation-with-vite
- SSE vs WebSockets 2026: https://jetbi.com/blog/streaming-architecture-2026-beyond-websockets
- SQLite one-person stack 2026: https://dev.to/zilton7/sqlite-is-all-you-need-the-one-person-stack-for-2026-23kg
- PM2 process manager: https://pm2.keymetrics.io/docs/usage/quick-start/
