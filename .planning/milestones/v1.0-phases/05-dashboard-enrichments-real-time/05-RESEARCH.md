# Phase 5: Dashboard Enrichments & Real-Time - Research

**Researched:** 2026-03-10
**Domain:** SSE real-time streaming, data visualization (heatmap), system health monitoring, UI enrichment
**Confidence:** HIGH

## Summary

Phase 5 transforms the dashboard from a static display into a living awareness surface. The five features (sprint heatmap, "Previously on..." breadcrumbs, stale nudges, Mac Mini health pulse, SSE real-time) are largely independent UI additions with one shared backend concern: the SSE event bus that pushes updates to the frontend.

The existing codebase is well-prepared for this phase. Commit data is already persisted in SQLite with `author_date` (from Phase 1/4), the project scanner caches 50 commits per project with GSD state, the health endpoint exists at `/api/health`, and all frontend hooks use a `refetch` pattern that SSE can trivially trigger. The primary new infrastructure is (1) an EventEmitter-based event bus on the API server that routes domain events to SSE connections, and (2) a `useSSE()` hook on the frontend that dispatches refetches to existing hooks.

**Primary recommendation:** Build the SSE event bus first (DASH-09) since it is the connective tissue for real-time display. Then build the four visual features (DASH-05 through DASH-08) in parallel, each emitting events through the bus as appropriate. The heatmap should be a hand-rolled SVG grid (no library dependency) -- the data shape is simple (project x day x count) and the rendering is straightforward CSS grid/SVG cells.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Sprint heatmap positioned above departure board, below capture field -- full-width, first thing you see after capture field
- 12-week time range (~3 months), commits only (count per day)
- Only projects with commits in 12-week window shown (Active + Idle) -- stale omitted
- GitHub-style contribution grid: one row per project, columns are days/weeks, cell intensity = commit count
- "Previously on..." breadcrumbs are expandable per project row (chevron click, collapsed by default)
- Content: last 3-5 commit messages (hash + message + relative time) plus GSD phase/status if `.planning/` exists
- No AI-generated narrative (deferred to AINT-02)
- Stale nudge: muted amber/gold left border or background tint on projects idle 2+ weeks with uncommitted work
- Tooltip on hover explains why highlighted
- Criteria: last commit > 14 days ago AND dirty files > 0
- Mac Mini health: full system metrics (CPU%, memory%, disk%, uptime) plus per-service status
- Health dot in header stays as quick-glance signal, click to expand panel
- Data via new `/api/health/system` endpoint (Node.js `os` module + `child_process`)
- Service list configurable in mc.config.json
- 30-second poll interval from frontend
- Health dot: green (all up), amber (degraded), red (API unreachable)
- SSE: two event streams -- capture lifecycle and project scan updates
- Health NOT on SSE -- stays on 30s poll
- Single SSE connection to `/api/events` with event type dispatching
- Notification-only payloads: `{type, id}` -- frontend hooks refetch from existing API endpoints
- Frontend: `useSSE()` hook with auto-reconnect (exponential backoff)
- Server: Hono SSE helper or native ReadableStream with event emitter pattern

### Claude's Discretion
- Heatmap cell color intensity scale (how many commits = which shade)
- Heatmap mobile responsiveness (hide, condense, or horizontal scroll)
- Exact "Previously on..." expand/collapse animation
- Health panel positioning and dismiss behavior
- SSE reconnection backoff timing
- How SSE connection state is shown to user (if at all)
- Exact amber/gold shade for stale nudge treatment
- Service check implementation details (process detection, port checks, etc.)

### Deferred Ideas (OUT OF SCOPE)
- AI-generated narrative summaries for "Previously on..." (AINT-02)
- SSE for health status changes
- SSE for search index updates

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-05 | Sprint heatmap: GitHub-style contribution grid, one row per project, 12-16 weeks | Commit data in SQLite with `author_date`, query aggregation by project+day, hand-rolled SVG/CSS grid |
| DASH-06 | "Previously on..." expandable breadcrumbs per project | Scanner caches 50 commits + GSD state per project; extend project-row.tsx with expand chevron |
| DASH-07 | Stale project nudges: subtle visual treatment for idle 2+ weeks with dirty files | Existing grouping logic + dirtyFiles data; CSS-only treatment on project-row |
| DASH-08 | Mac Mini health pulse: system metrics + per-service status | Node.js `os` module for CPU/mem/uptime, `child_process` for disk and service checks, mc.config.json for service list |
| DASH-09 | Real-time SSE updates for captures and project scans | Hono 4.12 `streamSSE` helper, EventEmitter bus, `useSSE()` hook dispatching to existing refetch patterns |

</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.12.5 | SSE streaming via `streamSSE` helper | Already installed, built-in SSE support via `hono/streaming` |
| React | 19.x | Frontend components (heatmap, breadcrumbs, health panel) | Already installed |
| Tailwind v4 | 4.x | Styling via CSS-native @theme | Already installed with warm color tokens |
| better-sqlite3 | 11.x | Commit aggregation queries for heatmap | Already installed |
| Drizzle ORM | 0.38.x | Structured queries for commit data | Already installed |

### Supporting (no new dependencies needed)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `node:os` (built-in) | CPU%, memory%, uptime for health endpoint | System metrics collection |
| `node:child_process` (built-in) | Disk usage (`df`), service checks | Health system endpoint |
| `node:events` (built-in) | EventEmitter for SSE event bus | Server-side event dispatching |
| `EventSource` (browser built-in) | SSE client connection | Frontend SSE hook |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled heatmap SVG | `react-calendar-heatmap` or `@uiw/react-heat-map` | Libraries are calendar-style (single column per day). MC needs multi-row (one per project) grid which no library supports. Hand-roll is simpler. |
| Native EventSource | `event-source-plus` or `@azure/fetch-event-source` | Native EventSource covers our needs. Auto-reconnect is built in. Custom backoff adds ~20 lines. No dependency warranted. |
| EventEmitter for bus | Third-party pub/sub | Single-process, single-user app. Node.js EventEmitter is the standard pattern. |

**Installation:**
```bash
# No new packages needed -- all dependencies are built-in or already installed
```

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/
  routes/
    events.ts              # SSE endpoint (/api/events)
    health.ts              # Extended with /health/system
  services/
    event-bus.ts           # EventEmitter singleton for SSE dispatch
    health-monitor.ts      # System metrics collection (os, child_process)
    project-scanner.ts     # Extended to emit scan:complete events
  db/queries/
    commits.ts             # Extended with heatmap aggregation query

packages/web/src/
  hooks/
    use-sse.ts             # SSE connection + auto-reconnect + dispatch
    use-heatmap.ts         # Fetch /api/heatmap data
    use-health.ts          # Poll /api/health/system on 30s interval
  components/
    heatmap/
      sprint-heatmap.tsx   # Full-width heatmap container
      heatmap-grid.tsx     # SVG/CSS grid rendering
      heatmap-cell.tsx     # Individual intensity cell
    health/
      health-panel.tsx     # Expandable panel with full metrics
    departure-board/
      project-row.tsx      # Extended with expand chevron + stale nudge
      previously-on.tsx    # Breadcrumb content (commits + GSD state)
```

### Pattern 1: Event Bus (Server-Side SSE Dispatch)
**What:** Singleton EventEmitter that capture routes and scanner emit domain events to. SSE connections listen on this bus and forward events to connected clients.
**When to use:** Any time a server-side action should notify connected SSE clients.
**Example:**
```typescript
// packages/api/src/services/event-bus.ts
import { EventEmitter } from "node:events";

export interface MCEvent {
  type: "capture:created" | "capture:enriched" | "capture:archived" | "scan:complete";
  id: string;
}

class MCEventBus extends EventEmitter {
  emit(event: "mc:event", data: MCEvent): boolean {
    return super.emit("mc:event", data);
  }
  on(event: "mc:event", listener: (data: MCEvent) => void): this {
    return super.on("mc:event", listener);
  }
}

// Singleton -- imported by routes and SSE endpoint
export const eventBus = new MCEventBus();
```

### Pattern 2: SSE Endpoint with Hono streamSSE
**What:** Long-lived SSE connection using Hono's built-in `streamSSE` helper. Listens on event bus, writes SSE messages to connected clients.
**When to use:** The `/api/events` endpoint.
**Example:**
```typescript
// packages/api/src/routes/events.ts
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eventBus, type MCEvent } from "../services/event-bus.js";

export const eventRoutes = new Hono().get("/events", (c) => {
  return streamSSE(c, async (stream) => {
    let eventId = 0;

    const handler = async (event: MCEvent) => {
      try {
        await stream.writeSSE({
          event: event.type,
          data: JSON.stringify({ type: event.type, id: event.id }),
          id: String(eventId++),
        });
      } catch {
        // Client disconnected -- cleanup handled by onAbort
      }
    };

    eventBus.on("mc:event", handler);

    stream.onAbort(() => {
      eventBus.removeListener("mc:event", handler);
    });

    // Keep connection alive -- streamSSE auto-closes when callback returns
    // Use sleep loop to keep the stream open
    while (true) {
      await stream.sleep(30_000);
    }
  });
});
```

### Pattern 3: Frontend useSSE Hook with Auto-Reconnect
**What:** React hook that creates an EventSource connection, dispatches refetches to existing hooks on events, and handles reconnection with exponential backoff.
**When to use:** Singleton at App level, passed down via callbacks.
**Example:**
```typescript
// packages/web/src/hooks/use-sse.ts
import { useEffect, useRef, useCallback } from "react";

interface UseSSEOptions {
  onCaptureCreated?: (id: string) => void;
  onCaptureEnriched?: (id: string) => void;
  onScanComplete?: () => void;
}

export function useSSE(options: UseSSEOptions) {
  const retryCountRef = useRef(0);
  const maxRetryDelay = 30_000;

  const connect = useCallback(() => {
    const es = new EventSource("/api/events");

    es.onopen = () => {
      retryCountRef.current = 0; // Reset on successful connect
    };

    es.addEventListener("capture:created", (e) => {
      const data = JSON.parse(e.data);
      options.onCaptureCreated?.(data.id);
    });

    es.addEventListener("capture:enriched", (e) => {
      const data = JSON.parse(e.data);
      options.onCaptureEnriched?.(data.id);
    });

    es.addEventListener("scan:complete", () => {
      options.onScanComplete?.();
    });

    es.onerror = () => {
      es.close();
      const delay = Math.min(1000 * Math.pow(2, retryCountRef.current), maxRetryDelay);
      retryCountRef.current++;
      setTimeout(connect, delay);
    };

    return es;
  }, [options]);

  useEffect(() => {
    const es = connect();
    return () => es.close();
  }, [connect]);
}
```

### Pattern 4: Heatmap Data Aggregation Query
**What:** SQL query that aggregates commit counts by project and day over a 12-week window.
**When to use:** New `/api/heatmap` endpoint.
**Example:**
```typescript
// In packages/api/src/db/queries/commits.ts (extend existing file)
export function getHeatmapData(
  db: DrizzleDb,
  weeksBack: number = 12
): { projectSlug: string; date: string; count: number }[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeksBack * 7);
  const cutoffISO = cutoff.toISOString();

  // author_date is stored as ISO string, so string comparison works
  return db
    .select({
      projectSlug: commits.projectSlug,
      date: sql<string>`date(${commits.authorDate})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(commits)
    .where(sql`${commits.authorDate} >= ${cutoffISO}`)
    .groupBy(commits.projectSlug, sql`date(${commits.authorDate})`)
    .orderBy(commits.projectSlug, sql`date(${commits.authorDate})`)
    .all();
}
```

### Pattern 5: System Health Metrics Collection
**What:** Node.js `os` module for CPU/memory/uptime, `child_process` for disk usage and service detection.
**When to use:** `/api/health/system` endpoint.
**Example:**
```typescript
// packages/api/src/services/health-monitor.ts
import os from "node:os";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

export interface SystemHealth {
  cpu: { loadAvg1m: number; loadAvg5m: number; cores: number };
  memory: { totalMB: number; freeMB: number; usedPercent: number };
  disk: { totalGB: number; usedGB: number; usedPercent: number };
  uptime: number; // seconds
  services: { name: string; status: "up" | "down" }[];
}

export async function getSystemHealth(
  serviceList: string[]
): Promise<SystemHealth> {
  const [load1, load5] = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  // Disk usage via df (macOS/Linux)
  const disk = await getDiskUsage();

  // Service checks (port/process)
  const services = await checkServices(serviceList);

  return {
    cpu: {
      loadAvg1m: Math.round(load1 * 100) / 100,
      loadAvg5m: Math.round(load5 * 100) / 100,
      cores: os.cpus().length,
    },
    memory: {
      totalMB: Math.round(totalMem / 1024 / 1024),
      freeMB: Math.round(freeMem / 1024 / 1024),
      usedPercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    disk,
    uptime: Math.round(os.uptime()),
    services,
  };
}

async function getDiskUsage(): Promise<{ totalGB: number; usedGB: number; usedPercent: number }> {
  try {
    const { stdout } = await execFile("df", ["-k", "/"], { timeout: 5000 });
    // Parse df output (second line)
    const lines = stdout.trim().split("\n");
    const parts = lines[1]?.split(/\s+/);
    if (parts && parts.length >= 5) {
      const totalKB = parseInt(parts[1] ?? "0", 10);
      const usedKB = parseInt(parts[2] ?? "0", 10);
      return {
        totalGB: Math.round(totalKB / 1024 / 1024 * 10) / 10,
        usedGB: Math.round(usedKB / 1024 / 1024 * 10) / 10,
        usedPercent: totalKB > 0 ? Math.round((usedKB / totalKB) * 100) : 0,
      };
    }
  } catch { /* fall through */ }
  return { totalGB: 0, usedGB: 0, usedPercent: 0 };
}
```

### Anti-Patterns to Avoid
- **Sending full data payloads via SSE:** SSE should be notification-only (`{type, id}`). Frontend refetches via existing API. Avoids duplicate serialization, keeps SSE messages tiny, and reuses existing caching/validation logic.
- **Multiple SSE connections:** Use ONE `/api/events` connection with event types. Multiple connections waste server resources and browser connection limits (6 per domain).
- **Polling for everything:** Health uses 30s poll (locked decision), but captures and scan updates use SSE push. Do not add polling where SSE is available.
- **Heavy computation in SSE handler:** The `writeSSE` callback should be fast. Aggregation queries (heatmap) happen in dedicated API endpoints, not in the SSE stream.
- **Using `setInterval` inside SSE stream:** Use `stream.sleep()` for keep-alive. `setInterval` creates cleanup issues when the stream is aborted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE protocol formatting | Manual `text/event-stream` header + data formatting | `streamSSE` from `hono/streaming` | Handles headers, `data:` prefix, newlines, `id:` fields, error handling |
| System memory/CPU | Shell parsing `top` or `vm_stat` | `os.totalmem()`, `os.freemem()`, `os.loadavg()`, `os.cpus()` | Cross-platform, no parsing, built-in |
| ISO date math for heatmap | Manual date string manipulation | SQLite `date()` function in aggregation query | SQLite handles date parsing, timezone, and grouping natively |
| SSE auto-reconnect | Custom fetch + ReadableStream reader | Native `EventSource` API | Built-in reconnect behavior, standard API, no dependencies |

**Key insight:** This phase adds no new npm dependencies. Every feature uses built-in Node.js modules, built-in browser APIs, or already-installed libraries (Hono, React, Tailwind, Drizzle). This is by design -- Phase 5 is UI enrichment, not infrastructure.

## Common Pitfalls

### Pitfall 1: SSE Connection Leaks on Server
**What goes wrong:** EventEmitter listeners accumulate when SSE connections open/close without proper cleanup. Memory leak and eventual "MaxListenersExceededWarning."
**Why it happens:** `stream.onAbort()` not called, or listener not removed properly.
**How to avoid:** Always pair `eventBus.on()` with `eventBus.removeListener()` in `stream.onAbort()`. Set `eventBus.setMaxListeners()` higher than default 10 if expecting multiple tabs.
**Warning signs:** Node.js warning about max listeners exceeded, memory growth over time.

### Pitfall 2: Hono streamSSE Closes Immediately
**What goes wrong:** The SSE callback returns, and Hono closes the stream. No events ever reach the client.
**Why it happens:** The `streamSSE` callback must not return while the connection should stay open. Without a blocking operation (like `stream.sleep()` in a loop), the function resolves and the stream closes.
**How to avoid:** Use `while (true) { await stream.sleep(30_000); }` at the end of the SSE callback to keep the connection alive indefinitely. The `stream.onAbort()` cleanup will handle termination.
**Warning signs:** SSE connection opens then immediately closes in browser DevTools.

### Pitfall 3: Vite Proxy Buffering SSE
**What goes wrong:** Vite's dev proxy (http-proxy) may buffer SSE responses, causing events to arrive in batches instead of real-time.
**Why it happens:** Some proxy configurations buffer responses before forwarding.
**How to avoid:** Vite's `http-proxy` passes through `Transfer-Encoding: chunked` and `Content-Type: text/event-stream` correctly by default. If issues arise, verify the proxy does not add `Accept-Encoding: gzip` to upstream requests.
**Warning signs:** Events arrive in bursts rather than individually.

### Pitfall 4: Stale Hook References in SSE Callbacks
**What goes wrong:** SSE event handlers call stale `refetch` functions from old renders, causing missed updates or no-ops.
**Why it happens:** React closures capture values from the render they were created in.
**How to avoid:** Use `useRef` for the SSE callback options (same pattern as `useKeyboardShortcuts`). Update the ref in a useEffect. The SSE event handler reads from the ref, always getting the latest callbacks.
**Warning signs:** First SSE event triggers refetch, subsequent ones do nothing.

### Pitfall 5: Health Endpoint Blocking on Slow Service Checks
**What goes wrong:** `/api/health/system` takes 5+ seconds because a service check (e.g., port probe to a down service) times out synchronously.
**Why it happens:** Service checks run sequentially or have long default timeouts.
**How to avoid:** Run all service checks in `Promise.allSettled()` with per-check timeouts (2-3 seconds max). Return partial results for timed-out checks as `status: "unknown"`.
**Warning signs:** Health panel takes noticeably long to load.

### Pitfall 6: Heatmap SQL Query Performance
**What goes wrong:** Aggregation query scans entire commits table and is slow with many projects/commits.
**Why it happens:** Missing index on `author_date` or inefficient date parsing.
**How to avoid:** The commits table already has an index on `project_slug`. The `author_date` column stores ISO 8601 strings, so SQLite's `date()` function works correctly. For 12 weeks x ~20 projects x ~50 commits, the query will be fast (< 10ms). If it gets slow, add a covering index on `(project_slug, author_date)`.
**Warning signs:** Heatmap endpoint response time > 100ms.

### Pitfall 7: EventSource Reconnection Storm
**What goes wrong:** Browser reconnects immediately and repeatedly when the server is down, creating a tight loop.
**Why it happens:** Native EventSource has built-in reconnection, but with a short default retry interval (typically 3 seconds). If the server sends an explicit `retry:` field, the browser uses that.
**How to avoid:** Implement custom reconnection in the `useSSE` hook with exponential backoff (1s, 2s, 4s, 8s, ... max 30s). Close the native EventSource on error and manually reconnect. Reset the retry counter on successful connection.
**Warning signs:** Console flooded with connection errors.

## Code Examples

### Heatmap Cell Intensity Scale (Claude's Discretion)
```typescript
// Recommended: 5-level scale matching warm color palette
// 0 commits: empty (transparent)
// 1 commit: level 1 (lightest)
// 2-3 commits: level 2
// 4-6 commits: level 3
// 7+ commits: level 4 (darkest)
function getIntensityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 6) return 3;
  return 4;
}

// CSS classes using existing warm color tokens
// Level 0: bg-transparent
// Level 1: bg-terracotta/20
// Level 2: bg-terracotta/40
// Level 3: bg-terracotta/70
// Level 4: bg-terracotta
```

### Heatmap Mobile Responsiveness (Claude's Discretion)
```typescript
// Recommendation: horizontal scroll on mobile
// The heatmap is a wide grid (12 weeks = 84 columns)
// Options: (1) hide on mobile, (2) condense to weeks, (3) horizontal scroll
// Horizontal scroll preserves data fidelity and feels natural on touch
// Use overflow-x-auto with snap-x for smooth scrolling

// <div className="overflow-x-auto snap-x snap-mandatory -mx-4 px-4">
//   <div className="min-w-[600px]"> {/* grid content */} </div>
// </div>
```

### Health Panel Positioning (Claude's Discretion)
```typescript
// Recommendation: dropdown panel anchored to health dot, dismiss on click-outside
// Similar to triage badge but positioned at top-right
// Use absolute positioning relative to the header dot
// Dismiss: click outside, press Escape, or click the dot again
```

### SSE Reconnection Timing (Claude's Discretion)
```typescript
// Recommended backoff: 1s, 2s, 4s, 8s, 16s, 30s (cap)
// With jitter: delay + Math.random() * 1000 to avoid thundering herd
// Reset counter to 0 on successful connection (onopen fires)
const BASE_DELAY = 1000;
const MAX_DELAY = 30_000;
const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY)
  + Math.random() * 1000;
```

### Service Check Implementation (Claude's Discretion)
```typescript
// Recommendation: TCP port probe with 2s timeout
// For each service in config, attempt to connect to its port
// This works for HTTP services, databases, etc.
import net from "node:net";

async function checkPort(port: number, host = "localhost", timeout = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on("connect", () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

// mc.config.json shape extension:
// "services": [
//   { "name": "Crawl4AI", "port": 11235 },
//   { "name": "API", "port": 3000 }
// ]
```

### Config Schema Extension for Services
```typescript
// Extend mcConfigSchema in packages/api/src/lib/config.ts
const serviceEntrySchema = z.object({
  name: z.string().min(1),
  port: z.number().int().positive(),
  host: z.string().default("localhost"),
});

const mcConfigSchema = z.object({
  projects: z.array(projectEntrySchema),
  dataDir: z.string().default("./data"),
  services: z.array(serviceEntrySchema).default([]),
});
```

### Stale Nudge Styling
```typescript
// Amber/gold left border treatment on project rows
// Criteria: lastCommitDate > 14 days ago AND dirtyFiles.length > 0
// Applied as conditional className in ProjectRow

const isStaleWithDirty = (() => {
  if (!project.lastCommitDate || !project.dirty) return false;
  const daysIdle = (Date.now() - new Date(project.lastCommitDate).getTime()) / (24 * 60 * 60 * 1000);
  return daysIdle > 14 && project.dirtyFiles.length > 0;
})();

// In className: replace border-transparent with border-amber-warm/60 bg-amber-warm/5
// Add title attribute for tooltip
```

### Emitting Events from Capture Routes
```typescript
// In packages/api/src/routes/captures.ts, after creating a capture:
import { eventBus } from "../services/event-bus.js";

// After createCapture():
eventBus.emit("mc:event", { type: "capture:created", id: capture.id });

// After enrichment completes (in enrichment.ts):
eventBus.emit("mc:event", { type: "capture:enriched", id: captureId });

// After archiving:
eventBus.emit("mc:event", { type: "capture:archived", id: capture.id });
```

### Emitting Events from Project Scanner
```typescript
// In packages/api/src/services/project-scanner.ts, at end of scanAllProjects():
import { eventBus } from "./event-bus.js";

// After all projects scanned:
eventBus.emit("mc:event", { type: "scan:complete", id: "all" });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebSockets for real-time | SSE for unidirectional push | Stable since HTTP/1.1 | Simpler, auto-reconnect, no library needed |
| Polling for updates | SSE + selective polling | SSE is the modern standard | Real-time without polling overhead |
| Third-party SSE libraries | `hono/streaming` built-in | Hono 4.x | Zero-dependency SSE on server |
| EventSource polyfills | Native browser EventSource | All modern browsers | No polyfill needed (Safari, Chrome, Firefox all support) |
| react-calendar-heatmap | Hand-rolled SVG/CSS grid | N/A (project-specific) | Multi-row-per-project layout not supported by any library |

**Deprecated/outdated:**
- `eventsource` npm package (polyfill): Not needed, all browsers support EventSource natively
- `socket.io`: Overkill for unidirectional push. SSE is the right tool.
- `@azure/fetch-event-source`: Adds fetch-based SSE. Unnecessary when native EventSource suffices.

## Open Questions

1. **How should the heatmap aggregate commits across time zones?**
   - What we know: `author_date` is stored as ISO 8601 with timezone offset (e.g., `2026-03-09T14:30:00-05:00`). SQLite's `date()` function normalizes to UTC.
   - What's unclear: Should we display in local time or UTC?
   - Recommendation: Use `date()` which normalizes to UTC. For a personal single-user dashboard, UTC vs local won't matter much visually for daily aggregation. If it becomes an issue, can pass timezone offset in the API query.

2. **Should the SSE connection show visual state in the UI?**
   - What we know: This is Claude's discretion per CONTEXT.md.
   - Recommendation: Do NOT show SSE connection state visually. The health dot already shows API reachability. Adding another indicator creates confusion. SSE should be invisible when working, and the health dot turns red if the API is unreachable (which also means SSE would fail).

3. **How to handle the heatmap when there are many projects (10+)?**
   - What we know: Current config has 5 projects. Only Active + Idle with commits shown.
   - Recommendation: For now, render all qualifying rows. If it gets tall, the departure board scroll handles it. The heatmap is compact (each row is ~16px tall). 10 rows = 160px. Manageable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.x |
| Config file (API) | `packages/api/vitest.config.ts` |
| Config file (Web) | `packages/web/vitest.config.ts` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-05 | Heatmap aggregation query returns correct counts per project per day | unit | `pnpm --filter @mission-control/api test -- --grep "heatmap"` | No -- Wave 0 |
| DASH-05 | Heatmap API endpoint returns structured data | integration | `pnpm --filter @mission-control/api test -- --grep "heatmap"` | No -- Wave 0 |
| DASH-06 | "Previously on..." data available from project detail endpoint | integration | `pnpm --filter @mission-control/api test -- --grep "project"` | Partial (existing project route tests) |
| DASH-07 | Stale nudge criteria: idle > 14 days AND dirty files > 0 | unit | `pnpm --filter @mission-control/web test -- --grep "stale"` | No -- Wave 0 |
| DASH-08 | Health system endpoint returns CPU/memory/disk/services | integration | `pnpm --filter @mission-control/api test -- --grep "health"` | Partial (existing health test covers /health only) |
| DASH-09 | Event bus emits and listeners receive events | unit | `pnpm --filter @mission-control/api test -- --grep "event-bus"` | No -- Wave 0 |
| DASH-09 | SSE endpoint streams events to connected clients | integration | `pnpm --filter @mission-control/api test -- --grep "events"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/db/queries/heatmap.test.ts` -- covers DASH-05 heatmap aggregation
- [ ] `packages/api/src/__tests__/routes/events.test.ts` -- covers DASH-09 SSE endpoint
- [ ] `packages/api/src/__tests__/services/event-bus.test.ts` -- covers DASH-09 event bus
- [ ] `packages/api/src/__tests__/services/health-monitor.test.ts` -- covers DASH-08 health metrics
- [ ] `packages/web/src/__tests__/lib/stale-nudge.test.ts` -- covers DASH-07 criteria logic

## Sources

### Primary (HIGH confidence)
- Hono 4.12.5 installed in project -- `streamSSE` from `hono/streaming` verified to exist at `node_modules/.pnpm/*/hono/dist/helper/streaming/sse.js`
- [Hono Streaming Helper docs](https://hono.dev/docs/helpers/streaming) -- `streamSSE`, `writeSSE`, `stream.onAbort()`, `stream.sleep()` API
- Node.js `os` module (built-in) -- `os.totalmem()`, `os.freemem()`, `os.loadavg()`, `os.cpus()`, `os.uptime()`
- Node.js `events` module (built-in) -- `EventEmitter` for event bus pattern
- Browser `EventSource` API -- native SSE client, auto-reconnect, event listeners
- Existing codebase: `project-scanner.ts` (50 commits cached), `commits.ts` (author_date stored), `project-row.tsx` (extend for stale + breadcrumbs), `dashboard-layout.tsx` (health dot)

### Secondary (MEDIUM confidence)
- [Hono SSE issues and discussions](https://github.com/honojs/hono/issues/2050) -- keep-alive pattern, `stream.sleep()` loop requirement
- [SSE reconnection patterns](https://github.com/fanout/reconnecting-eventsource) -- exponential backoff best practices with jitter

### Tertiary (LOW confidence)
- None -- all critical patterns verified against installed codebase and official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all dependencies already installed, no new packages
- Architecture: HIGH -- event bus + SSE is textbook pattern, well-supported by Hono
- Heatmap: HIGH -- SVG/CSS grid is straightforward, data query is simple SQL aggregation
- Health monitoring: HIGH -- Node.js `os` module is stable, macOS `df` command is standard
- Pitfalls: HIGH -- verified against Hono GitHub issues and established SSE best practices
- SSE reconnection: MEDIUM -- custom backoff logic is well-understood but requires testing

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (30 days -- all technologies are stable)
