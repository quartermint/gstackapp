---
phase: 18-auto-discovery-engine-ssh-github-orgs
verified: 2026-03-16T23:15:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 18: Auto-Discovery Engine (SSH + GitHub Orgs) Verification Report

**Phase Goal:** Discovery extends beyond the MacBook to surface repos on Mac Mini and in GitHub organizations, with cross-host deduplication
**Verified:** 2026-03-16T23:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Combined must-haves from both PLANs (18-01 and 18-02):

| #  | Truth | Status | Evidence |
|----|-------|--------|---------|
| 1  | SSH scan finds git repos on Mac Mini not already tracked in mc.config.json | VERIFIED | `scanSshDiscoveries` filters via `getTrackedPaths(config, "mac-mini")` before upserting; test "skips repos already tracked" passes |
| 2  | SSH failure (timeout, unreachable) is non-fatal and logged, never crashes the discovery cycle | VERIFIED | Entire SSH execFile call wrapped in try/catch; logs `console.warn("SSH discovery scan failed:", ...)` and returns 0; test "returns 0 and does not throw when SSH fails" passes |
| 3  | GitHub org scan lists repos from configured orgs (quartermint, vanboompow) not already tracked | VERIFIED | `scanGithubOrgDiscoveries` reads `config.discovery?.githubOrgs`, filters via `getTrackedGithubRepos`; test "skips repos already tracked in config" passes |
| 4  | Same repo found on MacBook + Mac Mini + GitHub appears as one discovery entry via remote URL dedup | VERIFIED | `isAlreadyDiscoveredByRemoteUrl` called before every upsert in all three scan loops; backed by `getDiscoveriesByNormalizedUrl` + `normalizeRemoteUrl`; dedup test "same repo on local and github are deduped" passes |
| 5  | All sources (local, SSH, GitHub) run in a single scanForDiscoveries cycle | VERIFIED | `scanForDiscoveries` calls local scan inline, then `await scanSshDiscoveries(...)`, then `await scanGithubOrgDiscoveries(...)`, summing all three counts before returning |
| 6  | SSH scan tests verify parsing of find+git batch output and graceful timeout handling | VERIFIED | 4 SSH tests pass: failure-resilience, batch output parsing, tracked-path skip, dismissed-path skip |
| 7  | GitHub org scan tests verify gh API output parsing and per-org error isolation | VERIFIED | 4 GitHub org tests pass: empty-orgs returns 0, API output parsing, tracked-repo skip, per-org error isolation |
| 8  | Cross-host dedup tests verify same remote URL on different hosts produces one discovery | VERIFIED | 4 dedup tests in discovery-scanner.test.ts pass: normalized URL matching, null-remote exclusion, SSH vs HTTPS equivalence, same-host non-dedup |
| 9  | SSH failure test confirms non-fatal behavior (returns 0, no throw) | VERIFIED | Test explicitly asserts `count === 0` with no try/catch needed in test; covered in truth #6 |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/discovery-scanner.ts` | scanSshDiscoveries, scanGithubOrgDiscoveries, dedup functions | VERIFIED | All three exported functions present and substantive (300+ lines total); no stubs |
| `packages/api/src/db/queries/discoveries.ts` | getDiscoveriesByNormalizedUrl query for dedup lookups | VERIFIED | Function exported at line 170; full JS-side filter implementation; imports normalizeRemoteUrl |
| `packages/api/src/__tests__/services/discovery-scanner-ssh-github.test.ts` | SSH and GitHub org scanner tests with hoisted child_process mock | VERIFIED | Created as separate file (plan deviation, auto-fixed); 8 tests covering SSH+GitHub scenarios |
| `packages/api/src/__tests__/services/discovery-scanner.test.ts` | Cross-host dedup test suite appended | VERIFIED | 4 dedup tests added at line 296; imports getDiscoveriesByNormalizedUrl and normalizeRemoteUrl |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| discovery-scanner.ts | git-health.ts | `normalizeRemoteUrl` import | VERIFIED | Line 19: `import { normalizeRemoteUrl } from "./git-health.js"` |
| discovery-scanner.ts | discoveries.ts | `upsertDiscovery, getDismissedPaths, getDiscoveriesByNormalizedUrl` | VERIFIED | Lines 10-16: all three imported and used in scan loops |
| discovery-scanner.ts | ssh execFile | `execFile("ssh", ["-o", "ConnectTimeout=3", ...])` | VERIFIED | Lines 319-323: SSH_CONNECT_TIMEOUT=3 constant used, SSH_CMD_TIMEOUT=10_000 as timeout option |
| discoveries.ts | git-health.ts | `normalizeRemoteUrl` import | VERIFIED | Line 6: `import { normalizeRemoteUrl } from "../../services/git-health.js"` |
| discovery-scanner-ssh-github.test.ts | discovery-scanner.ts | import of scanSshDiscoveries, scanGithubOrgDiscoveries | VERIFIED | Lines 40-42: direct named imports |
| discovery-scanner-ssh-github.test.ts | discoveries.ts | import of upsertDiscovery, listDiscoveries, updateDiscoveryStatus | VERIFIED | Lines 34-38 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| DISC-05 | 18-01, 18-02 | Discovery engine scans Mac Mini repos via SSH with graceful timeout/failure handling | SATISFIED | `scanSshDiscoveries` exported; ConnectTimeout=3 / timeout=10_000; try/catch returns 0 on failure; 4 SSH tests pass |
| DISC-06 | 18-01, 18-02 | Discovery engine lists repos from configured GitHub orgs (quartermint, vanboompow) | SATISFIED | `scanGithubOrgDiscoveries` exported; reads `config.discovery.githubOrgs`; uses `gh api orgs/{org}/repos --paginate`; 4 GitHub tests pass |
| DISC-07 | 18-01, 18-02 | Cross-host dedup matches discoveries by normalized remote URL to avoid duplicates | SATISFIED | `isAlreadyDiscoveredByRemoteUrl` called in all three source loops; `getDiscoveriesByNormalizedUrl` + `normalizeRemoteUrl` implement the dedup logic; 4 dedup tests pass |

No orphaned requirements — all three requirement IDs appear in both PLANs' frontmatter and are confirmed satisfied.

### Anti-Patterns Found

None. No TODOs, FIXMEs, placeholders, empty implementations, or stub returns found in either modified file.

### Human Verification Required

None. All behavioral requirements (SSH timeout values, GitHub API pagination, dedup logic, test coverage) are fully verifiable via code inspection and automated tests.

## Test Results Summary

All 23 discovery scanner tests pass across both test files:

- `discovery-scanner-ssh-github.test.ts`: 8 tests (4 SSH, 4 GitHub org) — all pass
- `discovery-scanner.test.ts`: 15 tests (11 existing + 4 new dedup) — all pass
- `pnpm typecheck`: passes with zero errors (6/6 tasks cached clean)

Documented commits verified in git history:
- `0068ec8` — feat(18-01): add SSH and GitHub org discovery scanning functions
- `b22e0f8` — feat(18-01): add cross-host dedup and wire all sources into scanForDiscoveries
- `d5e5320` — test(18-02): add SSH, GitHub org, and cross-host dedup scanner tests

## Notable Plan Deviation (Auto-Fixed)

Plan 18-02 specified adding SSH/GitHub tests to the existing `discovery-scanner.test.ts`. The executor correctly split them into a separate `discovery-scanner-ssh-github.test.ts` because `vi.mock("node:child_process")` is hoisted to file scope and would have broken the existing tests that don't need child_process mocking. The plan's test skeletons were adapted to use `vi.hoisted + promisify.custom` for correct mock behavior with Node's promisified execFile. This is a correct auto-fix — no scope change, better isolation.

---

_Verified: 2026-03-16T23:15:00Z_
_Verifier: Claude (gsd-verifier)_
