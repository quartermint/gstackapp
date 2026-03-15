---
phase: 07-git-health-engine
plan: 01
subsystem: api
tags: [git, health-checks, tdd, vitest, pure-functions]

# Dependency graph
requires:
  - phase: 06-data-foundation
    provides: HealthFindingInput type, HealthSeverity type, health schemas
provides:
  - HealthScanData interface for per-repo git state
  - 6 pure health check functions (noRemote, brokenTracking, remoteBranchGone, unpushedCommits, unpulledCommits, dirtyWorkingTree)
  - runHealthChecks orchestrator with dependency-ordered execution
  - normalizeRemoteUrl for SSH/HTTPS URL deduplication
  - computeHealthScore severity-to-score mapping
  - escalateDirtySeverity age-based severity escalation
affects: [07-02 git scanner, 07-03 health scan scheduler, 08 health API]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-function health checks with HealthScanData interface, dependency-ordered check execution, severity escalation as separate pure function]

key-files:
  created:
    - packages/api/src/services/git-health.ts
    - packages/api/src/__tests__/services/git-health.test.ts
  modified: []

key-decisions:
  - "checkDirtyWorkingTree always returns info severity; escalation handled by separate escalateDirtySeverity function called in post-scan phase"
  - "shouldSkipUpstreamChecks shared guard deduplicates the no-remote/detached/no-upstream/gone check across unpushed and unpulled"
  - "normalizeRemoteUrl lowercases all URLs for case-insensitive matching"

patterns-established:
  - "HealthScanData interface: canonical shape for per-repo git state collected by scanner"
  - "Check function signature: (HealthScanData) -> HealthFindingInput | null"
  - "Dependency-ordered execution: no_remote gates everything, detached HEAD gates upstream checks, broken/gone gate unpushed/unpulled"

requirements-completed: [HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-05, HLTH-06, HLTH-07, HLTH-08, COPY-01]

# Metrics
duration: 3min
completed: 2026-03-14
---

# Phase 7 Plan 1: Pure Health Check Functions Summary

**6 per-repo git health check functions with TDD, dependency-ordered orchestrator, URL normalization, and severity escalation -- 54 tests passing**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-14T19:03:30Z
- **Completed:** 2026-03-14T19:06:31Z
- **Tasks:** 1 feature (TDD: RED -> GREEN -> REFACTOR)
- **Files modified:** 2

## Accomplishments
- All 6 per-repo health check functions implemented as pure functions with correct typing
- runHealthChecks orchestrator enforces dependency ordering (no-remote short-circuits, detached HEAD skips upstream, broken/gone gate unpushed/unpulled)
- Public repo escalation (HLTH-07) raises unpushed warning to critical
- normalizeRemoteUrl produces matching strings for SSH and HTTPS variants
- computeHealthScore returns 100/60/20 for no-findings/warning/critical
- escalateDirtySeverity returns info/warning/critical based on 0/3/7 day thresholds
- 54 tests covering all edge cases

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests for all health check functions** - `2929ce5` (test)
2. **GREEN: Implement all health check functions** - `77d646c` (feat)
3. **REFACTOR: Skipped** - Code already clean with shared guard helper, no duplication found

**Plan metadata:** (pending final commit)

_Note: TDD task with RED/GREEN commits. Refactor skipped -- no duplication identified._

## Files Created/Modified
- `packages/api/src/services/git-health.ts` - Pure health check functions, orchestrator, URL normalization, score computation, severity escalation
- `packages/api/src/__tests__/services/git-health.test.ts` - 54 unit tests covering all check functions, edge cases, and orchestrator behavior

## Decisions Made
- checkDirtyWorkingTree always returns "info" severity; escalation is a separate pure function (escalateDirtySeverity) called during post-scan phase for age-based re-upsert
- shouldSkipUpstreamChecks shared guard deduplicates the common "skip if no remote/detached/no upstream/gone" check used by unpushed and unpulled
- normalizeRemoteUrl lowercases all URLs for case-insensitive matching, ensuring SSH/HTTPS variants produce identical strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript strict type errors in regex match results**
- **Found during:** GREEN phase (implementation)
- **Issue:** `RegExpMatchArray` index access returns `string | undefined`, not assignable to `string` in strict mode
- **Fix:** Added explicit truthiness checks on match group results (`sshMatch[1] && sshMatch[2]`)
- **Files modified:** packages/api/src/services/git-health.ts
- **Verification:** `pnpm typecheck` passes clean
- **Committed in:** `77d646c` (part of GREEN commit)

**2. [Rule 1 - Bug] Removed unused HealthSeverity import in test file**
- **Found during:** GREEN phase (typecheck)
- **Issue:** `HealthSeverity` imported but not used in test file, TypeScript strict mode error
- **Fix:** Removed unused import
- **Files modified:** packages/api/src/__tests__/services/git-health.test.ts
- **Verification:** `pnpm typecheck` passes clean
- **Committed in:** `77d646c` (part of GREEN commit)

---

**Total deviations:** 2 auto-fixed (2 bugs -- TypeScript strict mode issues)
**Impact on plan:** Both fixes necessary for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- git-health.ts exports all functions needed by Plan 02 (git scanner service)
- HealthScanData interface is the contract between the scanner (collects data) and check functions (evaluate data)
- escalateDirtySeverity ready for Plan 03 post-scan phase to call with detectedAt timestamps

---
*Phase: 07-git-health-engine*
*Completed: 2026-03-14*
