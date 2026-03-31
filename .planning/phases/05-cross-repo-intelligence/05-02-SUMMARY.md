---
phase: 05-cross-repo-intelligence
plan: 02
subsystem: ui, api, github
tags: [cross-repo, embeddings, sqlite-vec, react, hono, pr-comments, dashboard]

# Dependency graph
requires:
  - phase: 05-cross-repo-intelligence/01
    provides: findCrossRepoMatches search API, embedding infrastructure, vec_findings table
  - phase: 03-review-output
    provides: comment-renderer.ts, comment.ts PR comment system
  - phase: 04-dashboard
    provides: PRDetail.tsx, BottomStrip.tsx, usePipelineFeed.ts, pipelines route
provides:
  - "Seen in your other repos" section in PR comments when cross-repo matches exist
  - CrossRepoInsight dashboard component with warm gold (#FFD166) styling
  - crossRepoMatches field in GET /api/pipelines/:id response
  - Live cross-repo intelligence indicator in BottomStrip
affects: [06-trends-and-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: [cross-repo KNN search via vec_findings in PR comment pipeline, try/catch wrapping for graceful degradation of embedding features]

key-files:
  created:
    - packages/web/src/components/findings/CrossRepoInsight.tsx
  modified:
    - packages/api/src/github/comment-renderer.ts
    - packages/api/src/github/comment.ts
    - packages/api/src/routes/pipelines.ts
    - packages/web/src/hooks/usePipelineFeed.ts
    - packages/web/src/components/feed/PRDetail.tsx
    - packages/web/src/components/layout/BottomStrip.tsx
    - packages/api/src/__tests__/comment.test.ts
    - packages/api/src/__tests__/pipelines-route.test.ts

key-decisions:
  - "Cross-repo search queries vec_findings by finding_id, not re-embedding at render time -- avoids Voyage AI call in comment hot path"
  - "Entire cross-repo search wrapped in try/catch in both comment.ts and pipelines route -- embedding failure never blocks comment rendering or API response"
  - "Deduplication by finding_id via Map to prevent duplicate cross-repo matches across multiple findings in one pipeline run"

patterns-established:
  - "Graceful degradation for embedding features: try/catch + empty array fallback"
  - "CrossRepoInsight card pattern: warm gold left border + rgba background from DESIGN.md"

requirements-completed: [XREP-03]

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 05 Plan 02: Cross-Repo Intelligence Rendering Summary

**Cross-repo "Seen in your other repos" callouts in PR comments and dashboard with warm gold insight cards and live BottomStrip indicator**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T04:24:34Z
- **Completed:** 2026-03-31T04:30:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- PR comments now include a "Seen in your other repos" markdown section when vec_findings KNN search returns cross-repo matches
- Dashboard PRDetail shows CrossRepoInsight cards with warm gold (#FFD166) styling per DESIGN.md
- GET /api/pipelines/:id returns crossRepoMatches array for frontend consumption
- BottomStrip replaced placeholder text with live "Cross-repo intelligence -- N reviews indexed" indicator
- All 176 API tests pass including 8 new cross-repo tests

## Task Commits

Each task was committed atomically:

1. **Task 1: PR comment cross-repo section and pipelines API cross-repo field** (TDD)
   - `a0ea2ec` (test: failing tests for cross-repo comment rendering)
   - `1be2759` (feat: cross-repo intelligence in PR comments and pipelines API)
2. **Task 2: Dashboard CrossRepoInsight component, PRDetail integration, BottomStrip live data**
   - `d78888b` (feat: dashboard cross-repo insight cards, PRDetail integration, live BottomStrip)

## Files Created/Modified
- `packages/api/src/github/comment-renderer.ts` - Added renderCrossRepoSection() and crossRepoMatches to RenderCommentInput
- `packages/api/src/github/comment.ts` - Wire findCrossRepoMatches into updatePRComment via vec_findings lookup
- `packages/api/src/routes/pipelines.ts` - Added crossRepoMatches to GET /:id response with try/catch fallback
- `packages/web/src/components/findings/CrossRepoInsight.tsx` - New component: warm gold card for individual cross-repo match
- `packages/web/src/hooks/usePipelineFeed.ts` - Added CrossRepoMatchData interface and crossRepoMatches to PipelineDetail
- `packages/web/src/components/feed/PRDetail.tsx` - Integrated CrossRepoInsight section after stage findings
- `packages/web/src/components/layout/BottomStrip.tsx` - Replaced placeholder with live cross-repo intelligence indicator
- `packages/api/src/__tests__/comment.test.ts` - 8 new tests for cross-repo callout rendering
- `packages/api/src/__tests__/pipelines-route.test.ts` - Test for crossRepoMatches in pipeline detail response

## Decisions Made
- Query vec_findings by finding_id rather than re-embedding at render time, avoiding Voyage AI API calls in the PR comment hot path
- Deduplication via Map<finding_id, match> across all findings in a pipeline run
- Entire cross-repo search wrapped in try/catch in both comment.ts and pipelines route -- graceful degradation ensures core functionality never breaks

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data paths are wired to real sources (vec_findings KNN search for cross-repo, usePipelineList for BottomStrip count).

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 05 (cross-repo intelligence) is now complete: embedding infrastructure (Plan 01) + rendering surfaces (Plan 02)
- Ready for Phase 06 (trends and onboarding) which builds on the pipeline run data accumulated across all previous phases
- Cross-repo intelligence will improve over time as more pipelines run and vec_findings accumulates embeddings

---
*Phase: 05-cross-repo-intelligence*
*Completed: 2026-03-31*
