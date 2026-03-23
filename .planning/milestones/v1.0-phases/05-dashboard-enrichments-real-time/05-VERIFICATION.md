---
phase: 05-dashboard-enrichments-real-time
verified: 2026-03-10T22:20:00Z
status: human_needed
score: 11/11 must-haves verified
re_verification: false
human_verification:
  - test: "Open dashboard at http://localhost:5173 and verify sprint heatmap is visible above the departure board"
    expected: "A 'Sprint Activity' section with GitHub-style contribution grid rows per project appears between the capture field and the hero card. Hovering cells shows a tooltip with date and commit count. Only projects with recent commits appear."
    why_human: "Visual rendering, tooltip interactivity, and layout position cannot be verified programmatically."
  - test: "Click the health dot (colored circle next to 'Mission Control' in the header)"
    expected: "A panel drops down showing CPU load averages, memory usage with progress bar, disk usage with progress bar, uptime formatted as Xd Yh, and a services list (or 'No services configured'). Dot color matches API reachability status."
    why_human: "Health panel toggle, positioning, and content rendering require browser verification."
  - test: "Select a project from the departure board, then click the expand chevron that appears on its row"
    expected: "An inline 'Previously on...' section slides open showing the last 3-5 commits (short hash in mono, message, relative time). If the project has GSD state, a 'GSD: ...' line appears at the top."
    why_human: "Expandable breadcrumb reveal animation and commit data display require visual confirmation."
  - test: "Verify SSE real-time updates: open DevTools Network tab, find the /api/events EventSource connection"
    expected: "EventSource connection to /api/events is established and stays open. Submit a new capture in the capture field -- the capture appears on the dashboard without a page refresh."
    why_human: "SSE connection establishment and live event-triggered refetch require browser DevTools observation."
  - test: "Check stale project visual treatment"
    expected: "Any project idle 2+ weeks with uncommitted files shows a subtle amber left border and faint amber background. Hovering the row shows a tooltip like 'uncommitted changes -- 18 days idle'."
    why_human: "Requires a project that meets the stale condition (idle 2+ weeks, dirty files). Visual styling and tooltip are not testable programmatically."
---

# Phase 5: Dashboard Enrichments & Real-Time Verification Report

**Phase Goal:** The dashboard feels alive -- updates stream in without refresh, sprint patterns are visible at a glance, and ambient health indicators keep you aware of system state
**Verified:** 2026-03-10T22:20:00Z
**Status:** human_needed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SSE endpoint at /api/events streams domain events to connected clients | VERIFIED | `packages/api/src/routes/events.ts`: uses `streamSSE` from hono/streaming, registers `eventBus.on("mc:event", handler)`, calls `stream.writeSSE()` with event type and id, `stream.onAbort` cleans up listener |
| 2 | Heatmap endpoint at /api/heatmap returns commit counts aggregated by project and day over 12 weeks | VERIFIED | `packages/api/src/routes/heatmap.ts`: calls `getHeatmapData(db, weeks)`. `getHeatmapData` in `packages/api/src/db/queries/commits.ts` uses Drizzle sql template with GROUP BY project_slug and date(author_date), returns typed `HeatmapEntry[]` |
| 3 | Health system endpoint at /api/health/system returns CPU, memory, disk, uptime, and per-service status | VERIFIED | `packages/api/src/routes/health.ts`: `createHealthRoutes` factory exposes GET /health/system. `health-monitor.ts` collects `os.loadavg()`, `os.totalmem()/freemem()`, `df -k /`, `os.uptime()`, and `Promise.allSettled()` TCP port checks |
| 4 | Capture creation/enrichment/archival emits events through the event bus | VERIFIED | `packages/api/src/routes/captures.ts`: `eventBus.emit("mc:event", { type: "capture:created" })` and `eventBus.emit("mc:event", { type: "capture:archived" })`. `packages/api/src/services/enrichment.ts`: `eventBus.emit("mc:event", { type: "capture:enriched" })` |
| 5 | Project scanner completion emits scan:complete event through the event bus | VERIFIED | `packages/api/src/services/project-scanner.ts`: `eventBus.emit("mc:event", { type: "scan:complete", id: "all" })` at end of `scanAllProjects()` |
| 6 | Sprint heatmap displays above departure board showing commit intensity per project over 12 weeks | VERIFIED (automated) / NEEDS HUMAN (visual) | `packages/web/src/App.tsx` renders `<SprintHeatmap data={heatmapData} loading={heatmapLoading} />` between capture field spacer and hero card. `sprint-heatmap.tsx` groups by project, filters to projects with commits, renders `HeatmapGrid` per project with 5-level terracotta scale. Month labels and overflow-x-auto mobile scroll implemented. |
| 7 | Dashboard updates in real-time via SSE without requiring page refresh | VERIFIED (automated) / NEEDS HUMAN (live behavior) | `packages/web/src/hooks/use-sse.ts`: `new EventSource("/api/events")` with custom exponential backoff reconnect. `App.tsx` wires `useSSE` with `onCaptureCreated/Enriched/Archived` calling `handleCapturesChanged()` and `onScanComplete` calling `refetchProjects()` + `refetchHeatmap()` |
| 8 | Projects idle 2+ weeks with uncommitted work receive a subtle amber/gold visual nudge | VERIFIED (automated) / NEEDS HUMAN (visual) | `packages/web/src/lib/stale-nudge.ts`: `isStaleWithDirty` checks `daysIdle > 14 && dirtyFiles.length > 0`. `project-row.tsx` applies `border-amber-500/60 bg-amber-500/5` and sets `title` attribute with `getStaleNudgeMessage()` output |
| 9 | "Previously on..." breadcrumbs expand inline per project row showing last 3-5 commits and GSD state | VERIFIED (automated) / NEEDS HUMAN (visual) | `packages/web/src/components/departure-board/previously-on.tsx`: renders GSD state line + up to 5 commits (hash, message, relativeTime). `project-row.tsx`: local `expanded` state, chevron button stops propagation, CSS max-height transition reveals `<PreviouslyOn>`. Only selected project receives commits via `project-group.tsx` (avoids N+1) |
| 10 | Mac Mini health dot in header is clickable, expanding a panel with CPU, memory, disk, uptime, and service status | VERIFIED (automated) / NEEDS HUMAN (visual) | `dashboard-layout.tsx`: health dot is a `<button>` calling `onHealthClick`. `<HealthPanel>` renders when `healthPanelOpen && healthData`. `health-panel.tsx`: shows all required sections including progress bars and services list with "No services configured" fallback |
| 11 | SSE connection auto-reconnects with exponential backoff on disconnect | VERIFIED | `use-sse.ts`: `onerror` handler calculates `Math.min(1000 * Math.pow(2, retryCount), 30_000) + Math.random() * 1000` delay, increments `retryCount`, calls `setTimeout(connect, delay)`. `onopen` resets `retryCount` to 0. |

**Score:** 11/11 automated truths verified (5 truths also require human visual confirmation)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/event-bus.ts` | Typed EventEmitter singleton for domain event dispatch | VERIFIED | `MCEventBus extends EventEmitter` with typed `emit`/`on`/`removeListener` overloads. Exports `eventBus` singleton and `MCEvent` interface. `setMaxListeners(20)` for multi-tab support. |
| `packages/api/src/routes/events.ts` | SSE endpoint using Hono streamSSE | VERIFIED | GET /events via `streamSSE`, 30s keepalive sleep loop, `onAbort` cleanup. Exports `eventRoutes`. |
| `packages/api/src/services/health-monitor.ts` | System metrics collection via os module and child_process | VERIFIED | Exports `getSystemHealth(serviceList)` and `checkPort()`. Uses `os.loadavg`, `os.totalmem`, `df -k /` (promisified execFile), `net.createConnection`. |
| `packages/api/src/routes/heatmap.ts` | Heatmap API endpoint | VERIFIED | Factory `createHeatmapRoutes(getInstance)`. GET /heatmap with optional `weeks` param (default 12, max 52). Exports factory. |
| `packages/api/src/db/queries/commits.ts` | getHeatmapData aggregation query | VERIFIED | `getHeatmapData(db, weeksBack)` uses Drizzle `sql` template for GROUP BY aggregation. Returns typed `HeatmapEntry[]`. |
| `packages/web/src/hooks/use-sse.ts` | SSE connection hook with auto-reconnect and event dispatch | VERIFIED | `useSSE(options)` hook. `useRef` for stale-closure safety. Custom exponential backoff. Typed callbacks for all 4 event types. |
| `packages/web/src/hooks/use-heatmap.ts` | Hook to fetch heatmap data from /api/heatmap | VERIFIED | `useHeatmap()` fetches `/api/heatmap?weeks=12`. fetchCounter pattern for `refetch`. Returns `{ data, loading, refetch }`. |
| `packages/web/src/components/heatmap/sprint-heatmap.tsx` | Full-width heatmap container with project labels | VERIFIED | Groups data by project, filters to projects with commits, sorts by total commits descending, renders month labels, loading skeleton, overflow-x-auto mobile scroll. Returns null when empty. |
| `packages/web/src/components/heatmap/heatmap-grid.tsx` | SVG/CSS grid rendering for heatmap data | VERIFIED | Builds day-by-day array from startDate to endDate, fills counts from entries, renders project name label + HeatmapCell per day. |
| `packages/web/src/components/heatmap/heatmap-cell.tsx` | Individual intensity cell with tooltip | VERIFIED | 12x12px cells with `rounded-sm`. 5-level terracotta intensity scale. `title` attribute shows date + commit count. |
| `packages/web/src/hooks/use-health.ts` | Hook to poll /api/health/system every 30 seconds | VERIFIED | 30s `setInterval` with immediate first poll. Maps `overallStatus` to `HealthStatus` including "unreachable" fallback on fetch error. |
| `packages/web/src/components/health/health-panel.tsx` | Expandable health details panel anchored to header dot | VERIFIED | CPU, memory (progress bar), disk (progress bar), uptime (formatted Xd Yh), services (dot + name + status). Click-outside and Escape key dismissal. "No services configured" empty state. |
| `packages/web/src/components/departure-board/previously-on.tsx` | Inline expandable commit breadcrumbs for project rows | VERIFIED | Renders up to 5 commits (mono hash, truncated message, relative time). GSD state line at top if present. Terracotta/30 left border accent. |
| `packages/web/src/lib/stale-nudge.ts` | Pure function to detect stale projects needing nudge | VERIFIED | `isStaleWithDirty(project)`: false if no lastCommitDate or dirty !== true or empty dirtyFiles; true if daysIdle > 14 and dirtyFiles.length > 0. `getStaleNudgeMessage`: returns "uncommitted changes -- X days idle". |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `packages/api/src/routes/captures.ts` | `packages/api/src/services/event-bus.ts` | `eventBus.emit` on capture create/archive | WIRED | Lines 45, 120, 139: three distinct emit calls for capture:created and capture:archived |
| `packages/api/src/services/enrichment.ts` | `packages/api/src/services/event-bus.ts` | `eventBus.emit` on enrichment complete | WIRED | Line 98: emits capture:enriched after `updateCaptureEnrichment()` |
| `packages/api/src/services/project-scanner.ts` | `packages/api/src/services/event-bus.ts` | `eventBus.emit` on scan complete | WIRED | Line 219: emits scan:complete after all projects processed in `scanAllProjects()` |
| `packages/api/src/routes/events.ts` | `packages/api/src/services/event-bus.ts` | `eventBus.on` listener forwarding to SSE stream | WIRED | `eventBus.on("mc:event", handler)` calls `stream.writeSSE()`. `stream.onAbort` calls `eventBus.removeListener()` |
| `packages/api/src/app.ts` | All new routes | `app.route()` registration | WIRED | `app.route("/api", createHealthRoutes(...))`, `app.route("/api", eventRoutes)`, `app.route("/api", createHeatmapRoutes(...))` all present |
| `packages/web/src/hooks/use-sse.ts` | `/api/events` | `new EventSource("/api/events")` | WIRED | Line 38: `eventSource = new EventSource("/api/events")` |
| `packages/web/src/hooks/use-heatmap.ts` | `/api/heatmap` | fetch call | WIRED | Line 29: `fetch("/api/heatmap?weeks=12")` with response parsed and set to state |
| `packages/web/src/hooks/use-health.ts` | `/api/health/system` | 30-second polling interval | WIRED | `fetch("/api/health/system")` in `fetchHealth()` called immediately and via `setInterval(fetchHealth, 30_000)` |
| `packages/web/src/App.tsx` | `packages/web/src/hooks/use-sse.ts` | `useSSE` hook dispatching refetches | WIRED | `useSSE({ onCaptureCreated, onCaptureEnriched, onCaptureArchived, onScanComplete })` — all 4 callbacks wired to refetch functions |
| `packages/web/src/components/departure-board/project-row.tsx` | `packages/web/src/lib/stale-nudge.ts` | `isStaleWithDirty` check for conditional styling | WIRED | Lines 27, 32-38, 44: `isStaleWithDirty(project)` controls border/background classes and `title` attribute |
| `packages/web/src/components/layout/dashboard-layout.tsx` | `packages/web/src/components/health/health-panel.tsx` | Click handler on health dot toggles panel | WIRED | Health dot is a `<button>` calling `onHealthClick`. `<HealthPanel>` conditionally rendered when `healthPanelOpen && healthData && onHealthPanelClose` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DASH-05 | 05-01, 05-02 | Sprint heatmap displays GitHub-style contribution grid with one row per project showing commit intensity over last 12-16 weeks | SATISFIED | Backend: `getHeatmapData` query + `/api/heatmap` endpoint. Frontend: `SprintHeatmap` > `HeatmapGrid` > `HeatmapCell` chain with 5-level terracotta scale. Month labels. Mobile horizontal scroll. Wired in `App.tsx`. |
| DASH-06 | 05-03 | "Previously on..." expandable breadcrumbs show recent commit messages and GSD pause summaries per project | SATISFIED | `PreviouslyOn` component renders last 3-5 commits + GSD state. `ProjectRow` exposes expand chevron with CSS max-height transition. Detail data threaded from `App.tsx` through `DepartureBoard` > `ProjectGroup` > `ProjectRow`. Collapsed by default. |
| DASH-07 | 05-03 | Projects idle 2+ weeks with uncommitted work receive subtle visual treatment | SATISFIED | `stale-nudge.ts` pure functions with 14-day threshold. `ProjectRow` applies amber border/background when stale. `title` attribute provides hover tooltip. |
| DASH-08 | 05-01, 05-03 | Mac Mini health pulse shows reachability and service status as ambient indicator (green/amber/red) | SATISFIED | `/api/health/system` returns overallStatus + full metrics. `useHealth` polls every 30s. `DashboardLayout` maps status to dot color (sage/amber-500/rust). `HealthPanel` expands on click showing all sections. |
| DASH-09 | 05-01, 05-02 | Dashboard updates in real-time via SSE without requiring page refresh | SATISFIED | `eventBus` singleton emits from captures/enrichment/scanner. `/api/events` SSE endpoint forwards events. `useSSE` hook with exponential backoff reconnect. All refetch callbacks wired in `App.tsx`. |

**All 5 required requirements satisfied. No orphaned requirements.**

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/web/src/components/heatmap/sprint-heatmap.tsx` | 109 | `return null` | Info | Intentional guard — "if no data after filtering, don't render anything." Per-spec behavior from PLAN 05-02. Not a stub. |

No blocker or warning anti-patterns found. The single `return null` is an explicit design choice documented in both the plan and the component's inline comment.

### Human Verification Required

#### 1. Sprint Heatmap Visual Rendering

**Test:** Open the dashboard at http://localhost:5173 (run `pnpm dev` if not already running). Look above the hero card and below the capture field.
**Expected:** A "Sprint Activity" section is visible with one row per project that has commits in the last 12 weeks. Each row shows the project name on the left and a grid of small colored squares (terracotta scale, darker = more commits). Hovering a cell shows a tooltip like "2026-02-15: 3 commits". The heatmap is absent if no projects have recent commits, and horizontally scrollable on mobile.
**Why human:** Visual rendering, tooltip interactivity, cell colors, and layout positioning cannot be verified programmatically.

#### 2. Health Panel Toggle and Content

**Test:** Click the small colored dot to the right of "Mission Control" in the page header.
**Expected:** A dropdown panel appears below the dot showing: CPU Load (1m / 5m) and Cores, Memory usage with a filled progress bar and MB numbers, Disk usage with a progress bar and GB numbers, Uptime formatted as "Xd Yh", and a Services section (either a list with colored dots or "No services configured"). The dot itself should be green if the API is healthy, amber if degraded, red if unreachable. Click outside the panel or press Escape to close it.
**Why human:** Panel dropdown positioning, progress bar rendering, and dismiss behavior require browser observation.

#### 3. "Previously On" Breadcrumbs

**Test:** Click a project row in the departure board to select it. Look for a small chevron icon at the right edge of the selected row and click it.
**Expected:** An inline section slides open below the row (smooth animation) showing the last 3-5 commits: each with a short 7-char hash in monospace, the commit message truncated, and the relative time right-aligned. If the project has GSD state, a line like "GSD: Phase 3 in-progress -- 60% complete" appears above the commits. Clicking the chevron again collapses the section. Non-selected rows should NOT show this expansion (they have no detail data loaded).
**Why human:** Animation, data fidelity, and expand/collapse behavior require visual confirmation.

#### 4. SSE Real-Time Updates

**Test:** Open browser DevTools (Network tab, filter to "EventSource" or "WS"). Load the dashboard.
**Expected:** A persistent connection to `/api/events` appears in the Network tab with status 200 and type "eventsource". Type something in the capture field and submit it. Without reloading the page, the new capture should appear on the dashboard (woven into the project card or loose thoughts). The SSE connection should remain open; if temporarily disrupted, it reconnects automatically.
**Why human:** Live event delivery and EventSource visibility require DevTools observation.

#### 5. Stale Project Visual Nudge

**Test:** Look for any project row in the departure board that has been idle for 2+ weeks with uncommitted files (dirty indicator visible). Hover over that row.
**Expected:** The row has a subtle amber/gold left border and a faint amber background tint distinguishing it from neighboring rows. A tooltip on hover reads something like "uncommitted changes -- 18 days idle". The styling should be subtle ("hey" not alarming) relative to the selected project's terracotta styling.
**Why human:** Requires a qualifying stale project to be present. Visual subtlety and tooltip require human judgment.

### Summary

All 11 automated must-haves verified across the three sub-plans:

- **05-01 (API backend):** Event bus singleton, SSE endpoint, heatmap aggregation query and route, health monitor with TCP port checks, config schema extension with services array, event emission from captures/enrichment/scanner all confirmed in code with full implementations.

- **05-02 (Heatmap + SSE frontend):** `useSSE` hook with exponential backoff, `useHeatmap` hook with fetchCounter refetch, `useProjects` refetch extension, SprintHeatmap/HeatmapGrid/HeatmapCell component chain, and full App.tsx wiring all confirmed substantive and wired.

- **05-03 (Enrichments):** `stale-nudge.ts` pure functions, `PreviouslyOn` breadcrumbs, `useHealth` 30s polling hook, `HealthPanel` with all sections, `ProjectRow` stale styling and expand chevron, `DashboardLayout` clickable health dot with panel toggle all confirmed substantive and wired.

All 135 tests pass (28 web, 107 API). TypeScript typecheck clean. Production build succeeds (133 modules, 295KB JS). All 7 task commits verified in git history.

The 5 human verification items are visual/behavioral — the wiring and implementations are all present and correct. No blocker issues found.

---
_Verified: 2026-03-10T22:20:00Z_
_Verifier: Claude (gsd-verifier)_
