# Phase 28: Dashboard Highlight Mode - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

User opens MC each morning and instantly sees which projects changed since their last visit. Changed projects float to top of group with visual highlight. Summary count in top strip. No dependency on knowledge/convention phases — independent of Phase 24-27 chain.

</domain>

<decisions>
## Implementation Decisions

### Visual highlight treatment
- **D-01:** Left accent bar — subtle 3px left border in terracotta/indigo on changed project rows
- **D-02:** Does not compete with existing health dots, convergence badges, or discovery popovers
- **D-03:** Changed projects float to top of their group (Active/Idle/Stale)

### Summary placement
- **D-04:** "N projects changed since yesterday" count in top strip, alongside existing What's New discovery/star badges
- **D-05:** Visible without scrolling — leverages the existing ambient awareness zone

### Highlight persistence
- **D-06:** Highlights clear on scroll/interaction — once user scrolls past or clicks a highlighted project, highlight fades
- **D-07:** Natural "I've seen this" behavior — no manual dismiss action needed

### Last-visit tracking
- **D-08:** Server stores last-visit timestamp per client via API endpoint (not localStorage-only) — per DASH-01
- **D-09:** Client sends "visit" ping on dashboard load, server records timestamp

### Claude's Discretion
- Exact accent bar color token (terracotta vs indigo, light vs dark mode)
- Float-to-top animation (instant vs smooth transition)
- Scroll/interaction detection implementation
- API endpoint design for visit tracking

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dashboard highlight
- `.planning/REQUIREMENTS.md` — DASH-01 through DASH-04 define highlight mode requirements
- `.planning/ROADMAP.md` §Phase 28 — Success criteria (4 items)

### Existing dashboard patterns
- `packages/web/src/components/departure-board/` — DepartureBoard grouping, ProjectRow rendering
- `packages/web/src/components/hero/` — Top strip area with What's New badges
- `packages/web/src/hooks/` — fetchCounter pattern, useSSE for real-time refresh
- `packages/web/src/lib/health-colors.ts` — SEVERITY_COLORS palette

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Top strip component: Already houses What's New badges — add summary count here
- DepartureBoard grouping logic: Already sorts projects within groups — add "changed" priority sort
- SEVERITY_COLORS: Terracotta/warm palette tokens available for accent bar
- useSSE hook: `scan:complete` event can trigger highlight recalculation

### Established Patterns
- fetchCounter for SSE-driven refetch — last-visit data follows same pattern
- Tailwind v4 CSS custom properties — accent bar uses existing token system
- Project row rendering with conditional elements (health dot, host badge, stale nudge) — accent bar is another conditional

### Integration Points
- New API endpoint: `POST /api/visits` (record visit), `GET /api/visits/last` (retrieve last visit timestamp)
- DepartureBoard component: Sort changed projects to top within each group
- ProjectRow component: Conditional left border accent
- Top strip: New summary count badge

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

*Phase: 28-dashboard-highlight-mode*
*Context gathered: 2026-03-21*
