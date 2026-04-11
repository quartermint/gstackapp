# Phase 20: Ryan Power Dashboard - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Ryan can manage all quartermint projects from one surface — see status, trigger pipelines, query knowledge, and spot cross-repo patterns without opening a terminal. This is the admin/power user dashboard, separate from the operator experience. Extends existing dashboard components with multi-project overview, pipeline topology, ideation workspace, gbrain console, and cross-repo intelligence.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User confirmed existing dashboard patterns cover this phase's needs. Claude has full discretion on implementation:

- **D-01:** Multi-project overview layout (DASH-01) — card grid, list, or treemap for quartermint repos. Metrics per project (health score, last activity, open issues). Existing `ProjectGrid` and `ProjectCard` components available.
- **D-02:** Pipeline topology view (DASH-02) — extend existing `PipelineTopology` and `StageNode` components for cross-repo pipeline visualization with real-time status.
- **D-03:** Ideation workspace visualization (DASH-03) — how the office-hours → CEO review → eng review → execution flow renders. Existing `IdeationView`, `IdeationPipeline`, `IdeationStageNode` components available.
- **D-04:** gbrain console UX (DASH-04) — search interface, entity relationship display, compiled truth viewer. New surface.
- **D-05:** Cross-repo intelligence display (DASH-05) — "Seen in your other repos" alerts and pattern detection. Existing `CrossRepoInsight` component available.
- **D-06:** Navigation structure — how Ryan switches between multi-project overview, pipeline topology, ideation workspace, gbrain console, and cross-repo intelligence. Existing sidebar with component routing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Ryan Power Dashboard — DASH-01 through DASH-05

### Design System
- `DESIGN.md` — Pipeline hero takes 60%+ viewport, left-anchored layout, 12-column grid, operations-room aesthetic, stage identity colors

### Existing Dashboard Components
- `packages/web/src/components/dashboard/` — DashboardView, ProjectGrid, ProjectCard, InfraPanel, ServiceStatus
- `packages/web/src/components/pipeline/` — PipelineHero, PipelineTopology, StageNode, StageConnector
- `packages/web/src/components/ideation/` — IdeationView, IdeationPipeline, IdeationStageNode, ArtifactCard
- `packages/web/src/components/findings/` — CrossRepoInsight, FindingCard, FindingGroup
- `packages/web/src/components/trends/` — TrendsView, QualityScoreChart, FindingTrendChart, VerdictRateChart, chartTheme
- `packages/web/src/components/layout/` — Shell, Sidebar, BottomStrip, CommandPalette

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProjectGrid.tsx` + `ProjectCard.tsx` — Multi-project card layout (extend for all quartermint repos)
- `PipelineTopology.tsx` + `StageNode.tsx` + `StageConnector.tsx` — Pipeline visualization (extend for cross-repo view)
- `IdeationView.tsx` + `IdeationPipeline.tsx` — Ideation flow visualization
- `CrossRepoInsight.tsx` — Cross-repo finding display
- `TrendsView.tsx` + chart components — Quality trend charts (Recharts)
- `Shell.tsx` + `Sidebar.tsx` — App layout shell with sidebar navigation
- `BottomStrip.tsx` — Bottom intelligence strip (always visible)
- `CommandPalette.tsx` — Keyboard-driven navigation

### Established Patterns
- React components with Tailwind CSS styling
- TanStack Query for server state
- Recharts for data visualization
- SSE for real-time pipeline updates
- Left-anchored layout with sidebar navigation

### Integration Points
- Admin role (from Phase 17 auth) gates access to power dashboard
- Pipeline topology consumes SSE events from all active pipeline runs
- gbrain console calls gbrain MCP tools (from Phase 19 integration)
- Cross-repo intelligence queries sqlite-vec embeddings (existing)
- Ideation workspace shows operator pipeline runs (from Phase 18)

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

*Phase: 20-ryan-power-dashboard*
*Context gathered: 2026-04-11*
