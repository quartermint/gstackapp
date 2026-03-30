# Phase 4: Dashboard & Pipeline Visualization - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

React SPA dashboard with pipeline hero visualization, reverse-chronological PR feed, PR detail view, real-time SSE streaming, and DESIGN.md aesthetic compliance. Desktop-only (1024px min), dark mode only.

</domain>

<decisions>
## Implementation Decisions

### Pipeline Topology Layout
- **D-01:** Horizontal left-to-right flow — connected nodes following DESIGN.md mandate that "content is left-anchored and directional"
- **D-02:** Pipeline takes 60%+ of viewport height — it IS the product
- **D-03:** 5 stages as connected flow nodes with spectral identity colors (CEO=#FF8B3E, Eng=#36C9FF, Design=#B084FF, QA=#2EDB87, Security=#FF5A67)
- **D-04:** Signal flow traces along connector lines between stages (linear, 2.5s loop animation)

### Stage Animations
- **D-05:** Dim-to-bright reveal: stage completion animates from 20% opacity to 100% over 400ms ease
- **D-06:** Running pulse: active stage glows with 2s ease-in-out infinite pulse (box-shadow)
- **D-07:** All animations driven by SSE events — real-time, not polling

### PR Feed
- **D-08:** Dense cards — 5 verdict dots (colored by stage spectral identity), repo name, PR title, time ago. Linear-style density.
- **D-09:** Sorted by last activity (most recent first) — per user's timeline sorting preference from memory
- **D-10:** Click to expand into PR detail view

### PR Detail View
- **D-11:** Findings grouped by stage with stage spectral identity colors
- **D-12:** Each finding shows severity tier, description, file/line reference
- **D-13:** Feedback UI: thumbs up/down + optional context input per finding

### Technical
- **D-14:** SSE via Hono streamSSE → React EventSource for live pipeline progress
- **D-15:** TanStack Query v5 for data fetching, caching, background refetching
- **D-16:** Hono RPC client (hc) for type-safe API calls
- **D-17:** Tailwind CSS v4.2 with custom theme mapped to DESIGN.md tokens

### Claude's Discretion
- Exact node shape and connector line design
- Layout responsive behavior within the 1024px+ constraint
- Empty state design (no pipelines yet)
- Loading skeleton patterns
- How SSE events map to TanStack Query cache invalidation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design System (CRITICAL — read before any UI work)
- `DESIGN.md` — Full design system: colors, typography (General Sans, Geist, JetBrains Mono), spacing (4px base), layout (12-col grid, 200-240px sidebar), motion (dim-to-bright, running pulse, pipeline trace), border radius scale
- `DESIGN.md` §Stage Identity Colors — Per-stage spectral colors for pipeline nodes
- `DESIGN.md` §Status Verdict Colors — PASS/FLAG/BLOCK/SKIP/RUNNING colors
- `DESIGN.md` §Motion — Signature animations, easing, duration scale

### Architecture
- `.planning/research/ARCHITECTURE.md` §Frontend Layer — Pipeline hero, activity feed, quality trends, cross-repo intelligence components
- `.planning/research/ARCHITECTURE.md` §Recommended Project Structure — packages/web/ layout

### Stack
- `.planning/research/STACK.md` §Frontend — React 19.2, Vite 8, TanStack Query 5.95, Tailwind CSS 4.2, Recharts 2.15

### Design Artifacts
- `docs/artifacts/` — Design system HTML preview (reference for implementation)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1-3 establish: API routes for pipelines, repos, findings
- Phase 3 establishes: SSE event types for pipeline progress

### Established Patterns
- Hono RPC client provides end-to-end type safety without code generation
- Zod schemas from packages/shared used for response validation

### Integration Points
- GET /api/pipelines — list/detail pipeline runs
- GET /api/repos — installed repositories
- GET /api/sse — SSE stream for real-time updates
- GET /api/findings — findings with feedback

</code_context>

<specifics>
## Specific Ideas

- Dashboard should feel like an operations room — "Midnight operations room — matte carbon surfaces, forensic typography, high-voltage signal accents"
- Reference sites: linear.app (understated premium), buildkite.com (terminal-first bold), railway.com (atmospheric depth)
- Bottom intelligence strip for trends and cross-repo alerts (always visible, no scroll)
- Continuous pipeline rail, not bento grid — stages are connected flow nodes, not standalone cards

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-dashboard-pipeline-visualization*
*Context gathered: 2026-03-30*
