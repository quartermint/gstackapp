---
phase: 21-dashboard-discoveries-stars-session-timeline
plan: 01
subsystem: ui
tags: [react, sse, discoveries, stars, popover, dashboard]

# Dependency graph
requires:
  - phase: 17-discovery-local-scan
    provides: Discovery API endpoints (GET /api/discoveries, PATCH /api/discoveries/:id)
  - phase: 19-github-star-sync
    provides: Star API endpoints (GET /api/stars, PATCH /api/stars/:githubId/intent)
  - phase: 20-session-enrichment
    provides: SSE event infrastructure, fetchCounter pattern, convergence hook pattern
provides:
  - useDiscoveries hook with promoteDiscovery/dismissDiscovery actions
  - useStars hook with updateStarIntent action
  - WhatsNewStrip component with discovery and star badge popovers
  - SSE event wiring for discovery:found/promoted/dismissed and star:synced/categorized
affects: [21-02, dashboard-layout]

# Tech tracking
tech-stack:
  added: []
  patterns: [whats-new strip pattern with badge-triggered popovers, intent cycling UX for star categorization]

key-files:
  created:
    - packages/web/src/hooks/use-discoveries.ts
    - packages/web/src/hooks/use-stars.ts
    - packages/web/src/components/whats-new/whats-new-strip.tsx
    - packages/web/src/components/whats-new/discovery-popover.tsx
    - packages/web/src/components/whats-new/star-popover.tsx
  modified:
    - packages/web/src/hooks/use-sse.ts
    - packages/web/src/App.tsx

key-decisions:
  - "Used raw fetch() for discovery/star endpoints (factory sub-routers, not in typed Hono client) -- consistent with use-convergence.ts"
  - "Star intent cycling via clickable badge (cycles through reference->tool->try->inspiration) rather than dropdown for compact UX"
  - "WhatsNewStrip returns null when both counts are 0 -- strip disappears entirely rather than showing empty state"

patterns-established:
  - "Badge-popover pattern: compact pill badge toggles absolute-positioned popover with click-outside/Escape dismissal"
  - "Intent color mapping: reference=sage, tool=terracotta, try=blue, inspiration=gold-status"

requirements-completed: [DISC-08, STAR-06]

# Metrics
duration: 5min
completed: 2026-03-16
---

# Phase 21 Plan 01: What's New Strip Summary

**Discovery cards and star browser popovers wired to real-time SSE in a persistent dashboard strip above the departure board**

## Performance

- **Duration:** 5min
- **Started:** 2026-03-16T23:30:26Z
- **Completed:** 2026-03-16T23:36:25Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Discovery data hook with promote/dismiss actions and star data hook with intent override, both using fetchCounter pattern
- Three-component What's New strip: WhatsNewStrip container with DiscoveryPopover (track/dismiss per repo) and StarPopover (grouped by intent, search/filter, intent cycling)
- Full SSE integration with 5 new event types triggering real-time refetch of discovery and star data
- Zero type errors, successful production build

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useDiscoveries and useStars hooks with SSE event wiring** - `f5557ee` (feat)
2. **Task 2: Build WhatsNewStrip with DiscoveryPopover and StarPopover components** - `45104c8` (feat)
3. **Task 3: Integrate WhatsNewStrip into App.tsx with hooks and SSE wiring** - `0e071ba` (feat)

## Files Created/Modified
- `packages/web/src/hooks/use-discoveries.ts` - Discovery data hook with promote/dismiss actions
- `packages/web/src/hooks/use-stars.ts` - Star data hook with intent override action
- `packages/web/src/hooks/use-sse.ts` - Extended with 5 new SSE event listeners
- `packages/web/src/components/whats-new/whats-new-strip.tsx` - Compact strip with badge indicators and popover toggles
- `packages/web/src/components/whats-new/discovery-popover.tsx` - Discovery cards with host badge, commit age, track/dismiss
- `packages/web/src/components/whats-new/star-popover.tsx` - Star browser with intent grouping, search, filter tabs, intent cycling
- `packages/web/src/App.tsx` - Wired hooks, handlers, SSE callbacks, and JSX placement

## Decisions Made
- Used raw fetch() for discovery/star endpoints (factory sub-routers, not in typed Hono client) -- consistent with use-convergence.ts pattern
- Star intent cycling via clickable badge rather than dropdown for compact UX within the popover
- WhatsNewStrip returns null when both counts are 0 so strip disappears entirely
- Added optimistic pending state (opacity reduction) on track/dismiss buttons to prevent double-clicks

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getNextIntent return type narrowing**
- **Found during:** Task 2 (StarPopover component)
- **Issue:** TypeScript error -- `INTENTS[(idx + 1) % INTENTS.length]` could be `undefined` since array index access returns `T | undefined` in strict mode
- **Fix:** Added explicit `as Intent` cast and guard for `idx === -1`
- **Files modified:** packages/web/src/components/whats-new/star-popover.tsx
- **Verification:** pnpm typecheck passes
- **Committed in:** 45104c8 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type narrowing fix required for strict TypeScript. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discovery and star data now visible in dashboard via What's New strip
- Ready for Plan 21-02 (session timeline or remaining dashboard enrichments)
- All existing tests pass (576 total: 472 API + 76 web + 28 MCP)

## Self-Check: PASSED

All 5 created files verified on disk. All 3 task commits verified in git log.

---
*Phase: 21-dashboard-discoveries-stars-session-timeline*
*Completed: 2026-03-16*
