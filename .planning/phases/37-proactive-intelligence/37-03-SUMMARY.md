---
phase: 37-proactive-intelligence
plan: 03
subsystem: ui
tags: [intelligence-strip, digest, insights, react, whats-new, sse, proactive-intelligence]

# Dependency graph
requires:
  - phase: 37-proactive-intelligence
    provides: insights persistence layer (API endpoints, shared types)
  - phase: 35-active-intelligence-daemon
    provides: daily digest via intelligence cache
provides:
  - useInsights hook with optimistic dismiss/snooze
  - Intelligence strip (evolved WhatsNewStrip) with digest + insights + whats-new
  - DigestStripView compact inline digest component
  - InsightBadges grouped badge component with dismiss/snooze
  - SSE listeners for insight lifecycle events
affects: [37-04 pattern detectors, future dashboard enhancements]

# Tech tracking
tech-stack:
  added: []
  patterns: [optimistic dismissedIds Set following seenSlugs pattern, intelligence strip mode switching]

key-files:
  created:
    - packages/web/src/hooks/use-insights.ts
    - packages/web/src/components/whats-new/digest-strip-view.tsx
    - packages/web/src/components/whats-new/insight-badges.tsx
  modified:
    - packages/web/src/components/whats-new/whats-new-strip.tsx
    - packages/web/src/hooks/use-sse.ts
    - packages/web/src/App.tsx

key-decisions:
  - "Optimistic dismissedIds Set clears on server refetch (server already filters dismissed)"
  - "Strip mode switching: hasDigest && !digestRead renders DigestStripView, else renders standard What's New"
  - "InsightBadges groups by type with batch dismiss (all insights of that type)"
  - "SSE events use exact event bus names: intelligence:insight_created, intelligence:insight_dismissed"

patterns-established:
  - "Intelligence strip pattern: dual-mode component with digest/whats-new switching via local state"
  - "Insight badge grouping: Map<InsightType, Insight[]> with per-type badge and tooltip"

requirements-completed: [PROACT-01]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 37 Plan 03: Intelligence Strip Summary

**Evolved What's New strip into intelligence strip with morning digest view, insight badges, and optimistic dismiss/snooze via useInsights hook**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T14:31:15Z
- **Completed:** 2026-03-23T14:36:11Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- useInsights hook with fetchCounter pattern, 5min refetch, optimistic dismiss/snooze via dismissedIds Set
- DigestStripView: compact inline digest with summary line, section priority pills, and collapsible action items
- InsightBadges: grouped badges by type (stale_capture/activity_gap/session_pattern/cross_project) with tooltip hover and dismiss/snooze actions
- WhatsNewStrip evolved to intelligence strip: shows digest on morning load with "Intelligence" label, fades to "What's New" after reading
- SSE listeners for intelligence:insight_created and intelligence:insight_dismissed events
- DailyDigestPanel standalone rendering removed from App.tsx (absorbed into intelligence strip per D-01)

## Task Commits

Each task was committed atomically:

1. **Task 1: useInsights hook and insight UI types** - `8cdc864` (feat)
2. **Task 2: Intelligence strip evolution with digest view and insight badges** - `3224296` (feat)

## Files Created/Modified
- `packages/web/src/hooks/use-insights.ts` - Hook for fetching/managing insights with optimistic dismiss/snooze
- `packages/web/src/components/whats-new/digest-strip-view.tsx` - Compact inline digest view for intelligence strip
- `packages/web/src/components/whats-new/insight-badges.tsx` - Grouped insight badges with dismiss/snooze tooltips
- `packages/web/src/components/whats-new/whats-new-strip.tsx` - Evolved to intelligence strip with dual-mode rendering
- `packages/web/src/hooks/use-sse.ts` - Added onInsightCreated/onInsightDismissed event handlers
- `packages/web/src/App.tsx` - Wired useInsights, passed props to strip, removed DailyDigestPanel

## Decisions Made
- Optimistic dismissedIds Set clears on server refetch: server already filters dismissed insights, so local set only needed between fetches
- Strip mode switching via local digestRead state: hasDigest && !digestRead shows DigestStripView, else shows standard What's New badges
- InsightBadges batch dismiss: clicking X on a badge dismisses all insights of that type (bulk action matches badge granularity)
- SSE event listeners use exact event bus type strings (intelligence:insight_created, intelligence:insight_dismissed) matching events.ts passthrough

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added SSE event listeners for insight lifecycle**
- **Found during:** Task 2 (App.tsx wiring)
- **Issue:** Plan mentions SSE events for refetch but useSSE hook had no insight event handlers
- **Fix:** Extended useSSE with onInsightCreated/onInsightDismissed callbacks, wired to refetchInsights in App.tsx
- **Files modified:** packages/web/src/hooks/use-sse.ts, packages/web/src/App.tsx
- **Verification:** Web typecheck and build pass
- **Committed in:** 3224296 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Essential for real-time insight updates. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in packages/api from 37-02 TDD stub (insight-generator.test.ts references incomplete module). Not caused by this plan; web package typechecks and builds clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Intelligence strip is live: morning digest shows inline, insight badges appear alongside
- DailyDigestPanel no longer rendered standalone (single source of digest display per D-01)
- useInsights hook ready for Plan 02/04 to generate insights that appear in the strip
- Web typecheck clean, build succeeds
- SSE wired for real-time insight updates

## Self-Check: PASSED

- All 4 created/modified files verified on disk
- Both task commits (8cdc864, 3224296) found in git log
- Web typecheck: clean
- Web build: succeeds

---
*Phase: 37-proactive-intelligence*
*Completed: 2026-03-23*
