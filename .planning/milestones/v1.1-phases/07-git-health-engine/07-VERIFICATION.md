---
phase: 07-git-health-engine
verified: 2026-03-14T20:35:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 7: Git Health Engine Verification Report

**Phase Goal:** The scanner produces accurate health findings for every project across both hosts, with correct severity scoring and multi-host divergence detection
**Verified:** 2026-03-14T20:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each of the 6 per-repo health check functions returns a correctly typed HealthFindingInput or null | VERIFIED | git-health.ts lines 39-141; 54 unit tests pass covering all 6 functions |
| 2 | Checks execute in dependency order: no-remote gates everything, detached HEAD gates upstream checks, gone/broken gate unpushed/unpulled | VERIFIED | runHealthChecks (lines 238-279) enforces dependency chain; 8 orchestrator tests pass |
| 3 | Unpushed severity escalates from warning to critical at 6+ commits | VERIFIED | checkUnpushedCommits CRITICAL_THRESHOLD=6; tests for 5=warning, 6=critical |
| 4 | Public repos escalate unpushed severity by one tier | VERIFIED | HLTH-07 escalation in checkUnpushedCommits lines 99-101; dedicated test case passes |
| 5 | Health score maps worst severity to 0-100 number (critical=20, warning=60, healthy=100) | VERIFIED | computeHealthScore lines 215-225; 4 test cases pass |
| 6 | Remote URL normalization produces identical strings for SSH and HTTPS variants of the same repo | VERIFIED | normalizeRemoteUrl lines 182-205; 7 test cases including cross-format equality test |
| 7 | Dirty working tree severity escalates from info to warning at 3+ days and critical at 7+ days based on detectedAt age | VERIFIED | escalateDirtySeverity lines 153-171; 7 age-boundary tests pass |
| 8 | Local git repos produce HealthScanData with all fields populated from a single sh -c invocation | VERIFIED | collectLocalHealthData lines 133-177; 7-command joined script with ===DELIM=== separators |
| 9 | Mac Mini repos produce HealthScanData from extended SSH batch with new section delimiters | VERIFIED | buildSshBatchScript lines 294-323 adds 7 sections (===REMOTE=== through ===HEAD_HASH===); parseHealthFromSshOutput at line 216 |
| 10 | Multi-copy config entries are normalized into individual scan targets alongside single-host entries | VERIFIED | flattenToScanTargets lines 474-514; scanAllProjects uses it at line 783 |
| 11 | Each scanned copy is upserted into project_copies with remote URL, HEAD commit, branch, and lastCheckedAt | VERIFIED | upsertCopy called at lines 914-922 with all fields; guarded by `if (healthData)` |
| 12 | SSH failure leaves existing copy data untouched (does not update headCommit or lastCheckedAt) | VERIFIED | SSH failure path at line 809 leaves scanResult=null; upsertCopy only called inside `if (healthData)` block which requires successful scan |
| 13 | After each scan cycle, health findings are persisted for every scanned local/mac-mini project | VERIFIED | runPostScanHealthPhase Stage 1 (lines 588-602) iterates healthDataMap, calls upsertHealthFinding per finding |
| 14 | Findings that no longer apply are resolved (resolvedAt set) while active findings are preserved with original detectedAt | VERIFIED | resolveFindings called with activeCheckTypes at line 601; diverged_copies added to prevent premature auto-resolution |
| 15 | Multi-copy projects with different HEAD commits and no ancestry relationship produce a diverged_copies finding | VERIFIED | Stage 3 (lines 635-763) groups by normalized URL, compares HEADs, calls checkAncestry, upserts diverged_copies finding at line 749 |
| 16 | Stale SSH data (lastCheckedAt older than 2 scan cycles) demotes divergence severity to warning | VERIFIED | STALE_THRESHOLD_MS=600_000 at line 737; isStale used in severity selection at line 749 |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/git-health.ts` | Pure health check functions, HealthScanData interface, normalizeRemoteUrl, computeHealthScore, runHealthChecks, escalateDirtySeverity | VERIFIED | 280 lines; all exports present; imports HealthFindingInput and HealthSeverity from @mission-control/shared |
| `packages/api/src/__tests__/services/git-health.test.ts` | Unit tests for all health check functions with mocked HealthScanData | VERIFIED | 466 lines (>150 minimum); 54 tests passing; uses makeScanData() helper |
| `packages/api/src/services/project-scanner.ts` | Extended scanner with health data collection, multi-copy normalization, copy upsert, isPublic caching | VERIFIED | 1015 lines; contains collectLocalHealthData, flattenToScanTargets, runPostScanHealthPhase, checkAncestry, getCollectedHealthData |
| `packages/api/src/services/event-bus.ts` | New health:changed and copy:diverged event types | VERIFIED | Lines 11-12 add both types to MCEventType union |
| `packages/api/src/__tests__/services/project-scanner-health.test.ts` | Unit tests for divergence detection with mocked execFile, covering all edge cases | VERIFIED | 195 lines (>80 minimum); 8 tests passing: 5 checkAncestry cases + 3 escalation wiring cases |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| git-health.ts | @mission-control/shared | imports HealthFindingInput and HealthSeverity types | WIRED | Line 1-4: `import type { HealthFindingInput, HealthSeverity } from "@mission-control/shared"` |
| project-scanner.ts | git-health.ts | imports HealthScanData type and normalizeRemoteUrl | WIRED | Line 13-14: `import { normalizeRemoteUrl, runHealthChecks, escalateDirtySeverity } from "./git-health.js"` and `import type { HealthScanData }` |
| project-scanner.ts | db/queries/copies.ts | calls upsertCopy after each scan | WIRED | Line 10: import; lines 914-922: upsertCopy called with all fields |
| project-scanner.ts | db/queries/health.ts | calls upsertHealthFinding and resolveFindings | WIRED | Line 11: import; lines 592, 601, 613, 749: called in runPostScanHealthPhase |
| project-scanner.ts | db/queries/copies.ts | calls getCopiesByRemoteUrl for divergence detection | WIRED | Line 10: import; line 638: called in Stage 3 divergence detection |
| project-scanner.ts | event-bus.ts | emits health:changed and copy:diverged events | WIRED | Lines 761, 764: both event types emitted from Stage 4 |
| project-scanner-health.test.ts | project-scanner.ts | tests divergence detection via checkAncestry | WIRED | Line 50: `import { checkAncestry } from "../../services/project-scanner.js"` |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HLTH-01 | 07-01, 07-02, 07-03 | Detects unpushed commits per project with severity (warning: 1-5, critical: 6+) | SATISFIED | checkUnpushedCommits with CRITICAL_THRESHOLD=6; persisted by runPostScanHealthPhase |
| HLTH-02 | 07-01 | Detects projects with no remote configured (critical) | SATISFIED | checkNoRemote returns critical finding when hasRemote=false |
| HLTH-03 | 07-01 | Detects broken upstream tracking (critical) | SATISFIED | checkBrokenTracking returns critical when has remote but no upstream |
| HLTH-04 | 07-01 | Detects deleted remote branches (critical) | SATISFIED | checkRemoteBranchGone returns critical when upstreamGone=true |
| HLTH-05 | 07-01 | Detects unpulled commits (warning) | SATISFIED | checkUnpulledCommits returns warning finding |
| HLTH-06 | 07-01, 07-02, 07-03 | Tracks dirty working tree age with escalating severity | SATISFIED | escalateDirtySeverity (info/warning/critical by 0/3/7 days); Stage 2 re-upserts in post-scan phase |
| HLTH-07 | 07-01 | Public repos escalate unpushed severity one tier | SATISFIED | isPublic escalates warning to critical in checkUnpushedCommits |
| HLTH-08 | 07-01 | Each project gets health score (0-100) computed on-demand | SATISFIED | computeHealthScore exported; score derived at query time (Phase 8), not persisted during scan |
| COPY-01 | 07-01, 07-02, 07-03 | System auto-discovers multi-copy projects by matching normalized remote URLs | SATISFIED | normalizeRemoteUrl + getCopiesByRemoteUrl grouping in Stage 3 divergence detection |
| COPY-03 | 07-03 | System detects diverged copies via HEAD comparison and ancestry check | SATISFIED | Stage 3: HEAD comparison, checkAncestry via git merge-base, diverged_copies finding upserted |
| COPY-04 | 07-02, 07-03 | System tracks per-copy freshness and handles stale SSH data gracefully | SATISFIED | SSH failure skips upsertCopy; stale threshold (>10min) demotes divergence to warning |

**No orphaned requirements:** COPY-02, HLTH-09, HLTH-10 are Phase 6 requirements and are not Phase 7 responsibilities.

### Anti-Patterns Found

No anti-patterns found in Phase 7 files.

- No TODO/FIXME/HACK/PLACEHOLDER comments
- No stub return patterns (`return {}` / `return []` inappropriately)
- `return null` patterns in git-health.ts are all legitimate "no issue found" paths for check functions
- No console.log-only implementations
- No empty event handlers

### Human Verification Required

### 1. Live scan produces accurate health findings

**Test:** Start the API server (`pnpm --filter @mission-control/api dev`), wait for initial scan (~10 seconds), then query: `sqlite3 data/mc.db "SELECT project_slug, check_type, severity, detail FROM project_health WHERE resolved_at IS NULL ORDER BY severity DESC LIMIT 20;"`
**Expected:** Rows appear for projects with known issues (unpushed commits, dirty trees, no remotes)
**Why human:** Cannot verify correctness of live git state — requires knowledge of actual repo states on disk

### 2. Copy records populated correctly

**Test:** `sqlite3 data/mc.db "SELECT project_slug, host, branch, head_commit, is_public, last_checked_at FROM project_copies LIMIT 20;"`
**Expected:** Rows exist for all local and mac-mini scanned projects with non-null head_commit and branch values
**Why human:** Requires a live scan against real repos on disk and the Mac Mini

### 3. Divergence detection with real multi-copy project

**Test:** If any project exists on both local and Mac Mini, verify diverged_copies finding appears/resolves correctly based on actual HEAD commits
**Expected:** When HEADs match, no finding; when diverged without ancestry, critical finding; when stale, warning
**Why human:** Requires real multi-host project configuration and verifying git state across hosts

## Test Suite Results

- `git-health.test.ts`: 54/54 tests passing
- `project-scanner-health.test.ts`: 8/8 tests passing
- Full suite (`pnpm test`): all passing (cached)
- Typecheck (`pnpm typecheck`): clean (cached)

## Commits Verified

All 7 Phase 7 commits verified in git history:
- `2929ce5` — test(07-01): add failing tests for pure git health check functions
- `77d646c` — feat(07-01): implement pure git health check functions
- `0839913` — feat(07-02): add health:changed and copy:diverged event types to event bus
- `d0ce3da` — feat(07-02): add health data collection functions and extend SSH batch
- `c128ed3` — feat(07-02): integrate multi-copy normalization, isPublic cache, and health data into scanAllProjects
- `3ad9755` — feat(07-03): wire health engine into scanner post-scan phase
- `0bfcd07` — test(07-03): add divergence detection and dirty escalation tests

## Gaps Summary

No gaps. All 16 observable truths verified, all 5 artifacts exist with substantive implementation, all 7 key links confirmed wired. 11 requirement IDs from PLAN frontmatter are satisfied. No orphaned Phase 7 requirements in REQUIREMENTS.md. Test suite is green with 54 + 8 = 62 new tests across the two new test files.

---

_Verified: 2026-03-14T20:35:00Z_
_Verifier: Claude (gsd-verifier)_
