---
phase: 37-proactive-intelligence
plan: 04
subsystem: ui
tags: [insight-cards, triage, dismiss, snooze, expandable-badges, proactive-intelligence, react]

# Dependency graph
requires:
  - phase: 37-proactive-intelligence
    provides: useInsights hook, InsightBadges, intelligence strip, API endpoints
provides:
  - InsightCard component with type-specific colors and dismiss/snooze actions
  - InsightTriage bridge component linking stale capture insights to TriageView
  - Expandable InsightBadges with detail card expansion on click
affects: [future dashboard enhancements, mobile insight views]

# Tech tracking
tech-stack:
  added: []
  patterns: [expandable badge-to-detail card pattern, inline triage bridge component]

key-files:
  created:
    - packages/web/src/components/insights/insight-card.tsx
    - packages/web/src/components/insights/insight-triage.tsx
  modified:
    - packages/web/src/components/whats-new/insight-badges.tsx
    - packages/web/src/components/whats-new/whats-new-strip.tsx
    - packages/web/src/App.tsx

key-decisions:
  - "InsightCard uses border-l-2 accent pattern from FindingsPanel with type-specific colors (amber/indigo/blue/emerald)"
  - "InsightTriage is a lightweight inline bridge component, not a modal -- links to existing TriageView"
  - "Badge expansion uses expandedType state toggle with ring highlight on active badge"
  - "Batch dismiss X button repositioned as absolute overlay on badge hover (group-hover pattern)"

patterns-established:
  - "Expandable badge pattern: click badge to toggle detail section, ring-1 ring-current/30 for active state"
  - "Inline triage bridge: InsightTriage bridges insight cards to existing TriageView without duplicating triage logic"

requirements-completed: [PROACT-01, PROACT-02, PROACT-06]

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 37 Plan 04: Insight Detail Cards Summary

**InsightCard with type-colored accents, metadata pills, dismiss/snooze actions, expandable badges, and stale capture triage bridge to TriageView**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-23T14:42:05Z
- **Completed:** 2026-03-23T14:45:30Z
- **Tasks:** 2 (1 auto + 1 checkpoint auto-approved)
- **Files modified:** 5

## Accomplishments
- InsightCard component with 4 type-specific color schemes (amber stale_capture, indigo activity_gap, blue session_pattern, emerald cross_project)
- Metadata rendering: cross_project shared terms as pills, activity_gap project slug badge, session_pattern peak hour display
- InsightTriage inline bridge component linking stale capture insights to existing TriageView
- InsightBadges evolved with expandable detail card section on badge click
- Full prop chain wired: App.tsx -> WhatsNewStrip -> InsightBadges -> InsightCard/InsightTriage

## Task Commits

Each task was committed atomically:

1. **Task 1: Insight detail cards and stale capture triage** - `15d65b4` (feat)
2. **Task 2: Verify complete proactive intelligence flow** - Auto-approved checkpoint (914 tests pass, typecheck clean)

## Files Created/Modified
- `packages/web/src/components/insights/insight-card.tsx` - Individual insight detail card with type colors, metadata, dismiss/snooze actions
- `packages/web/src/components/insights/insight-triage.tsx` - Lightweight inline triage bridge for stale capture insights
- `packages/web/src/components/whats-new/insight-badges.tsx` - Expanded with clickable badges, detail card section, InsightCard/InsightTriage integration
- `packages/web/src/components/whats-new/whats-new-strip.tsx` - Added onOpenTriage and staleCount props passthrough
- `packages/web/src/App.tsx` - Wired onOpenTriage (setTriageOpen) and staleCount to WhatsNewStrip

## Decisions Made
- InsightCard follows FindingsPanel border-l-2 accent pattern with type-specific colors matching badge colors from Plan 03
- InsightTriage is a lightweight bridge, not a full triage implementation -- links to existing TriageView via onOpenTriage callback
- Badge expansion uses expandedType state (click toggles, ring highlight on active) rather than tooltip-only approach from Plan 03
- Batch dismiss X button uses absolute positioning with group-hover opacity transition
- Auto-collapse expanded section when last insight of that type is dismissed/snoozed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Wired onOpenTriage and staleCount through WhatsNewStrip**
- **Found during:** Task 1 (InsightBadges update)
- **Issue:** InsightBadges needs onOpenTriage and staleCount but WhatsNewStrip didn't accept/pass these props
- **Fix:** Added onOpenTriage and staleCount to WhatsNewStripProps, destructured in component, passed to InsightBadges
- **Files modified:** packages/web/src/components/whats-new/whats-new-strip.tsx, packages/web/src/App.tsx
- **Verification:** Typecheck clean, build succeeds
- **Committed in:** 15d65b4 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential prop wiring for triage flow. No scope creep.

## Checkpoint Verification (Auto-approved)

Task 2 checkpoint was auto-approved in autonomous mode. Visual verification items for manual review:

1. Intelligence strip renders correctly with digest/whats-new switching
2. Insight badges appear as colored pills grouped by type
3. Clicking a badge expands detail cards below the strip
4. Detail cards show title, body, metadata, and dismiss/snooze/triage actions
5. Dismiss removes card immediately (optimistic)
6. Snooze removes card immediately (optimistic)
7. Stale capture "Triage" button opens inline triage bridge, then links to full TriageView
8. No duplicate digest display in layout

**Automated verification passed:**
- `pnpm test`: 914 tests passing (all API + web)
- `pnpm typecheck`: clean across all 5 packages
- `pnpm --filter @mission-control/web build`: succeeds (388KB main bundle)

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full proactive intelligence UX loop complete: persistence (01) -> generation (02) -> strip (03) -> detail cards (04)
- All 4 insight types have visual treatment with actionable dismiss/snooze
- Stale capture insights bridge to existing triage flow
- Phase 37 (proactive-intelligence) fully shipped
- Ready for next milestone work

---
*Phase: 37-proactive-intelligence*
*Completed: 2026-03-23*
