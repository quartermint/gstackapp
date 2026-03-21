---
phase: 25-dependency-intelligence
plan: 01
subsystem: api
tags: [git-health, dependency-drift, pure-functions, health-findings, severity-escalation]

# Dependency graph
requires:
  - phase: 23-config-foundation
    provides: dependsOn field in mc.config.json with cycle detection
provides:
  - checkDependencyDrift pure function for detecting dependency head changes
  - escalateDependencyDriftSeverity with info/warning/critical escalation
  - DependencyPair type for config-based dependency graph
  - Stage 3.5 in post-scan health phase for dependency drift detection
  - dependsOn field in GET /api/projects response
  - dependency_impact action hint for risk feed cards
affects: [25-02, dashboard, risk-feed, mcp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure function drift detection with Map-based head commit tracking"
    - "Module-level previousHeadCommits state for cross-cycle comparison"
    - "Stage 3.5 pattern: detect -> upsert -> escalate -> resolve cleared"

key-files:
  created:
    - packages/api/src/__tests__/services/dependency-drift.test.ts
  modified:
    - packages/api/src/services/git-health.ts
    - packages/api/src/services/project-scanner.ts
    - packages/api/src/routes/projects.ts
    - packages/web/src/lib/action-hints.ts
    - packages/web/src/lib/grouping.ts
    - packages/web/src/__tests__/lib/grouping.test.ts

key-decisions:
  - "First scan baseline: skip drift detection when previousHeadCommits is empty (no false positives on startup)"
  - "Severity escalation thresholds: <24h info, >=24h warning, >=7d critical (matching D-04 spec)"
  - "currentHeads map prefers non-null headCommit when slug appears on multiple hosts"

patterns-established:
  - "Dependency drift detection as pure function with Map inputs for testability"
  - "Stage 3.5 in post-scan pipeline: detect -> upsert -> escalate -> resolve"

requirements-completed: [INTEL-03, INTEL-04, INTEL-05, INTEL-06]

# Metrics
duration: 6min
completed: 2026-03-21
---

# Phase 25 Plan 01: Dependency Drift Engine Summary

**Pure function dependency drift detection with severity escalation (info->warning->critical), integrated into post-scan health phase as Stage 3.5, with dependsOn in API response and action hints for risk cards**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-21T16:57:29Z
- **Completed:** 2026-03-21T17:04:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- checkDependencyDrift pure function detects when dependency head changes between scan cycles, with 18 tests covering all edge cases (empty pairs, missing heads, first scan baseline, multi-pair independence)
- escalateDependencyDriftSeverity escalates info -> warning (24h) -> critical (7d) with deterministic testing via optional now parameter
- Stage 3.5 integrated into post-scan health phase: builds dependency pairs from config, detects drift, upserts findings, escalates existing findings, and auto-resolves cleared drift
- dependsOn field piped through GET /api/projects response via config lookup
- dependency_impact action hint renders contextual git pull command with dependency slug

## Task Commits

Each task was committed atomically:

1. **Task 1: Dependency drift pure functions + tests** - `ac7e9f0` (feat) - TDD: RED (18 failing) -> GREEN (18 passing)
2. **Task 2: Integrate drift detection into post-scan health phase + API response + action hints** - `68d7e54` (feat)

## Files Created/Modified
- `packages/api/src/services/git-health.ts` - DependencyPair interface, checkDependencyDrift, escalateDependencyDriftSeverity
- `packages/api/src/__tests__/services/dependency-drift.test.ts` - 18 tests for drift detection and severity escalation
- `packages/api/src/services/project-scanner.ts` - Stage 3.5 dependency drift detection, previousHeadCommits tracking, config parameter threading
- `packages/api/src/routes/projects.ts` - dependsOn field in project list API response
- `packages/web/src/lib/action-hints.ts` - Action hint for dependency_impact check type
- `packages/web/src/lib/grouping.ts` - dependsOn field in ProjectItem interface
- `packages/web/src/__tests__/lib/grouping.test.ts` - Updated test fixture with dependsOn field

## Decisions Made
- First scan baseline: skip drift detection when previousHeadCommits is empty (prevents false positives on initial startup or restart)
- Severity escalation thresholds: <24h info, >=24h warning, >=7d critical (matching D-04 spec from RESEARCH)
- currentHeads map prefers non-null headCommit when a slug appears on multiple hosts (first non-null wins)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed ProjectItem type error in grouping test**
- **Found during:** Task 2 (integration)
- **Issue:** Adding dependsOn to ProjectItem interface broke the test fixture in grouping.test.ts (missing required property)
- **Fix:** Added `dependsOn: []` to the makeProject helper in the test file
- **Files modified:** packages/web/src/__tests__/lib/grouping.test.ts
- **Verification:** pnpm typecheck passes, all 76 web tests pass
- **Committed in:** 68d7e54 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dependency drift detection engine is fully operational in the scan pipeline
- dependsOn data flows through API to frontend
- Ready for Plan 02 (relationship graph visualization and dashboard integration)
- All 540 API tests + 76 web tests + 18 new drift tests passing
- TypeScript strict mode clean across all packages

---
*Phase: 25-dependency-intelligence*
*Completed: 2026-03-21*

## Self-Check: PASSED
- All created files exist
- All commit hashes found (ac7e9f0, 68d7e54)
- Test file exceeds min_lines requirement (226 >= 80)
- 540 API tests + 76 web tests + 18 new drift tests passing
- TypeScript strict typecheck clean
