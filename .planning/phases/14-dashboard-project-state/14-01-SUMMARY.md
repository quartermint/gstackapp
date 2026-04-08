---
phase: 14-dashboard-project-state
plan: 01
subsystem: api
tags: [hono, zod, simple-git, filesystem, yaml-parsing]

requires: []
provides:
  - GET /api/projects endpoint returning all detected projects with GSD state, git status, staleness
  - Zod schemas for ProjectState, GsdState, GitStatus types in @gstackapp/shared
  - parseStateMd utility for YAML frontmatter extraction from STATE.md files
  - computeStatus staleness algorithm (active/stale/ideating)
affects: [14-02, 14-03, 14-04, dashboard-frontend]

tech-stack:
  added: []
  patterns: [filesystem-backed-api-route, hand-rolled-yaml-frontmatter-parser, bounded-parallel-git-scanning]

key-files:
  created:
    - packages/shared/src/schemas/projects.ts
    - packages/api/src/routes/projects.ts
    - packages/api/src/__tests__/projects-route.test.ts
  modified:
    - packages/shared/src/index.ts
    - packages/api/src/index.ts

key-decisions:
  - "Hand-rolled YAML frontmatter parser instead of js-yaml dependency -- STATE.md format is simple enough"
  - "Bounded parallelism at 10 concurrent git operations to avoid overwhelming filesystem"
  - "Path safety via realpathSync + homedir boundary check for symlink escape prevention"

patterns-established:
  - "Filesystem-backed API route: read fresh on each request, no caching (D-04, D-05)"
  - "Project discovery: merge ~/CLAUDE.md + .planning/ scan + config file, deduplicate by name"
  - "Staleness algorithm: active (<=3 days), stale (>3 days + uncommitted), ideating (design docs, no .planning/)"

requirements-completed: [DASH-01, DASH-02, DASH-06]

duration: 4min
completed: 2026-04-08
---

# Phase 14 Plan 01: Projects API Summary

**Filesystem-backed projects API with YAML frontmatter parsing, git status scanning, and active/stale/ideating classification**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T15:10:31Z
- **Completed:** 2026-04-08T15:14:41Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- GET /api/projects endpoint scans ~/CLAUDE.md, .planning/ directories, and ~/.gstackapp/projects.json config
- Hand-rolled YAML frontmatter parser extracts GSD state from STATE.md without external dependency
- Staleness algorithm classifies projects as active/stale/ideating per D-09
- Path safety prevents symlink escape and directory traversal outside home directory
- 15 new tests covering parseStateMd, computeStatus, isPathSafe, and endpoint integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared schemas for project state types** - `f711ef6` (feat)
2. **Task 2: Projects API route with filesystem scanning** - `d27d054` (feat)

## Files Created/Modified
- `packages/shared/src/schemas/projects.ts` - Zod schemas for GsdProgress, GsdState, GitStatus, ProjectState types
- `packages/shared/src/index.ts` - Re-export projects schemas
- `packages/api/src/routes/projects.ts` - GET /api/projects with filesystem scanning, git status, staleness
- `packages/api/src/index.ts` - Mount projects route at /api/projects
- `packages/api/src/__tests__/projects-route.test.ts` - 15 unit tests for parsing, status, safety, endpoint

## Decisions Made
- Hand-rolled YAML parser: STATE.md frontmatter is simple key-value + one nested object. Adding js-yaml would be dependency bloat.
- Bounded parallelism (10): Prevents spawning 35+ git subprocesses simultaneously while keeping scan under 1 second.
- Path safety via realpathSync: Prevents symlink escape attacks per T-14-01 threat model.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TDD test for quoted date strings**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Test checked `last_updated` field which is not part of GsdState type. parseStateMd correctly maps only known GsdState fields.
- **Fix:** Changed test to check `stopped_at` (a GsdState field) with a quoted value instead.
- **Files modified:** packages/api/src/__tests__/projects-route.test.ts
- **Verification:** All 15 tests pass
- **Committed in:** d27d054

---

**Total deviations:** 1 auto-fixed (1 bug in test)
**Impact on plan:** Minimal -- test was incorrectly checking a non-GsdState field. Fix aligned test with actual schema contract.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Projects API endpoint is complete and tested, ready for frontend consumption in 14-02
- Shared Zod schemas exported from @gstackapp/shared for type-safe frontend integration
- 265 total tests passing (250 existing + 15 new)

---
*Phase: 14-dashboard-project-state*
*Completed: 2026-04-08*

## Self-Check: PASSED

All files exist. All commits verified.
