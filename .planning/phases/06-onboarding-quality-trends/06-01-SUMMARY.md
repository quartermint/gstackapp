---
phase: 06-onboarding-quality-trends
plan: 01
subsystem: api
tags: [hono, sqlite, zod, scoring, onboarding, trends, aggregation]

# Dependency graph
requires:
  - phase: 05-cross-repo-intelligence
    provides: findings table with severity data, pipeline_runs with completed_at timestamps
provides:
  - Quality scoring function (calculateQualityScore) for weighted severity scoring
  - GET /api/onboarding/status endpoint with 4-step detection
  - GET /api/trends/scores endpoint for per-repo quality scores over time
  - GET /api/trends/verdicts endpoint for per-stage verdict rates over time
  - GET /api/trends/findings endpoint for finding frequency over time
  - Shared Zod schemas for trend and onboarding API responses
affects: [06-02-onboarding-wizard, 06-03-quality-trend-charts]

# Tech tracking
tech-stack:
  added: []
  patterns: [rawDb.prepare SQL aggregation with date bucketing, count-based onboarding state detection]

key-files:
  created:
    - packages/api/src/lib/scoring.ts
    - packages/api/src/routes/onboarding.ts
    - packages/api/src/routes/trends.ts
    - packages/shared/src/schemas/trends.ts
    - packages/api/src/__tests__/scoring.test.ts
    - packages/api/src/__tests__/onboarding-route.test.ts
    - packages/api/src/__tests__/trends-route.test.ts
  modified:
    - packages/api/src/index.ts
    - packages/api/src/lib/config.ts
    - packages/shared/src/index.ts

key-decisions:
  - "rawDb.prepare() for SQL aggregation queries (same pattern as pipelines.ts cross-repo queries)"
  - "SQLite date(completed_at / 1000, 'unixepoch') for daily granularity bucketing"
  - "Normalization factor max(10, total_findings) prevents single-finding distortion in quality scores"
  - "GITHUB_APP_SLUG config for constructing GitHub App install URL, fallback to settings/installations"

patterns-established:
  - "SQL aggregation with date bucketing: rawDb.prepare + GROUP BY date() for time-series data"
  - "Count-based state machine: sequential COUNT queries to detect onboarding step"

requirements-completed: [ONBD-01, ONBD-02, TRND-01, TRND-02, TRND-03]

# Metrics
duration: 5min
completed: 2026-03-31
---

# Phase 6 Plan 1: Backend API Summary

**Quality scoring with D-05/D-06 weighted formula, 4-step onboarding detection, and three trend aggregation endpoints using SQLite date bucketing**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-31T04:52:38Z
- **Completed:** 2026-03-31T04:58:13Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- calculateQualityScore with severity weights (critical:3, notable:1, minor:0) and normalization per D-05/D-06
- Onboarding status endpoint detects 4 states (install/select-repos/first-review/complete) from DB counts
- Three trend endpoints return time-bucketed data: quality scores, verdict rates, finding frequency
- All routes mounted in index.ts with method chaining preserved for Hono RPC type inference
- 29 new tests (8 scoring + 7 onboarding + 3 weights + 11 trends), 205 total passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Quality scoring, shared schemas, onboarding status** - `235d8ab` (test: RED), `af4bd26` (feat: GREEN)
2. **Task 2: Trend aggregation endpoints and route wiring** - `f129b28` (test: RED), `c259581` (feat: GREEN)

_TDD tasks have two commits each (test then feat)_

## Files Created/Modified
- `packages/api/src/lib/scoring.ts` - Quality score calculation with severity weights and normalization
- `packages/api/src/routes/onboarding.ts` - Onboarding status endpoint with 4-step state machine
- `packages/api/src/routes/trends.ts` - Three trend aggregation endpoints (scores, verdicts, findings)
- `packages/shared/src/schemas/trends.ts` - Zod schemas for QualityScorePoint, VerdictRatePoint, FindingTrendPoint, OnboardingStatus
- `packages/shared/src/index.ts` - Added trends schema export
- `packages/api/src/lib/config.ts` - Added githubAppSlug config field
- `packages/api/src/index.ts` - Mounted onboarding and trends routes
- `packages/api/src/__tests__/scoring.test.ts` - Scoring function edge case tests
- `packages/api/src/__tests__/onboarding-route.test.ts` - Onboarding step transition tests
- `packages/api/src/__tests__/trends-route.test.ts` - Trend endpoint aggregation tests

## Decisions Made
- Used rawDb.prepare() for SQL aggregation queries (same pattern as existing pipelines.ts cross-repo queries)
- SQLite date(completed_at / 1000, 'unixepoch') for daily granularity bucketing of timestamp_ms values
- Normalization factor max(10, total_findings) prevents single-finding distortion in quality scores
- GITHUB_APP_SLUG optional config for constructing install URL, with fallback to github.com/settings/installations

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Onboarding API ready for Plan 02 (wizard UI) to consume via GET /api/onboarding/status
- Trend APIs ready for Plan 03 (chart UI) to consume via GET /api/trends/{scores,verdicts,findings}
- Shared Zod schemas available for frontend type safety via @gstackapp/shared

## Self-Check: PASSED

All 8 files verified present. All 4 commit hashes verified in git log.

---
*Phase: 06-onboarding-quality-trends*
*Completed: 2026-03-31*
