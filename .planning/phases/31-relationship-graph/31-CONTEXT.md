# Phase 31: Relationship Graph - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Interactive D3-force project relationship graph showing dependency connections across the entire project ecosystem. Lazy-loaded and code-split. Depends on Phase 25 dependency data.

</domain>

<decisions>
## Implementation Decisions

### Interaction model
- **D-01:** Hover a node: tooltip with project name, health status, dependency count
- **D-02:** Click a node: highlights its dependency chain (upstream + downstream), dims unrelated nodes
- **D-03:** Drag to rearrange node positions, zoom/pan to navigate
- **D-04:** Force-directed layout settles naturally, user can pin nodes by dragging

### Node information density
- **D-05:** Each node shows project name + health dot (colored by health status)
- **D-06:** Host indicated by node border color (local vs mac-mini) — no separate badge
- **D-07:** Minimal, clean graph — details available on hover/click

### Architecture (from CEO review)
- **D-08:** D3-force for force-directed layout (~40KB, scoped to d3-force module only)
- **D-09:** Lazy-loaded via React.lazy and code-split — d3-force not in main dashboard bundle (INTEL-08)
- **D-10:** Graph is a separate route/view, not embedded in the departure board

### Claude's Discretion
- D3-force simulation parameters (charge strength, link distance, collision radius)
- Edge styling (arrows, thickness, color)
- Tooltip design and positioning
- Graph container sizing and responsive behavior
- Color palette for host differentiation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Relationship graph
- `.planning/REQUIREMENTS.md` — INTEL-07, INTEL-08 define graph requirements
- `.planning/ROADMAP.md` §Phase 31 — Success criteria (3 items)

### Dependency data source
- `.planning/phases/25-dependency-intelligence/25-CONTEXT.md` — Dependency detection and badge decisions
- `packages/api/src/lib/config.ts` — dependsOn field in config schema (Phase 23)

### Architecture decisions
- `.planning/STATE.md` §Accumulated Context — CEO review: D3-force library exception

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- SEVERITY_COLORS: Health dot colors reusable for graph node coloring
- HostBadge color tokens: Host differentiation colors for node borders
- Config dependsOn data: Graph edges derived from config dependency declarations

### Established Patterns
- No existing charting libraries — this is the first external visualization library (D3-force)
- Custom SVG/CSS used for heatmap and timeline — but D3-force is necessary for force-directed layout
- React.lazy for code splitting — established pattern for heavy components

### Integration Points
- API endpoint: `/api/dependencies` or extend `/api/projects` with dependency graph data
- New route: `/graph` or `/relationships` — separate view from main dashboard
- Navigation: Link from departure board to graph view
- D3-force module: `d3-force` package (~40KB) — only d3 module needed

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 31-relationship-graph*
*Context gathered: 2026-03-21*
