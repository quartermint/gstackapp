# Phase 9: Dashboard Intelligence - Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Risk feed component, sprint timeline component (replacing heatmap), and health dot indicators on project cards. All frontend — consumes API endpoints from Phase 8. No backend changes.

</domain>

<decisions>
## Implementation Decisions

### Risk Feed Layout
- **Compact single-line cards** — severity icon + project + problem + duration + action hint, all on one line per finding
- Cards grouped by severity (critical first), non-dismissable (disappear only when resolved)
- **When clean:** Subtle green bar showing "✓ All projects healthy" (not empty/invisible — confirms system is working)
- **Action hints are copy-command** — clicking copies the actual git command to clipboard (e.g., `git push origin main`). MC is awareness, not action, but saves typing.
- **"new" badge** on findings detected in current scan cycle

### Color Treatment
- **Warm palette adapted for severity** — deep rust for critical, warm gold for warning, sage green for healthy. Matches the terracotta/Arc design energy from v1.0, not standard red/amber/green.

### Sprint Timeline
- **Thin bars (8-12px)** per project swimlane — compact, pattern-focused, sparkline feel
- **Top 10 by activity** — cap at 10 most active projects in the 12-week window. Prevents timeline from growing unbounded.
- **Focused project highlighting** — most commits in last 7 days gets full saturation, others are muted/dimmed. Eye drawn to current work.
- Hover shows commit count + date range; click navigates to project on departure board
- Custom SVG/CSS rendering (no charting library — consistent with v1.0 heatmap approach)

### Health Dot Indicators
- **Position: right side with badges** — alongside existing dirty-files badge and branch badge. Groups all status metadata together.
- Green/amber/red dot based on worst active finding. Split dot for multi-copy divergence.
- **Expand-on-click: compact format matching risk feed** — single-line per finding with severity icon + problem + duration + action hint. Consistent density across the dashboard.
- Same expandable pattern as "Previously On..." commit breadcrumbs.

### Claude's Discretion
- Exact dot size and split-dot visual treatment
- Sprint timeline segment gap threshold (recommend 3 calendar days)
- Risk feed animation/transition when findings resolve
- Page title risk count format (e.g., "(3) Mission Control")
- Sprint timeline density color ramp (light → saturated within warm palette)

</decisions>

<specifics>
## Specific Ideas

- Risk feed should feel like a status bar, not an alert panel — compact, informational, not alarming
- Sprint timeline thin bars like sparklines — the pattern of serial sprints should be immediately visible
- The warm palette (rust/gold/sage) should make severity feel like the dashboard's native language, not bolted-on monitoring chrome

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/web/src/components/heatmap/`: Existing heatmap components (being replaced). Custom SVG/CSS pattern to follow.
- `packages/web/src/components/departure-board/project-row.tsx`: Existing project cards with badge slots.
- `packages/web/src/components/departure-board/previously-on.tsx`: Expandable breadcrumbs pattern to reuse for health dot expansion.
- `packages/web/src/hooks/use-sse.ts`: SSE hook for real-time updates — add `health:changed` handler.
- `packages/web/src/app.css`: Tailwind v4 CSS-native theming with @theme tokens.

### Established Patterns
- **TanStack Query** for data fetching with typed hooks.
- **Tailwind v4** with @custom-variant dark mode.
- **Component organization**: domain folders (heatmap/, departure-board/, capture/, hero/).

### Integration Points
- `packages/web/src/App.tsx`: Layout order — capture field → risk feed → sprint timeline → departure board.
- New TanStack Query hooks needed: `useHealthRisks()`, `useSprintTimeline()`, `useProjectHealth()`.
- SSE event handlers for `health:changed` to trigger query invalidation.

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-dashboard-intelligence*
*Context gathered: 2026-03-14*
