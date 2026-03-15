# Phase 8: Health API & Events - Research

**Researched:** 2026-03-14
**Domain:** Hono API routes, SSE event extensions, health/risk/copy/timeline data exposure
**Confidence:** HIGH

## Summary

Phase 8 is a pure API layer phase: 6 new route handlers across 3-4 new route files, modifications to 2 existing route responses, SSE event handler registration on the frontend, and 1 new query function for sprint timeline segmentation. The scanner (Phase 7) already emits `health:changed` and `copy:diverged` events and persists all health findings, copy records, and commit data. The DB query layer (Phase 6) already provides `getActiveFindings()`, `getProjectRiskLevel()`, `getCopiesByProject()`, and `getHeatmapData()`. This phase wires those existing data functions to HTTP endpoints and extends the SSE stream so the frontend can react to health state changes.

The highest complexity item is the sprint timeline endpoint, which requires a new query function that transforms per-day commit counts (already available via `getHeatmapData()`) into continuous segments with gap detection and density calculation. This is ~40 lines of TypeScript aggregation logic, not a new SQL query. Everything else follows the exact patterns already established in `routes/projects.ts`, `routes/captures.ts`, and `routes/heatmap.ts`.

The RPC type chain is the one non-obvious risk: Hono's typed RPC client (`hc<AppType>`) requires all routes to be chained via `.route()` calls in `app.ts`. Adding 3-4 new `.route()` calls could break type inference if not chained in the correct order. The existing codebase already has 8 chained `.route()` calls; adding more should work but must be verified with `pnpm typecheck` after each addition.

**Primary recommendation:** Build route files one at a time following the existing pattern (factory function taking `getInstance`), register each in `app.ts`, typecheck after each registration, then write integration tests using the established `createTestDb()`/`createTestApp()` helper pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None explicitly locked -- all API design decisions were deferred to Claude's discretion with the constraint "follow the design spec and existing Hono patterns."

### Claude's Discretion
- **API response shapes:** Follow spec examples exactly (Section 6 of design spec). Sprint timeline returns `{ projects, focusedProject, windowDays }`.
- **SSE event granularity:** Single batch `health:changed` event per scan cycle (not per-project). Follow existing `scan:complete` pattern. Add `copy:diverged` for divergence-specific events.
- **Route organization:** Follow existing pattern -- one file per domain (`health-checks.ts`, `sprint-timeline.ts` in `routes/`).
- **Hono RPC type chain:** Minimize `.route()` calls to preserve RPC type inference. Verify types after each addition.
- **Current-scan-cycle "new" detection:** Include `isNew` boolean on findings based on `detectedAt` timestamp comparison with last scan time.
- **Risk count for page title:** Include `riskCount` in risks endpoint response for browser title integration.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RISK-04 | Active risk count appears in browser page title | `/api/risks` endpoint returns `riskCount` field (count of critical+warning findings). Frontend reads this value to set `document.title`. No scanner/DB changes needed -- `getActiveFindings()` already provides the data, route just counts and returns. |
| RISK-05 | Current-scan-cycle detections marked "new" | Each finding has `detectedAt` timestamp. The `isNew` boolean is computed by comparing `detectedAt` against the scan cycle start time. The scan cycle timestamp can be derived from the most recent `lastScannedAt` across projects, or tracked as a module-level variable in the scanner. Route handler adds `isNew` to each finding in the response. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Hono | 4.12+ | Route handlers, zValidator, RPC types | Already in use across all existing routes |
| @hono/zod-validator | (bundled) | Request validation | Used by captures, projects routes |
| Zod | 3.25+ | Schema definitions for query/response | Shared package schemas already defined |
| Drizzle ORM | (existing) | SQL queries | getActiveFindings, getCopiesByProject already written |
| better-sqlite3 | (existing) | Raw SQL for aggregation if needed | Used by health upsert, commit upsert |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| hono/streaming (streamSSE) | (bundled) | SSE event stream | Already in use in `routes/events.ts` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle for timeline query | Raw SQL via better-sqlite3 | Drizzle is fine -- the existing `getHeatmapData()` uses `sql` template literals for `date()` and `count(*)` aggregations. Same pattern works for timeline. |
| New response Zod schemas in shared | Inline TypeScript types in route | Shared schemas are better for RPC type inference and frontend consumption. Add response schemas to `packages/shared/src/schemas/health.ts`. |

**Installation:**
No new dependencies. Everything needed is already installed.

## Architecture Patterns

### Recommended Project Structure
```
packages/api/src/routes/
  health-checks.ts        # NEW: /api/health-checks, /api/health-checks/:slug
  copies.ts               # NEW: /api/copies, /api/copies/:slug
  risks.ts                # NEW: /api/risks
  sprint-timeline.ts      # NEW: /api/sprint-timeline
  projects.ts             # MODIFIED: add healthScore, riskLevel, copyCount to responses
  events.ts               # UNCHANGED: SSE already emits health:changed, copy:diverged

packages/api/src/db/queries/
  health.ts               # MODIFIED: add getAllActiveFindings() grouped by project
  copies.ts               # MODIFIED: add getAllCopies() for listing all multi-copy projects
  commits.ts              # MODIFIED: add getSprintTimelineData() for segment computation

packages/shared/src/schemas/
  health.ts               # MODIFIED: add response schemas for API endpoints

packages/web/src/hooks/
  use-sse.ts              # MODIFIED: add onHealthChanged, onCopyDiverged callbacks
```

### Pattern 1: Route Factory with Database Injection
**What:** Each route file exports a factory function that receives `getInstance: () => DatabaseInstance` and returns a Hono instance with typed routes.
**When to use:** Every new route file in this phase.
**Example:**
```typescript
// Source: packages/api/src/routes/projects.ts (existing pattern)
export function createHealthCheckRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get("/health-checks", (c) => {
      const findings = getActiveFindings(getInstance().db);
      return c.json({ findings });
    })
    .get("/health-checks/:slug", (c) => {
      const slug = c.req.param("slug");
      const findings = getActiveFindings(getInstance().db, slug);
      return c.json({ findings });
    });
}
```

### Pattern 2: Route Registration in app.ts (RPC Chain)
**What:** New routes are registered via `.route("/api", createXRoutes(getInstance))` in the method chain.
**When to use:** After each new route file is created.
**Example:**
```typescript
// Source: packages/api/src/app.ts (existing pattern)
const app = new Hono()
  .route("/api", createHealthRoutes(() => config ?? null))
  // ... existing routes ...
  .route("/api", createHealthCheckRoutes(getInstance))  // NEW
  .route("/api", createCopyRoutes(getInstance))          // NEW
  .route("/api", createRiskRoutes(getInstance))           // NEW
  .route("/api", createSprintTimelineRoutes(getInstance)) // NEW
```

### Pattern 3: Test with In-Memory DB
**What:** Tests use `createTestDb()` (in-memory SQLite with migrations) and `createTestApp()` to get a fully wired Hono app.
**When to use:** Every route test file.
**Example:**
```typescript
// Source: packages/api/src/__tests__/routes/heatmap.test.ts (existing pattern)
let instance: DatabaseInstance;
let app: Hono;

beforeAll(() => {
  instance = createTestDb();
  app = createTestApp(instance);
  // Seed test data via instance.sqlite.prepare(...)
});

it("returns structured JSON", async () => {
  const res = await app.request("/api/health-checks");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.findings).toBeDefined();
});
```

### Pattern 4: SSE Event Listener Registration (Frontend)
**What:** The `useSSE` hook registers `addEventListener` for each event type string.
**When to use:** Adding `health:changed` and `copy:diverged` handlers.
**Example:**
```typescript
// Source: packages/web/src/hooks/use-sse.ts (existing pattern)
eventSource.addEventListener("health:changed", (e: MessageEvent) => {
  try {
    JSON.parse(e.data);
    optionsRef.current.onHealthChanged?.();
  } catch {
    // Ignore malformed events
  }
});
```

### Anti-Patterns to Avoid
- **Adding health data to scan cache:** Health data belongs in the DB (via `getActiveFindings()`), not in the `scanCache` TTL cache. The scan cache stores volatile git state; health findings are persisted with timestamps.
- **Computing risk level in the route handler:** Use the existing `getProjectRiskLevel()` from `db/queries/health.ts`. Do not re-implement severity ranking in route code.
- **Multiple DB round-trips per project in list endpoint:** The `/api/projects` modification needs `healthScore` and `riskLevel` per project. Fetch all active findings in one query, then compute per-project in JS. Do not call `getProjectRiskLevel()` N times inside a loop.
- **Emitting SSE events from route handlers:** Routes only read data. The scanner (Phase 7) already emits `health:changed` after each scan cycle. Routes never emit events.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Active findings per project | Custom SQL with joins | `getActiveFindings(db)` + JS groupBy | Already written and tested in Phase 6 |
| Risk level computation | Inline severity ranking in route | `getProjectRiskLevel(db, slug)` | Already written and tested in Phase 6 |
| Per-project copy records | New query with joins | `getCopiesByProject(db, slug)` | Already written in Phase 6 |
| SSE streaming | Custom EventSource setup | `streamSSE` from `hono/streaming` | Already used in `routes/events.ts` |
| Zod validation middleware | Manual req.query parsing | `zValidator("query", schema)` | Already used in captures and projects routes |
| Segment gap detection | SQL window functions | TypeScript iteration over sorted HeatmapEntry[] | SQL window functions in SQLite are awkward; the data is small (<500 rows for 12 weeks) and segment computation is trivial in JS |

**Key insight:** Phase 8 almost entirely composes existing Phase 6/7 functions into HTTP endpoints. The only genuinely new logic is sprint timeline segment computation and the `isNew` flag derivation for RISK-05.

## Common Pitfalls

### Pitfall 1: Hono RPC Type Chain Breakage
**What goes wrong:** Adding `.route()` calls in `app.ts` can cause the TypeScript compiler to lose type inference for the RPC client, making all typed endpoints return `unknown`.
**Why it happens:** Hono RPC types are computed via method chaining. Too many chained generics or a type error in any route breaks the entire chain.
**How to avoid:** Add one `.route()` call at a time. Run `pnpm typecheck` after each addition. If types break, check that the route factory returns `Hono` (not `Hono<any>`) and that all handlers return `c.json()` with concrete types.
**Warning signs:** Frontend RPC calls suddenly show return type as `unknown`; `pnpm typecheck` takes significantly longer (>30s).

### Pitfall 2: N+1 Query in Project List Enhancement
**What goes wrong:** Adding `healthScore`, `riskLevel`, and `copyCount` to each project in the `/api/projects` response by calling per-project query functions in a loop.
**Why it happens:** Natural instinct is to iterate over projects and call `getProjectRiskLevel(db, slug)` and `getCopiesByProject(db, slug)` for each.
**How to avoid:** Fetch all active findings with `getActiveFindings(db)` (no slug filter) once, group by `projectSlug` in JS, then compute `healthScore` and `riskLevel` per group. For copies, add a new `getAllCopies()` query that returns all rows, group by `projectSlug` in JS.
**Warning signs:** Project list endpoint takes >200ms with 35 projects.

### Pitfall 3: isNew Flag Races with Scan Cycle
**What goes wrong:** The `isNew` boolean (RISK-05) is computed by comparing `detectedAt` with "last scan time," but the scan cycle start time is not explicitly tracked.
**Why it happens:** `scanAllProjects()` does not store a "scan started at" timestamp anywhere accessible to route handlers.
**How to avoid:** Two options: (A) Track `lastScanStartedAt` as a module-level variable in `project-scanner.ts` and export a getter, or (B) approximate "current scan cycle" as findings where `detectedAt >= (now - scanInterval)`. Option A is more correct. The scanner already runs on a 5-minute interval, so a finding detected within the last 5 minutes is "new" for practical purposes.
**Warning signs:** Findings flip between `isNew: true` and `isNew: false` unpredictably.

### Pitfall 4: Sprint Timeline Density Computation
**What goes wrong:** The `density` field (0.0-1.0) in sprint timeline segments is computed incorrectly because the max commit count per day varies across projects.
**Why it happens:** Density should represent "how active was this segment relative to the project's peak activity," not an absolute measure.
**How to avoid:** Compute density as `segment.commits / (maxDailyCommits * daysInSegment)` where `maxDailyCommits` is the max for that specific project within the 12-week window. This normalizes density per project, making visual comparison meaningful.
**Warning signs:** All segments show density near 0.0 or 1.0 with no gradation.

### Pitfall 5: SSE Event Data Payload Too Large
**What goes wrong:** Including full finding details in the SSE `health:changed` event payload causes large payloads and coupling.
**Why it happens:** Temptation to send finding data in the event so the frontend does not need to refetch.
**How to avoid:** Follow the existing `scan:complete` pattern: the event is a notification only (`{ type: "health:changed", id: "all" }`). The frontend handler triggers a TanStack Query invalidation, which refetches the relevant API data. This keeps events lightweight and avoids duplicating response shapes.
**Warning signs:** SSE event data exceeds 1KB; frontend event handler does JSON parsing of finding arrays.

### Pitfall 6: Copy Listing Exposes Stale Data Without Warning
**What goes wrong:** The `/api/copies` endpoint returns copy records where `lastCheckedAt` may be hours old (Mac Mini SSH failure), but the response does not indicate staleness.
**Why it happens:** Copy records persist the last-known state; SSH failures deliberately skip upsert (COPY-04) to preserve stale data for age tracking.
**How to avoid:** Include `lastCheckedAt` in the response and optionally compute an `isStale` boolean (>10 minutes = 2 scan cycles). The frontend can then show a warning indicator.
**Warning signs:** Dashboard shows "synced" for a copy that has been unreachable for hours.

## Code Examples

### Health Checks Route (Primary Pattern)
```typescript
// packages/api/src/routes/health-checks.ts
import { Hono } from "hono";
import { getActiveFindings, getProjectRiskLevel } from "../db/queries/health.js";
import type { DatabaseInstance } from "../db/index.js";

export function createHealthCheckRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get("/health-checks", (c) => {
      const severity = c.req.query("severity"); // optional filter
      let findings = getActiveFindings(getInstance().db);
      if (severity) {
        findings = findings.filter((f) => f.severity === severity);
      }
      return c.json({ findings, total: findings.length });
    })
    .get("/health-checks/:slug", (c) => {
      const slug = c.req.param("slug");
      const findings = getActiveFindings(getInstance().db, slug);
      const riskLevel = getProjectRiskLevel(getInstance().db, slug);
      return c.json({ findings, riskLevel });
    });
}
```

### Risks Route with riskCount (RISK-04)
```typescript
// packages/api/src/routes/risks.ts
import { Hono } from "hono";
import { getActiveFindings } from "../db/queries/health.js";
import type { DatabaseInstance } from "../db/index.js";

export function createRiskRoutes(getInstance: () => DatabaseInstance) {
  return new Hono()
    .get("/risks", (c) => {
      const findings = getActiveFindings(getInstance().db);

      const critical = findings.filter((f) => f.severity === "critical");
      const warning = findings.filter((f) => f.severity === "warning");

      // RISK-04: Single integer for browser title
      const riskCount = critical.length + warning.length;

      return c.json({
        critical,
        warning,
        riskCount,
        summary: `${critical.length} critical, ${warning.length} warning`,
      });
    });
}
```

### Sprint Timeline Segment Computation
```typescript
// Segment computation from per-day heatmap data
interface TimelineSegment {
  startDate: string;
  endDate: string;
  commits: number;
  density: number;
}

function computeSegments(
  entries: Array<{ date: string; count: number }>,
  gapDays: number = 3
): TimelineSegment[] {
  if (entries.length === 0) return [];

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const maxDaily = Math.max(...sorted.map((e) => e.count));

  const segments: TimelineSegment[] = [];
  let segStart = sorted[0]!;
  let segEnd = sorted[0]!;
  let segCommits = sorted[0]!.count;

  for (let i = 1; i < sorted.length; i++) {
    const entry = sorted[i]!;
    const prevDate = new Date(segEnd.date);
    const currDate = new Date(entry.date);
    const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays <= gapDays) {
      segEnd = entry;
      segCommits += entry.count;
    } else {
      const daysInSeg = Math.max(1, Math.round(
        (new Date(segEnd.date).getTime() - new Date(segStart.date).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1);
      segments.push({
        startDate: segStart.date,
        endDate: segEnd.date,
        commits: segCommits,
        density: maxDaily > 0 ? segCommits / (maxDaily * daysInSeg) : 0,
      });
      segStart = entry;
      segEnd = entry;
      segCommits = entry.count;
    }
  }

  // Push final segment
  const daysInSeg = Math.max(1, Math.round(
    (new Date(segEnd.date).getTime() - new Date(segStart.date).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1);
  segments.push({
    startDate: segStart.date,
    endDate: segEnd.date,
    commits: segCommits,
    density: maxDaily > 0 ? segCommits / (maxDaily * daysInSeg) : 0,
  });

  return segments;
}
```

### Modifying Project List Response
```typescript
// In createProjectRoutes, modify the /projects handler to include health data
// Fetch all active findings ONCE, group in JS
const allFindings = getActiveFindings(getInstance().db);
const allCopies = getAllCopies(getInstance().db); // new query function

const findingsByProject = new Map<string, typeof allFindings>();
for (const f of allFindings) {
  const group = findingsByProject.get(f.projectSlug) ?? [];
  group.push(f);
  findingsByProject.set(f.projectSlug, group);
}

const copiesByProject = new Map<string, number>();
// Count copies per slug
for (const copy of allCopies) {
  copiesByProject.set(copy.projectSlug, (copiesByProject.get(copy.projectSlug) ?? 0) + 1);
}

// In the .map() for each project:
const findings = findingsByProject.get(project.slug) ?? [];
const healthScore = computeHealthScore(findings);
const riskLevel = findings.length === 0 ? "healthy" :
  findings.some(f => f.severity === "critical") ? "critical" :
  findings.some(f => f.severity === "warning") ? "warning" : "healthy";
const copyCount = copiesByProject.get(project.slug) ?? 0;
```

### SSE Handler Extension (Frontend)
```typescript
// packages/web/src/hooks/use-sse.ts additions
eventSource.addEventListener("health:changed", (e: MessageEvent) => {
  try {
    JSON.parse(e.data);
    optionsRef.current.onHealthChanged?.();
  } catch {
    // Ignore malformed events
  }
});

eventSource.addEventListener("copy:diverged", (e: MessageEvent) => {
  try {
    const data = JSON.parse(e.data) as { type: string; id: string };
    optionsRef.current.onCopyDiverged?.(data.id);
  } catch {
    // Ignore malformed events
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Heatmap-only commit view | Sprint timeline with segments | Phase 8 (this phase) | New `/api/sprint-timeline` endpoint; heatmap route deprecated but not removed |
| No health data in project list | `healthScore` + `riskLevel` + `copyCount` on each project | Phase 8 (this phase) | Project list response shape expands; existing consumers unaffected (additive fields) |
| SSE events: capture + scan only | Add health:changed + copy:diverged | Phase 8 (this phase) | Frontend SSE hook needs 2 new callbacks |

**Deprecated/outdated:**
- `/api/heatmap`: Still functional but superseded by `/api/sprint-timeline` for the dashboard. Not removed in v1.1.

## Open Questions

1. **isNew detection: module variable vs time window?**
   - What we know: RISK-05 requires findings from the "current scan cycle" to be marked new. `detectedAt` timestamp exists on all findings. Scanner runs every 5 minutes.
   - What's unclear: Whether to track scan-cycle-start as a module variable in the scanner or compute isNew as `detectedAt >= (now - 5min)`.
   - Recommendation: Use module-level `lastScanStartedAt` variable exported from `project-scanner.ts`. Set it at the start of `scanAllProjects()`. Route handlers compare `finding.detectedAt >= lastScanStartedAt`. This is precise and does not depend on interval timing.

2. **Focused project determination for sprint timeline**
   - What we know: Spec says `focusedProject` is "most commits in last 7 days." The data is available from the commit query.
   - What's unclear: Should this be computed in the SQL query or in the route handler?
   - Recommendation: Compute in the route handler after getting heatmap data. Sum commits per project where `date >= (today - 7 days)`, pick the max. Simple, testable, no new query needed.

3. **getAllCopies query: needed or just use raw SQL?**
   - What we know: `getCopiesByProject()` and `getCopiesByRemoteUrl()` exist. No function returns all copies.
   - What's unclear: Whether to add a Drizzle query or use raw SQL.
   - Recommendation: Add `getAllCopies()` to `db/queries/copies.ts` using Drizzle `db.select().from(projectCopies).all()`. Simple, consistent with existing pattern.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (workspace config at root) |
| Config file | `packages/api/vitest.config.ts` |
| Quick run command | `pnpm --filter @mission-control/api test` |
| Full suite command | `pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RISK-04 | `/api/risks` returns `riskCount` integer (critical + warning count) | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/risks.test.ts` | Wave 0 |
| RISK-05 | Findings include `isNew` boolean based on scan cycle timestamp | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/health-checks.test.ts` | Wave 0 |
| (implicit) | `/api/health-checks` returns active findings filterable by severity | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/health-checks.test.ts` | Wave 0 |
| (implicit) | `/api/health-checks/:slug` returns per-project findings + riskLevel | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/health-checks.test.ts` | Wave 0 |
| (implicit) | `/api/copies` returns all multi-copy projects | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/copies.test.ts` | Wave 0 |
| (implicit) | `/api/copies/:slug` returns copy details for one project | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/copies.test.ts` | Wave 0 |
| (implicit) | `/api/sprint-timeline` returns projects/segments/focusedProject/windowDays | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sprint-timeline.test.ts` | Wave 0 |
| (implicit) | Sprint timeline gap detection produces correct segments | unit | `pnpm --filter @mission-control/api test -- src/__tests__/routes/sprint-timeline.test.ts` | Wave 0 |
| (implicit) | `/api/projects` includes healthScore, riskLevel, copyCount per project | integration | `pnpm --filter @mission-control/api test -- src/__tests__/routes/projects.test.ts` | Existing (needs extension) |
| (implicit) | SSE hook handles health:changed and copy:diverged events | unit | `pnpm --filter @mission-control/web test -- src/__tests__/hooks/use-sse.test.ts` | Wave 0 or manual |
| (implicit) | `getAllCopies()` query returns all copy records | unit | `pnpm --filter @mission-control/api test -- src/__tests__/db/queries/copies.test.ts` | Existing (needs extension) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @mission-control/api test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/routes/health-checks.test.ts` -- covers health check listing, per-project detail, severity filter, isNew flag
- [ ] `packages/api/src/__tests__/routes/risks.test.ts` -- covers risk aggregation, riskCount (RISK-04)
- [ ] `packages/api/src/__tests__/routes/copies.test.ts` -- covers copy listing, per-project copies
- [ ] `packages/api/src/__tests__/routes/sprint-timeline.test.ts` -- covers segment computation, focusedProject, gap detection
- [ ] Extend `packages/api/src/__tests__/routes/projects.test.ts` -- add assertions for healthScore, riskLevel, copyCount fields
- [ ] Extend `packages/api/src/__tests__/db/queries/copies.test.ts` -- add `getAllCopies()` tests

## Sources

### Primary (HIGH confidence)
- Direct codebase examination: `routes/projects.ts`, `routes/captures.ts`, `routes/heatmap.ts`, `routes/events.ts`, `app.ts` -- all route patterns verified
- Direct codebase examination: `db/queries/health.ts` -- `getActiveFindings()`, `getProjectRiskLevel()` function signatures and behavior verified
- Direct codebase examination: `db/queries/copies.ts` -- `getCopiesByProject()`, `getCopiesByRemoteUrl()` verified; confirmed no `getAllCopies()` exists
- Direct codebase examination: `db/queries/commits.ts` -- `getHeatmapData()` returns per-day per-project counts, suitable as input to segment computation
- Direct codebase examination: `services/event-bus.ts` -- `MCEventType` already includes `health:changed` and `copy:diverged`
- Direct codebase examination: `services/project-scanner.ts` -- confirms `health:changed` emitted unconditionally at end of post-scan phase
- Design spec: `docs/superpowers/specs/2026-03-14-git-health-intelligence-design.md` Section 6 -- exact endpoint paths and response formats
- Test patterns: `__tests__/helpers/setup.ts`, `__tests__/routes/heatmap.test.ts`, `__tests__/routes/projects.test.ts` -- established integration test patterns

### Secondary (MEDIUM confidence)
- Hono RPC type inference behavior based on existing 8-route chain in `app.ts` -- extrapolated that 12 routes should still work, but needs typecheck verification
- Sprint timeline segment algorithm is a standard gap-detection pattern -- designed from first principles based on the spec's response format

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies; all patterns directly observed in codebase
- Architecture: HIGH - every route pattern, test pattern, and query function verified by reading source
- Pitfalls: HIGH - RPC type chain risk verified by counting existing `.route()` calls; N+1 query risk based on standard API design knowledge; isNew race condition identified from design spec analysis

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable -- no external dependencies, all internal codebase patterns)
