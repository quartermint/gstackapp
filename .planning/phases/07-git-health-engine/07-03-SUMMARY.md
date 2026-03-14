---
phase: 07-git-health-engine
plan: 03
subsystem: api
tags: [git, health-engine, divergence-detection, copy-reconciliation, event-emission, dirty-escalation]

# Dependency graph
requires:
  - phase: 07-git-health-engine
    provides: runHealthChecks, escalateDirtySeverity, normalizeRemoteUrl from Plan 01; getCollectedHealthData, health data map from Plan 02
  - phase: 06-data-foundation
    provides: upsertHealthFinding, resolveFindings, getActiveFindings, getCopiesByRemoteUrl query functions
provides:
  - runPostScanHealthPhase: orchestrates per-repo checks, dirty escalation, copy divergence, event emission
  - checkAncestry: testable git merge-base ancestry checker (ancestor/descendant/diverged/unknown)
  - health:changed event fires after every scan cycle
  - copy:diverged event fires when multi-copy divergence detected
  - Dirty working tree severity escalation persisted (info -> warning -> critical by age)
affects: [08 health API, 09 dashboard intelligence]

# Tech tracking
tech-stack:
  added: []
  patterns: [post-scan health phase orchestration, 4-stage pipeline (checks, escalation, divergence, events), ancestry detection via git merge-base]

key-files:
  created:
    - packages/api/src/__tests__/services/project-scanner-health.test.ts
  modified:
    - packages/api/src/services/project-scanner.ts

key-decisions:
  - "checkAncestry exported as testable function with promisified execFile and explicit exit code handling"
  - "diverged_copies added to activeCheckTypes during resolveFindings to prevent premature auto-resolution"
  - "health:changed emitted unconditionally after every scan cycle (simple, avoids complex diffing)"

patterns-established:
  - "Post-scan health phase: 4-stage pipeline (per-repo checks, dirty escalation, copy divergence, event emission)"
  - "checkAncestry signature: (localPath, headA, headB) -> ancestor|descendant|diverged|unknown"
  - "Stale SSH data (>10min since lastCheckedAt) demotes divergence severity from critical to warning"

requirements-completed: [HLTH-01, HLTH-02, HLTH-03, HLTH-04, HLTH-05, HLTH-06, HLTH-07, HLTH-08, COPY-01, COPY-03, COPY-04]

# Metrics
duration: 14min
completed: 2026-03-14
---

# Phase 7 Plan 3: Post-Scan Health Orchestration Summary

**Post-scan health phase with 4-stage pipeline: per-repo finding persistence, dirty working tree age escalation, multi-copy divergence detection via git merge-base ancestry, and real-time health/divergence event emission**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-14T19:16:00Z
- **Completed:** 2026-03-14T19:30:37Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 2

## Accomplishments
- runPostScanHealthPhase wired into scanAllProjects as 4-stage post-scan pipeline
- Per-repo health checks persist findings via upsertHealthFinding with correct resolveFindings lifecycle
- Dirty working tree severity escalation re-upserts findings based on detectedAt age (info < 3d, warning 3-7d, critical 7d+)
- Multi-copy divergence detection compares HEAD commits and checks ancestry via git merge-base
- Stale SSH data (>10min since lastCheckedAt) demotes divergence severity to warning, preventing false critical alerts
- health:changed event fires after every scan cycle; copy:diverged fires on new divergence detection
- checkAncestry exported as testable function with full edge case coverage (ancestor, descendant, diverged, unknown, error)
- 8 new tests covering divergence detection and dirty escalation wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement post-scan health phase** - `3ad9755` (feat)
2. **Task 2: Add divergence detection and dirty escalation tests** - `0bfcd07` (test)
3. **Task 3: Verify health engine (checkpoint)** - auto-approved

**Plan metadata:** (pending final commit)

_Note: Task 2 used TDD approach. Task 3 was a human-verify checkpoint, auto-approved._

## Files Created/Modified
- `packages/api/src/services/project-scanner.ts` - Added runPostScanHealthPhase (4-stage pipeline), checkAncestry, divergence detection, dirty escalation, event emission (+261 lines)
- `packages/api/src/__tests__/services/project-scanner-health.test.ts` - Tests for checkAncestry edge cases (ancestor, descendant, diverged, unknown, error) and dirty severity escalation wiring (195 lines)

## Decisions Made
- checkAncestry exported as a standalone testable function with promisified execFile, handling exit codes 0, 1, and 128 explicitly
- diverged_copies added to activeCheckTypes when calling resolveFindings, preventing the copy divergence finding from being prematurely auto-resolved by per-repo resolution
- health:changed event emitted unconditionally after every scan cycle -- simple approach avoids complex state diffing while ensuring SSE consumers always get fresh data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 7 (Git Health Engine) is now COMPLETE -- all 3 plans delivered
- Health findings are persisted after every scan cycle with correct severity levels
- Copy divergence detection is live for multi-host projects
- Phase 8 (Health API & Events) can now build API endpoints on top of:
  - getActiveFindings() for health data queries
  - computeHealthScore() for on-demand score derivation from active findings
  - getProjectRiskLevel() for risk level mapping
  - SSE events (health:changed, copy:diverged) for real-time dashboard updates

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 07-git-health-engine*
*Completed: 2026-03-14*
