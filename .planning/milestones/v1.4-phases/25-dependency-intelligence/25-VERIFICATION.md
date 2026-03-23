---
phase: 25-dependency-intelligence
verified: 2026-03-21T18:00:00Z
status: passed
score: 9/9 must-haves verified
re_verification: false
---

# Phase 25: Dependency Intelligence Verification Report

**Phase Goal:** MC detects when dependency projects have changes the dependent hasn't consumed, surfacing drift and impact as health findings
**Verified:** 2026-03-21T18:00:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Project cards display dependency badges showing which projects each depends on | VERIFIED | `DependencyBadges` rendered in `project-row.tsx` after `HostBadge`; reads `project.dependsOn` from `ProjectItem` |
| 2 | When a dependency project has unpulled commits, a `dependency_impact` health finding appears on the dependent project | VERIFIED | `checkDependencyDrift` pure function in `git-health.ts` fires `dependency_impact` finding when dependency head changes between scan cycles |
| 3 | Dependency drift findings escalate severity based on age (info at detection, warning after 24h, critical after 7d) | VERIFIED | `escalateDependencyDriftSeverity` in `git-health.ts` — `<24h: info`, `>=24h: warning`, `>=168h: critical`; called in Stage 3.5 on all active `dependency_impact` findings |
| 4 | Cross-machine reconciliation continuously detects unpushed commits, diverged copies, and stale services across MacBook and Mac Mini | VERIFIED | Stage 3.5 uses existing `healthDataMap` (keyed `slug:host`) which already aggregates both local and mac-mini scan data per scan cycle — no additional SSH calls needed |
| 5 | Commit impact alerts fire on dependent projects when a dependency pushes new commits | VERIFIED | Stage 3.5 in `runPostScanHealthPhase` compares `currentHeads` against `previousHeadCommits`; upserts `dependency_impact` finding on dependent slug when dependency head changes |

**Score:** 5/5 success criteria verified

### Plan-Level Must-Have Truths

**Plan 01 Truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When a dependency project pushes new commits, a dependency_impact health finding appears on the dependent project | VERIFIED | `checkDependencyDrift` → `upsertHealthFinding` in Stage 3.5 |
| 2 | Dependency drift findings start as info, escalate to warning after 24h, and to critical after 7d | VERIFIED | `escalateDependencyDriftSeverity` called on all active `dependency_impact` findings in Stage 3.5 |
| 3 | Cross-machine reconciliation uses existing scan data only (no additional SSH calls or git commands) | VERIFIED | Stage 3.5 operates on `healthDataMap` parameter only; RESEARCH doc explicitly confirms piggyback approach |
| 4 | Dependency impact findings persist across scan cycles and resolve when the dependent pulls | VERIFIED | `upsertHealthFinding` persists; `resolved_at` set via raw SQL UPDATE when finding no longer in `driftedSlugs` set |
| 5 | Risk feed automatically surfaces dependency_impact findings with an action hint | VERIFIED | `action-hints.ts` case `"dependency_impact"` returns contextual `git pull # dependency "${depSlug}" has new commits` |

**Plan 02 Truths:**

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 6 | Project cards display small pill badges showing dependency project names | VERIFIED | `DependencyBadges` renders `<span>` pills for each dep slug in `project-row.tsx` |
| 7 | When a project has more than 3 dependencies, badges collapse to show 3 pills plus '+N more' | VERIFIED | `MAX_VISIBLE = 3`; `remaining > 0` renders `+{remaining} more` span |
| 8 | Dependency badges use a neutral color (not health-coded) consistent with the existing HostBadge pattern | VERIFIED | `bg-warm-gray/8 text-text-muted dark:text-text-muted-dark border border-warm-gray/10` — matches HostBadge neutral style |
| 9 | Projects with no dependencies show no badge area (no empty space) | VERIFIED | `if (dependsOn.length === 0) return null` — confirmed by test "renders nothing when dependsOn is empty" |

**Score:** 9/9 must-have truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/git-health.ts` | `checkDependencyDrift`, `escalateDependencyDriftSeverity`, `DependencyPair` | VERIFIED | All three exported; implementations are substantive with full logic (not stubs); 226-line test file validates behavior |
| `packages/api/src/services/project-scanner.ts` | Stage 3.5 dependency drift detection, `previousHeadCommits` tracking, config threading | VERIFIED | Stage 3.5 at line 780; `previousHeadCommits` module-level Map at line 527; config param threaded through `runPostScanHealthPhase` |
| `packages/api/src/routes/projects.ts` | `dependsOn` field in project list API response | VERIFIED | `dependsOnMap` built from config; `dependsOn: dependsOnMap.get(project.slug) ?? []` added to each project record |
| `packages/web/src/lib/action-hints.ts` | Action hint for `dependency_impact` check type | VERIFIED | `case "dependency_impact"` in switch at line 26; uses `metadata.dependencySlug` for contextual message |
| `packages/api/src/__tests__/services/dependency-drift.test.ts` | Tests for drift detection, severity escalation, cross-machine comparison, edge cases (min 80 lines) | VERIFIED | 226 lines; 18 tests passing; covers all edge cases specified in plan |
| `packages/web/src/components/ui/dependency-badges.tsx` | `DependencyBadges` component with pill badges and +N more collapse (min 15 lines) | VERIFIED | 30 lines; `export function DependencyBadges`; `MAX_VISIBLE = 3`; `bg-warm-gray/8` neutral color |
| `packages/web/src/components/departure-board/project-row.tsx` | `DependencyBadges` rendered on project cards | VERIFIED | Import at line 6; rendered conditionally when `project.dependsOn.length > 0` |
| `packages/web/src/__tests__/components/dependency-badges.test.tsx` | Tests for rendering, collapse, empty state (min 40 lines) | VERIFIED | 86 lines; 8 tests passing; covers empty, 1-3 deps, collapse at 4 and 6, styling |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `project-scanner.ts` | `git-health.ts` | `import checkDependencyDrift, escalateDependencyDriftSeverity` | WIRED | Line 14: both functions imported and called in Stage 3.5 |
| `project-scanner.ts` | `db/queries/health.ts` | `upsertHealthFinding` with `checkType: "dependency_impact"` | WIRED | Line 806: `upsertHealthFinding(db, sqlite, finding)` for each drift finding; line 817 for escalation updates |
| `project-row.tsx` | `dependency-badges.tsx` | `import DependencyBadges` | WIRED | Line 6 import; line 74-77 conditional render with `project.dependsOn` |
| `project-row.tsx` | `grouping.ts` | `project.dependsOn` prop | WIRED | `ProjectItem.dependsOn: string[]` at line 30 of grouping.ts; consumed at line 74 of project-row.tsx |
| `routes/projects.ts` | `lib/config.ts` | `config.projects[].dependsOn` lookup | WIRED | Lines 49-54: `dependsOnMap` built from `cfg.projects`; piped to API response at line 105 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| INTEL-02 | 25-02 | Dashboard displays dependency badges on project cards | SATISFIED | `DependencyBadges` renders in `project-row.tsx` for all projects with `dependsOn`; 8 tests pass |
| INTEL-03 | 25-01 | Health engine detects dependency drift (dependency project has commits dependent hasn't pulled) | SATISFIED | `checkDependencyDrift` in `git-health.ts`; integrated as Stage 3.5 in scan pipeline |
| INTEL-04 | 25-01 | Drift findings escalate severity (>24h warning, >7d critical) | SATISFIED | `escalateDependencyDriftSeverity` with correct thresholds; called on all active `dependency_impact` findings each scan |
| INTEL-05 | 25-01 | Cross-machine reconciliation runs continuously | SATISFIED | Stage 3.5 uses existing `healthDataMap` which already aggregates both-host data; no additional SSH calls; covered by annotation `(INTEL-03, INTEL-05, INTEL-06)` at Stage 3.5 comment |
| INTEL-06 | 25-01 | Commit impact alerts fire as health findings on dependent projects | SATISFIED | `dependency_impact` findings upserted to `project_health` table via `upsertHealthFinding`; appear in risk feed automatically |

No orphaned requirements — all 5 requirements mapped to plans and verified.

### Anti-Patterns Found

No anti-patterns detected in phase 25 modified files:
- No TODO/FIXME/placeholder comments in phase 25 code
- No stub return values (`return null` in `dependency-badges.tsx` is the correct empty-state guard)
- No hardcoded empty data paths
- All implementations are substantive: `checkDependencyDrift` has real logic, Stage 3.5 has full detect-upsert-escalate-resolve pipeline
- Tests are behavioral (not just existence checks)

### Human Verification Required

1. **Visual appearance of dependency badges on departure board**
   - **Test:** Open Mission Control dashboard; find a project with `dependsOn` set in `mc.config.json`
   - **Expected:** Small neutral-gray pill badges appear after the host badge on the project card; projects without `dependsOn` show no badge area
   - **Why human:** Visual rendering requires a live browser

2. **Risk feed dependency_impact card action hint**
   - **Test:** Trigger a dependency drift finding (or observe one if already present in `project_health` table); check risk feed card
   - **Expected:** Card shows `git pull  # dependency "<slug>" has new commits` as the action hint
   - **Why human:** Requires an active drift finding and live risk feed rendering

3. **Severity escalation over real time**
   - **Test:** Observe a `dependency_impact` finding that has existed >24 hours
   - **Expected:** Finding severity is `warning` (not `info`) in the risk feed
   - **Why human:** Cannot fast-forward time in production; escalation is tested deterministically in unit tests but real-world aging needs observation

### Gaps Summary

No gaps found. All must-haves verified, all artifacts substantive and wired, all 5 requirement IDs satisfied, and all tests passing (18 API tests + 8 web tests, typecheck clean).

---

_Verified: 2026-03-21T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
