# Phase 8: Health API & Events - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

6 new API endpoints (health-checks, risks, copies, sprint-timeline) plus modifications to existing project list/detail responses. SSE event extensions for real-time dashboard updates. No scanner changes, no dashboard components — pure API layer.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
User deferred all API design decisions. Follow the design spec and existing Hono patterns:

- **API response shapes:** Follow spec examples exactly (Section 6 of design spec). Sprint timeline returns `{ projects, focusedProject, windowDays }`.
- **SSE event granularity:** Single batch `health:changed` event per scan cycle (not per-project). Follow existing `scan:complete` pattern. Add `copy:diverged` for divergence-specific events.
- **Route organization:** Follow existing pattern — one file per domain (`health-checks.ts`, `sprint-timeline.ts` in `routes/`).
- **Hono RPC type chain:** Minimize `.route()` calls to preserve RPC type inference. Verify types after each addition.
- **Current-scan-cycle "new" detection:** Include `isNew` boolean on findings based on `detectedAt` timestamp comparison with last scan time.
- **Risk count for page title:** Include `riskCount` in risks endpoint response for browser title integration.

</decisions>

<specifics>
## Specific Ideas

No specific requirements — follow the design spec (Section 6: API Routes) which has exact endpoint definitions and response formats.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/api/src/routes/projects.ts`: Existing route handlers using Hono RPC pattern.
- `packages/api/src/services/event-bus.ts`: `MCEventType` union for SSE events.
- `packages/api/src/db/queries/health.ts`: `getActiveFindings()`, `getProjectRiskLevel()` — Phase 6 query functions.
- `packages/api/src/db/queries/copies.ts`: `getCopiesByProject()`, `getCopiesByRemoteUrl()` — Phase 6.
- `packages/api/src/db/queries/commits.ts`: Existing commit data used by sprint timeline aggregation.

### Established Patterns
- **Route handlers:** Hono `.get()` with Zod validation via `zValidator()`, typed responses.
- **SSE:** EventSource pattern with `text/event-stream` content type, `eventBus.on("mc:event")` listener.
- **RPC client:** `hc<AppType>` in frontend — route chaining must preserve type inference.

### Integration Points
- `packages/api/src/app.ts`: Register new route groups via `.route()`.
- Existing `/api/projects` and `/api/projects/:slug`: Add `healthScore`, `riskLevel`, `copyCount` to responses.
- `packages/web/src/hooks/use-sse.ts`: Frontend SSE hook — add handlers for new event types.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-health-api-events*
*Context gathered: 2026-03-14*
