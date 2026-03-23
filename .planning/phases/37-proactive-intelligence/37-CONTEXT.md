# Phase 37: Proactive Intelligence - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

MC stops being pull-only. The Intelligence Daemon (Phase 35) generates morning digests, surfaces stale captures, detects activity patterns, and finds cross-project insights. This phase wires that intelligence into the dashboard UX.

</domain>

<decisions>
## Implementation Decisions

### Morning Digest
- **D-01:** The What's New top strip evolves into an "intelligence strip." Morning view shows AI-generated digest; after reading (click or scroll past), fades to regular What's New content. Same real estate, smarter content.
- **D-02:** Digest generated overnight by DAEMON-04 (Phase 35). Dashboard pulls from intelligence cache on load.
- **D-03:** Digest content prioritized by actionability: stale captures first, then dependency drift, then activity summary.

### Stale Capture Triage
- **D-04:** Captures older than 7d without project assignment → surface for triage with suggested actions (assign, archive, dismiss).

### Activity Patterns
- **D-05:** "You captured 5 openefb ideas this week but haven't committed in 12 days" — gap detection between capture intent and execution.
- **D-06:** Session pattern insights: "Your most productive sessions start after 10am and last 45min."

### Cross-Project Insights
- **D-07:** Surface shared patterns across projects: "cocobanana and openefb both reference MapLibre — shared pattern?"

### Insight Management
- **D-08:** Insights can be dismissed or snoozed. Dismissed insights don't resurface. Prevents insight fatigue.

### Claude's Discretion
- Insight card design and visual treatment
- Pattern detection algorithms and thresholds
- How insights transition from intelligence strip to dismissal
- Whether insights group or display individually
- Stale capture triage UX layout (inline vs modal vs sidebar)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Vision
- `.planning/v2.0-VISION.md` — PROACT-01 through PROACT-06 requirements

### Dashboard Components
- `packages/web/src/components/departure-board/` — Main dashboard layout
- `packages/web/src/components/hero/` — Hero card components
- Existing "What's New" strip pattern — to be evolved into intelligence strip

### Intelligence Infrastructure (Phase 35)
- Phase 35's `intelligence_cache` table — digest and insights served from cache
- Phase 35's scheduled generation — daily digest at 6am

### Capture Data
- `packages/api/src/db/queries/captures.ts` — Capture queries (stale detection)
- `packages/api/src/db/queries/search.ts` — Cross-content search (pattern detection)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- What's New strip components — evolve into intelligence strip
- Health findings card pattern — reuse for insight cards (severity, metadata, dismiss action)
- `useSSE` hook — subscribe to intelligence events
- Discovery popover pattern — reuse for insight detail views
- `seenSlugs` state pattern (Phase 28) — track dismissed insights similarly

### Established Patterns
- Border priority system: selected > stale > changed > default (extend with insight state)
- SSE event-driven dashboard refresh
- fetchCounter pattern for pulling cached data
- "Float to top" sort behavior for items needing attention

### Integration Points
- What's New strip — replace content with intelligence digest
- `GET /api/intelligence/digest` — new endpoint serving cached digest
- `GET /api/intelligence/insights` — new endpoint serving active insights
- `POST /api/intelligence/insights/:id/dismiss` — dismiss action
- `useSSE` — add `intelligence:digest` and `intelligence:insight` event types

</code_context>

<specifics>
## Specific Ideas

- The intelligence strip should feel like opening a newspaper — the headline is what changed, the subtext is what it means. Not raw data.
- Stale capture triage could work like email triage: swipe/click actions for assign/archive/dismiss. Quick resolution, no modal interruption.
- Cross-project insights should cite specific evidence: "openefb commit abc123 mentions MapLibre GL, cocobanana capture #456 mentions MapLibre styling" — not just "both mention MapLibre."

</specifics>

<deferred>
## Deferred Ideas

- Push notifications for critical insights (MC is pull-only by design)
- Weekly retrospective generation (currently via /retro gstack skill)
- Predictive insights ("based on your capture pattern, you'll likely context-switch to openefb this week")

</deferred>

---

*Phase: 37-proactive-intelligence*
*Context gathered: 2026-03-22*
