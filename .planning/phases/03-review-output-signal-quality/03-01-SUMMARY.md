---
phase: 03-review-output-signal-quality
plan: 01
subsystem: api
tags: [github-comments, severity-filter, mutex, async-mutex, markdown-renderer, feedback-schema]

# Dependency graph
requires:
  - phase: 02-pipeline-engine
    provides: "Pipeline orchestrator, stage results, findings database tables"
provides:
  - "Comment renderer with pipeline topology and three-tier severity grouping"
  - "Comment manager with per-PR mutex and find-or-create pattern"
  - "Severity filter (groupFindingsBySeverity, calculateSignalRatio, formatSignalRatio)"
  - "Feedback schema and DB columns for future prompt improvement"
affects: [03-02-inline-review-feedback, 04-dashboard-pipeline-visualization]

# Tech tracking
tech-stack:
  added: [async-mutex]
  patterns: [per-PR-mutex-serialization, find-or-create-comment, three-tier-severity, collapsible-details-section]

key-files:
  created:
    - packages/api/src/github/comment-renderer.ts
    - packages/api/src/github/comment.ts
    - packages/api/src/lib/severity-filter.ts
    - packages/shared/src/schemas/feedback.ts
    - packages/api/src/__tests__/severity-filter.test.ts
    - packages/api/src/__tests__/comment.test.ts
  modified:
    - packages/api/src/db/schema.ts
    - packages/shared/src/index.ts
    - packages/api/src/__tests__/helpers/test-db.ts
    - packages/api/package.json

key-decisions:
  - "Per-PR mutex via async-mutex runExclusive for concurrent stage completion safety"
  - "Fast path (commentId cached on pipelineRun) vs slow path (listComments search) for comment updates"
  - "65K max comment length with truncation note, 500 char finding description limit, 10 findings per stage max"

patterns-established:
  - "Mutex serialization: per-PR mutex map for comment operations prevents race conditions"
  - "Find-or-create: hidden HTML marker for comment identification across sessions"
  - "Three-tier severity: critical/notable/minor with collapsible minor section"

requirements-completed: [REVW-01, REVW-02, REVW-03, REVW-05, REVW-06, SGNL-01, SGNL-03]

# Metrics
duration: 9min
completed: 2026-03-31
---

# Phase 3 Plan 1: Comment Renderer Summary

**PR comment renderer with pipeline topology header, three-tier severity grouping, per-PR mutex comment manager, and feedback schema extension**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-31T00:03:43Z
- **Completed:** 2026-03-31T00:13:00Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Severity filter with three-tier grouping (critical/notable/minor), signal ratio calculation, and human-readable formatting
- Comment renderer producing GitHub-flavored markdown with pipeline topology, stage verdict badges, collapsible minor findings, and 65K truncation
- Comment manager with per-PR mutex serialization, fast path (cached commentId), slow path (listComments search), and create fallback
- Feedback schema (FeedbackVoteSchema, FeedbackSubmissionSchema) and 5 DB columns on findings table for future prompt improvement
- 39 new tests (18 severity filter + 21 comment) all passing, 115 total tests across 10 files

## Task Commits

Each task was committed atomically:

1. **Task 1: Feedback schema, DB extension, and severity filter** - `042e1f8` (feat)
2. **Task 2: Comment renderer and comment manager with per-PR mutex** - `599a3c5` (feat)

_Both tasks followed TDD: RED (failing tests) -> GREEN (implementation) -> verify_

## Files Created/Modified
- `packages/api/src/lib/severity-filter.ts` - Three-tier finding grouping, signal ratio calculation
- `packages/api/src/github/comment-renderer.ts` - Pipeline topology markdown rendering, incremental skeleton
- `packages/api/src/github/comment.ts` - Find-or-create comment manager with per-PR mutex
- `packages/shared/src/schemas/feedback.ts` - Feedback Zod schemas (FeedbackVoteSchema, FeedbackSubmissionSchema)
- `packages/api/src/db/schema.ts` - Extended findings table with 5 feedback columns
- `packages/shared/src/index.ts` - Added feedback schema barrel export
- `packages/api/src/__tests__/severity-filter.test.ts` - 18 tests for severity filter and feedback schemas
- `packages/api/src/__tests__/comment.test.ts` - 21 tests for renderer and comment manager
- `packages/api/src/__tests__/helpers/test-db.ts` - Updated DDL with feedback columns
- `packages/api/package.json` - Added async-mutex dependency

## Decisions Made
- Per-PR mutex via async-mutex runExclusive for concurrent stage completion safety (not a global lock, scoped to owner/repo:prNumber key)
- Fast path (commentId cached on pipelineRun row) vs slow path (listComments API search) for comment updates -- avoids unnecessary API calls
- 65K max comment length with truncation note referencing dashboard, 500 char finding description limit, 10 findings per stage max
- Stage section ordering by verdict severity (BLOCK > FLAG > PASS > SKIP) puts most critical information first

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- TypeScript composite project reference required building shared package before API type-check (pre-existing pattern, not a regression)
- Comment manager tests initially used vi.resetModules() which cleared the test-db setup mocks -- restructured to use direct imports with the existing test-db pattern

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all functions are fully wired with no placeholder data.

## Next Phase Readiness
- Comment renderer and manager are ready for integration into the pipeline orchestrator (Phase 3 Plan 2 or pipeline wiring)
- Feedback schema and DB columns ready for the inline review feedback endpoint (Plan 2)
- 115 total tests passing, no regressions

---
*Phase: 03-review-output-signal-quality*
*Completed: 2026-03-31*

## Self-Check: PASSED

All 6 created files verified on disk. Both task commits (042e1f8, 599a3c5) verified in git log.
