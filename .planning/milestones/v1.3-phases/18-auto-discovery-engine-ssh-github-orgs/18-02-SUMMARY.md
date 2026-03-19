---
phase: 18-auto-discovery-engine-ssh-github-orgs
plan: 02
subsystem: testing
tags: [vitest, ssh, github-api, dedup, child_process, promisify]

# Dependency graph
requires:
  - phase: 18-auto-discovery-engine-ssh-github-orgs (plan 01)
    provides: scanSshDiscoveries, scanGithubOrgDiscoveries, getDiscoveriesByNormalizedUrl
provides:
  - Test coverage for SSH scanning, GitHub org scanning, and cross-host dedup
  - Mock pattern for promisified child_process.execFile using vi.hoisted + promisify.custom
affects: [discovery-scanner, future scanner feature tests]

# Tech tracking
tech-stack:
  added: []
  patterns: [vi.hoisted + promisify.custom for mocking promisified Node builtins]

key-files:
  created:
    - packages/api/src/__tests__/services/discovery-scanner-ssh-github.test.ts
  modified:
    - packages/api/src/__tests__/services/discovery-scanner.test.ts

key-decisions:
  - "Split SSH/GitHub scanner tests into separate file due to vi.mock hoisting requirement for node:child_process"
  - "Used vi.hoisted + promisify.custom symbol to correctly mock promisified execFile"

patterns-established:
  - "Promisified builtin mock: vi.hoisted creates mock fn, sets [promisify.custom] on callback mock, vi.mock replaces module"

requirements-completed: [DISC-05, DISC-06, DISC-07]

# Metrics
duration: 8min
completed: 2026-03-16
---

# Phase 18 Plan 02: Discovery Scanner Tests Summary

**12 tests covering SSH scan parsing/failure, GitHub org scan parsing/isolation, and cross-host dedup via normalized URLs**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-16T22:00:07Z
- **Completed:** 2026-03-16T22:08:38Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- 4 SSH scanner tests: failure resilience (returns 0, no throw), batch output parsing, tracked-path skip, dismissed-path skip
- 4 GitHub org scanner tests: empty orgs returns 0, API output parsing, tracked-repo skip, per-org error isolation
- 4 cross-host dedup tests: normalized URL matching, null-remote exclusion, SSH vs HTTPS URL equivalence, same-host non-dedup
- Established reusable mock pattern for promisified Node.js builtins using vi.hoisted + promisify.custom

## Task Commits

Each task was committed atomically:

1. **Task 1: Tests for SSH scanning, GitHub org scanning, and dedup** - `d5e5320` (test)

## Files Created/Modified
- `packages/api/src/__tests__/services/discovery-scanner-ssh-github.test.ts` - SSH and GitHub org scanner tests with hoisted child_process mock
- `packages/api/src/__tests__/services/discovery-scanner.test.ts` - Added cross-host dedup test suite, imported getDiscoveriesByNormalizedUrl and normalizeRemoteUrl

## Decisions Made
- Split SSH/GitHub scanner tests into a separate file because vi.mock for node:child_process is hoisted to file scope and would break existing tests that don't need mocking
- Used vi.hoisted() to create mock function at hoist time, combined with promisify.custom symbol to correctly intercept promisified execFile (Node's execFile has a custom promisify implementation that returns {stdout, stderr})

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Separated test file for child_process mocking**
- **Found during:** Task 1 (test writing)
- **Issue:** vi.doMock + vi.resetModules did not correctly intercept promisified execFile due to module caching; vi.mock (hoisted) would break existing tests in same file
- **Fix:** Created separate discovery-scanner-ssh-github.test.ts for tests requiring child_process mock
- **Files modified:** packages/api/src/__tests__/services/discovery-scanner-ssh-github.test.ts (new)
- **Verification:** All 23 discovery scanner tests pass across both files
- **Committed in:** d5e5320

**2. [Rule 3 - Blocking] Used promisify.custom for correct mock behavior**
- **Found during:** Task 1 (test writing)
- **Issue:** Generic promisify wrapping returns single value, not {stdout, stderr} object that Node's execFile custom promisify returns
- **Fix:** Set [Symbol(util.promisify.custom)] on mock callback function to provide a directly-configurable promise mock
- **Files modified:** packages/api/src/__tests__/services/discovery-scanner-ssh-github.test.ts
- **Verification:** All 8 SSH/GitHub tests pass with correct stdout/stderr handling
- **Committed in:** d5e5320

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for correct test mocking. Plan's test skeletons adapted to actual promisify behavior. No scope creep -- same tests, different mock strategy.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 18 complete: SSH scanning, GitHub org scanning, and cross-host dedup all have test coverage
- All 406 API tests pass, 0 regressions
- Ready to proceed to Phase 19

## Self-Check: PASSED

- [x] discovery-scanner-ssh-github.test.ts exists
- [x] discovery-scanner.test.ts exists
- [x] 18-02-SUMMARY.md exists
- [x] Commit d5e5320 exists

---
*Phase: 18-auto-discovery-engine-ssh-github-orgs*
*Completed: 2026-03-16*
