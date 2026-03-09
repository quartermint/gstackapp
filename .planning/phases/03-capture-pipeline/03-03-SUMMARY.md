---
phase: 03-capture-pipeline
plan: 03
subsystem: ui
tags: [react, capture-card, correction-dropdown, loose-thoughts, dashboard-integration, project-badge]

# Dependency graph
requires:
  - phase: 03-capture-pipeline
    provides: "Capture hooks (useCaptures, CaptureItem type), capture field, command palette, enrichment pipeline with AI categorization"
  - phase: 02-dashboard-core
    provides: "Departure board, hero card, project rows, warm theme tokens, grouping utilities"
provides:
  - "CaptureCard component with content preview, link card, relative time, status indicator, and project badge"
  - "CaptureCorrection dropdown for one-click project reassignment via PATCH"
  - "LooseThoughts section below departure board for unlinked captures"
  - "Capture count badges on departure board project rows"
  - "Recent captures section in hero card (up to 3 captures per project)"
  - "useUnlinkedCaptures and useCaptureCounts hooks"
affects: [03-capture-pipeline, 05-dashboard-enrichments]

# Tech tracking
tech-stack:
  added: []
  patterns: [capture count badge on project rows, hero card capture section, correction dropdown with PATCH, unlinked capture filtering]

key-files:
  created:
    - packages/web/src/components/capture/capture-card.tsx
    - packages/web/src/components/capture/capture-correction.tsx
    - packages/web/src/components/loose-thoughts/loose-thoughts.tsx
  modified:
    - packages/web/src/components/departure-board/project-row.tsx
    - packages/web/src/components/departure-board/project-group.tsx
    - packages/web/src/components/departure-board/departure-board.tsx
    - packages/web/src/components/hero/hero-card.tsx
    - packages/web/src/hooks/use-captures.ts
    - packages/web/src/App.tsx

key-decisions:
  - "Capture count badge on project rows + expanded capture list in hero card keeps departure board clean while making captures discoverable"
  - "useCaptureCounts fetches all captures once and aggregates client-side rather than per-row API calls"
  - "useCaptureSubmit onSuccess callback triggers capture refetch chain (hero, unlinked, counts) instead of wrapping submit"

patterns-established:
  - "Prop threading for capture counts: App -> DepartureBoard -> ProjectGroup -> ProjectRow (vs each row fetching its own)"
  - "Correction dropdown pattern: CaptureCard manages open/close state, CaptureCorrection handles PATCH and callbacks"
  - "Refetch chain on capture mutation: single handleCapturesChanged callback refreshes all capture data sources"

requirements-completed: [CAPT-03, CAPT-04, CAPT-05]

# Metrics
duration: 4min
completed: 2026-03-09
---

# Phase 03 Plan 03: Dashboard Capture Integration Summary

**Capture cards woven into project hero cards with count badges on departure board, loose thoughts section for unlinked captures, and one-click project correction dropdown**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-09T17:46:26Z
- **Completed:** 2026-03-09T17:50:33Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built CaptureCard component displaying content preview, rich link cards, relative time, enrichment status indicator, and clickable project badge
- Created CaptureCorrection dropdown for one-click project reassignment -- shows all projects + Unlink, PATCHes capture and refreshes views
- Added capture count badges to departure board project rows (subtle terracotta notification style)
- Integrated recent captures section into hero card (up to 3 captures per selected project)
- Created LooseThoughts section below departure board for unlinked captures with muted visual treatment
- Added useUnlinkedCaptures and useCaptureCounts hooks with client-side aggregation

## Task Commits

Each task was committed atomically:

1. **Task 1: Build capture card and correction components** - `eadf520` (feat)
2. **Task 2: Add captures to project cards and create loose thoughts section** - `a12c02b` (feat)

## Files Created/Modified
- `packages/web/src/components/capture/capture-card.tsx` - Single capture display with project badge, content preview, link card, status indicator
- `packages/web/src/components/capture/capture-correction.tsx` - Project reassignment dropdown triggered by clicking project badge, PATCH on selection
- `packages/web/src/components/loose-thoughts/loose-thoughts.tsx` - Section below departure board showing unlinked captures with count badge
- `packages/web/src/components/departure-board/project-row.tsx` - Added optional captureCount prop and terracotta count badge
- `packages/web/src/components/departure-board/project-group.tsx` - Added captureCounts prop and threading to ProjectRow
- `packages/web/src/components/departure-board/departure-board.tsx` - Added captureCounts prop and threading to ProjectGroup
- `packages/web/src/components/hero/hero-card.tsx` - Added recent captures section below commit timeline
- `packages/web/src/hooks/use-captures.ts` - Added useUnlinkedCaptures and useCaptureCounts hooks
- `packages/web/src/App.tsx` - Wired LooseThoughts, capture counts, hero captures, and correction refetch chain

## Decisions Made
- **Count badge + hero expansion pattern:** Captures appear as a small count badge on project rows (keeping departure board clean) with full capture cards visible when expanding a project in the hero card. This preserves the "smarter in 3 seconds" density while making captures discoverable and detailed on selection.
- **Client-side aggregation for counts:** useCaptureCounts fetches all captures once (`limit=200`) and aggregates by projectId client-side, rather than making a separate API call per project row. Simpler for single-user v1.
- **onSuccess callback for submit refetch:** Used useCaptureSubmit's existing `onSuccess` parameter to trigger capture data refetch, rather than wrapping the submit function. Cleaner integration with the fire-and-forget submit pattern.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dashboard capture integration complete -- captures are visible on project cards and in loose thoughts
- Correction flow works end-to-end: click badge, select project or Unlink, view updates immediately
- Ready for Plan 03-04 (stale capture triage) which builds on the existing capture card components
- All capture hooks (project-filtered, unlinked, counts, stale) are in place for future enrichments

---
*Phase: 03-capture-pipeline*
*Completed: 2026-03-09*
