# Phase 6: Onboarding & Quality Trends - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Guided setup wizard (install GitHub App → select repos → trigger first review) and quality trend visualizations (per-repo scores, per-stage pass rates, finding frequency). Requires accumulated pipeline data from prior phases.

</domain>

<decisions>
## Implementation Decisions

### Onboarding Wizard
- **D-01:** In-app guided wizard surfaces when no repos are connected (detected on dashboard load)
- **D-02:** Flow: Install GitHub App → Select repositories → Open a PR or trigger first review on existing PR
- **D-03:** First review experience shows pipeline running in real-time with actual PR data (not dummy data)
- **D-04:** Wizard includes user preference capture: failure handling preference (retry+FLAG default, retry+SKIP, fail-fast)

### Quality Scoring
- **D-05:** Weighted scoring algorithm — findings weighted by severity tier: Tier 1 (critical) = 3x weight, Tier 2 (notable) = 1x weight, Tier 3 (minor) = 0 weight
- **D-06:** Quality score = 100 - (weighted_finding_sum / normalization_factor). Higher = cleaner code.
- **D-07:** Scores calculated per-repo and per-stage

### Trend Visualization
- **D-08:** Recharts line/area charts for quality score over time (per-repo)
- **D-09:** Per-stage pass/flag/block rates as stacked area charts
- **D-10:** Finding frequency trends showing how patterns change over time
- **D-11:** Charts follow DESIGN.md color system — stage spectral colors for per-stage views

### Claude's Discretion
- Exact normalization factor for quality score calculation
- Time granularity for trend charts (daily? weekly? auto-adapt to data volume?)
- Onboarding wizard step count and transitions
- How to handle repos with <5 pipeline runs (insufficient data for trends)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design System
- `DESIGN.md` — Full design system for wizard UI and chart styling
- `DESIGN.md` §Stage Identity Colors — Colors for per-stage trend charts

### Stack
- `.planning/research/STACK.md` §Recharts — v2.15 for trend charts
- `.planning/research/STACK.md` §Frontend — React, TanStack Query, Tailwind CSS

### Features
- `.planning/research/FEATURES.md` §Differentiators — Quality trends dashboard, builder-community aesthetic

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 4 establishes: dashboard layout, TanStack Query patterns, Tailwind theme
- Phase 3 establishes: findings data with severity tiers (basis for scoring)

### Established Patterns
- Dashboard component patterns from Phase 4
- SSE patterns for real-time updates
- DESIGN.md token system via Tailwind CSS custom theme

### Integration Points
- Dashboard sidebar or top-level route for onboarding wizard
- Dashboard bottom intelligence strip for trend charts
- API endpoints for aggregated quality scores and trend data

</code_context>

<specifics>
## Specific Ideas

- Onboarding should feel effortless — "trigger first review" is the magic moment
- Quality trends show improvement over time — positive reinforcement for code quality habits
- Charts should be dense and functional, not enterprise-bloated. Linear-style density.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-onboarding-quality-trends*
*Context gathered: 2026-03-30*
