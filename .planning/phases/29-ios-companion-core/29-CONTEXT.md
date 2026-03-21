# Phase 29: iOS Companion Core - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

iOS app with share sheet capture and offline queue with foreground sync. Native SwiftUI project dashboard (read-only). Lives in sibling repo ~/mission-control-ios. Widget and voice capture are Phase 30.

</domain>

<decisions>
## Implementation Decisions

### Share sheet capture flow
- **D-01:** Minimal confirm UI — brief slide-up showing captured content preview + optional project picker dropdown + "Save" button
- **D-02:** Dismisses in 1 tap. Like sharing to Notes or Reminders — zero friction.
- **D-03:** Share sheet extension stays within 120MB memory ceiling (no networking, no heavy frameworks in extension)
- **D-04:** Content saved to shared App Group container for main app to sync later

### Native iOS dashboard
- **D-05:** Simple scrollable list grouped by Active/Idle/Stale — same grouping as web dashboard
- **D-06:** Each row: project name, health dot, last commit time, capture count
- **D-07:** Pull-to-refresh, "Last synced: X ago" when offline
- **D-08:** Like Apple Health summary cards — glanceable, not interactive deep-dive

### Offline/sync UX
- **D-09:** Subtle banner at top: "☁️ 3 captures pending sync" when offline, animates away on successful sync
- **D-10:** Badge on app icon shows pending capture count
- **D-11:** Sync happens automatically when app comes to foreground (foreground-only, no background sync)
- **D-12:** Retry logic with idempotency keys (Phase 23 foundation) prevents duplicate captures

### Tailscale handling
- **D-13:** Passive indicator — status bar shows "Offline — connect to Tailscale" with tap-to-open deep link
- **D-14:** Captures still work when offline (queued locally). No blocking modals.
- **D-15:** User-assigned project on captures preserved — server AI categorization does not override manual assignment (IOS-13)

### Architecture (from CEO review)
- **D-16:** Sibling repo ~/mission-control-ios (not monorepo) — Swift/Xcode expects own project root
- **D-17:** Native SwiftUI (not WKWebView) — native scroll physics, haptics, gestures worth the effort
- **D-18:** Tailscale trust model (same as browser) — phone theft → revoke Tailscale device
- **D-19:** Foreground-only sync (no BGAppRefreshTask) — sufficient for v1.4

### Claude's Discretion
- SwiftUI layout and styling details
- Core Data schema for offline queue
- App Group container naming
- Network reachability detection approach
- Share sheet extension implementation specifics

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### iOS requirements
- `.planning/REQUIREMENTS.md` — IOS-01, IOS-02, IOS-07 through IOS-13 define Phase 29 requirements
- `.planning/ROADMAP.md` §Phase 29 — Success criteria (5 items)

### API contract (iOS consumes these)
- `packages/api/src/routes/captures.ts` — Capture creation endpoint, Zod validation schema
- `packages/api/src/routes/projects.ts` — Project list endpoint (for dashboard and project picker)
- `packages/api/src/routes/health-checks.ts` — Health findings endpoint (for health dots)
- `packages/shared/src/` — Shared Zod schemas defining API response shapes

### Architecture decisions
- `.planning/STATE.md` §Accumulated Context — CEO review decisions on iOS architecture

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- API endpoints are already JSON-based with Zod schemas — iOS client can consume directly
- Capture creation endpoint already accepts optional projectId — share sheet can include project assignment
- Health findings API already returns severity/checkType — map directly to health dot colors
- CLI offline queue pattern (`~/.mc/queue.jsonl`) — conceptual pattern for iOS Core Data queue

### Established Patterns
- API-first architecture: iOS is just another client, same as dashboard and CLI
- Idempotency key on captures (Phase 23) — iOS sync retries won't create duplicates
- Project grouping by status (Active/Idle/Stale) — replicate same grouping logic in SwiftUI

### Integration Points
- `POST /api/captures` — share sheet writes to offline queue, app syncs to this endpoint
- `GET /api/projects` — project list for dashboard view and capture project picker
- `GET /api/health-checks` — health findings for dashboard health dots
- Idempotency-Key header — offline queue attaches UUID per capture for dedup

</code_context>

<specifics>
## Specific Ideas

- Share sheet should feel like sharing to Notes or Reminders — familiar iOS pattern
- Dashboard should feel like Apple Health summary cards — glanceable, clean
- Tailscale handling should be passive, not aggressive — captures always work offline

</specifics>

<deferred>
## Deferred Ideas

- iOS background sync (BGAppRefreshTask) — deferred, foreground sync sufficient for v1.4
- Push notifications for critical health alerts — deferred, pull-based by design
- Screenshot OCR capture — deferred, Vision framework complexity
- Camera/whiteboard capture — out of scope, MC captures thoughts not images

</deferred>

---

*Phase: 29-ios-companion-core*
*Context gathered: 2026-03-21*
