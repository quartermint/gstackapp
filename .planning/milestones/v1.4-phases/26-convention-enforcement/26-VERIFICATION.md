---
phase: 26-convention-enforcement
verified: 2026-03-21T18:30:00Z
status: gaps_found
score: 7/8 must-haves verified
re_verification: false
gaps:
  - truth: "Convention checks resolve findings automatically when violations are fixed"
    status: partial
    reason: "The 'content changed' branch in scanAllKnowledge (line 344) calls resolveFindings(sqlite, target.slug, []) which clears ALL findings including convention_violation before the convention pass re-creates them. This means convention_violation findings are cleared and re-upserted on every content-change scan rather than preserved in-place. The plan explicitly required this call to use [\"convention_violation\"] as the exclusion list (Task 2, Step 2 states both resolveFindings calls must be updated). Only the content-unchanged branch at line 312 was correctly fixed."
    artifacts:
      - path: "packages/api/src/services/knowledge-aggregator.ts"
        issue: "Line 344: resolveFindings(sqlite, target.slug, []) should be resolveFindings(sqlite, target.slug, [\"convention_violation\"]) to match the fix applied at line 312"
    missing:
      - "Change line 344 from resolveFindings(sqlite, target.slug, []) to resolveFindings(sqlite, target.slug, [\"convention_violation\"])"
      - "Add a test covering the content-changed path where convention_violation findings survive a stale_knowledge resolution"
human_verification:
  - test: "Run knowledge scan against actual registered projects"
    expected: "5 launch rules produce zero false positives across all registered projects with CLAUDE.md files (mission-control, nexusclaw, openefb, streamline, etc.)"
    why_human: "Zero-false-positive guarantee requires scanning real CLAUDE.md files on disk and confirming no spurious convention_violation findings appear in the risk feed — can't verify without running the actual scanner"
---

# Phase 26: Convention Enforcement Verification Report

**Phase Goal:** MC scans CLAUDE.md files for config-driven anti-patterns and surfaces violations as health findings with zero false positives
**Verified:** 2026-03-21T18:30:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Convention rules in mc.config.json validated by Zod at config load time | VERIFIED | `conventionRuleSchema` exported from config.ts with full field validation (kebab-case id regex, enum severity, enum matchType). Schema added to `mcConfigSchema.conventions`. `loadConfig()` calls `mcConfigSchema.safeParse()` which validates all conventions on startup. |
| 2 | CLAUDE.md content matching a must_not_match rule surfaces as convention_violation health finding | VERIFIED | `checkConventions()` in convention-scanner.ts returns `HealthFindingInput[]` with `checkType: "convention_violation"`. knowledge-aggregator.ts convention pass calls `upsertHealthFinding` for each finding. Integration test at line 491 confirms end-to-end. |
| 3 | Negative context patterns suppress findings when the CLAUDE.md explicitly documents the pattern | VERIFIED | Lines 52-66 of convention-scanner.ts: for each `negativeContext` pattern, tests against content using `new RegExp(negPattern, "im")` and suppresses the violation if any matches. Test at line 45 of convention-scanner.test.ts confirms. |
| 4 | Per-project conventionOverrides suppress specific rules | VERIFIED | `conventionOverrides` added to both `projectEntrySchema` and `multiCopyEntrySchema` in config.ts. knowledge-aggregator.ts line 370 reads `projectEntry?.conventionOverrides ?? []` and passes to `checkConventions()`. checkConventions uses a `Set` to skip overridden rules. Integration test at line 556 confirms. |
| 5 | must_match rules fire when required content is ABSENT from CLAUDE.md | VERIFIED | Lines 73-81 of convention-scanner.ts: `matchType === "must_match"` fires violation when `regex.test(content)` returns false. Test at line 76 of convention-scanner.test.ts confirms both the fire and no-fire cases. |
| 6 | Multiple rule violations aggregate into single convention_violation finding per project | VERIFIED | Lines 95-111 of convention-scanner.ts: all violations collected into array, then single `HealthFindingInput` returned with aggregated detail string. Test at line 133 confirms one finding with both rule IDs in detail. |
| 7 | Convention checks resolve findings automatically when violations are fixed | PARTIAL | Targeted SQL in knowledge-aggregator.ts line 382-385 correctly resolves `convention_violation` when no violations are found. BUT: line 344 calls `resolveFindings(sqlite, target.slug, [])` on the content-changed path, which clears ALL findings including `convention_violation` before the convention pass re-upserts them. Plan required BOTH calls to be updated; only line 312 was fixed. |
| 8 | 5 launch rules produce zero false positives across all existing projects | HUMAN NEEDED | 5 rules confirmed in mc.config.json and infra/mc.config.mac-mini.json. Code logic is correct. Actual false-positive guarantee requires running scanner against real CLAUDE.md corpus. |

**Score:** 6/8 truths verified (1 partial, 1 human-needed)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/api/src/services/convention-scanner.ts` | Pure-function convention rule engine | VERIFIED | Exists, 113 lines, exports `checkConventions`, handles must_not_match, must_match, negativeContext, overrides, severity escalation, aggregation |
| `packages/api/src/lib/config.ts` | Convention rule schema and conventionOverrides | VERIFIED | Exports `conventionRuleSchema`, `ConventionRule` type, `conventionOverrides` on both project entry schemas, `conventions` on `mcConfigSchema` |
| `packages/api/src/db/queries/knowledge.ts` | getAllKnowledgeWithContent query | VERIFIED | Function exists at line 37, returns full records including content using `db.select().from(projectKnowledge).all()` |
| `packages/api/src/__tests__/services/convention-scanner.test.ts` | Unit tests for scanner logic | VERIFIED | 281 lines, 14 tests covering all rule types, edge cases, metadata, and severity escalation |
| `mc.config.json` | 5 launch convention rules | VERIFIED | All 5 rules present: no-deprecated-models, no-stale-project-name, has-overview-section, no-todo-markers, no-secrets-in-docs |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| convention-scanner.ts | config.ts | `ConventionRule` type import | WIRED | Line 1 of convention-scanner.ts: `import type { ConventionRule } from "../lib/config.js"` |
| knowledge-aggregator.ts | convention-scanner.ts | `checkConventions` call | WIRED | Line 7: `import { checkConventions } from "./convention-scanner.js"`, called at line 372 |
| knowledge-aggregator.ts | knowledge.ts | `getAllKnowledgeWithContent` call | WIRED | Line 5: imported, called at line 364 in convention pass |
| convention-scanner.ts | health.ts | `HealthFindingInput` return type | WIRED | Line 2: `import type { HealthFindingInput, HealthSeverity } from "@mission-control/shared"`, function returns `HealthFindingInput[]` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| KNOW-04 | 26-01-PLAN.md | Convention anti-pattern registry is config-driven with support for negative context patterns | SATISFIED | `conventionRuleSchema` with `negativeContext` array, validated by Zod, loaded from mc.config.json |
| KNOW-05 | 26-01-PLAN.md | Convention scanner detects anti-patterns in CLAUDE.md files during scan and surfaces as health findings | SATISFIED | `checkConventions()` integrated into `scanAllKnowledge()` convention pass, findings upserted via `upsertHealthFinding` |
| KNOW-06 | 26-01-PLAN.md | Convention registry launches with ≤5 curated rules validated against all projects for zero false positives | SATISFIED (code) / HUMAN for zero-FP claim | 5 rules in both mc.config.json and infra/mc.config.mac-mini.json. Code logic is correct. Zero-false-positive claim requires human runtime verification. |

No orphaned requirements found. KNOW-04, KNOW-05, KNOW-06 are the only requirements mapped to Phase 26.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/api/src/services/knowledge-aggregator.ts` | 344 | `resolveFindings(sqlite, target.slug, [])` — empty exclusion list clears all findings including `convention_violation` | Warning | Convention_violation findings are cleared and re-upserted on every content-change scan. Plan explicitly required both resolveFindings calls to exclude `convention_violation`. This is not a false positive: it's a real behavioral difference from what the plan specified, and the corresponding test only covers the content-unchanged path. |

### Human Verification Required

### 1. Zero False Positive Guarantee

**Test:** Trigger a full knowledge scan cycle against all registered projects that have CLAUDE.md files on disk (mission-control, nexusclaw, openefb, streamline, taxnav, cocobanana, etc.)
**Expected:** No `convention_violation` findings should appear for projects where the violations are not real (e.g., the `has-overview-section` rule should not fire on projects with `## Architecture` sections; `no-deprecated-models` should not fire on projects that only reference deprecated models in their "deprecated" tables)
**Why human:** Requires running the actual knowledge scanner against real CLAUDE.md files on disk and inspecting the health findings in the risk feed. The scanner reads from git HEAD via subprocess — cannot be verified with static analysis.

### Gaps Summary

One behavioral gap was found: the content-changed path in `scanAllKnowledge` (line 344) calls `resolveFindings(sqlite, target.slug, [])` with an empty exclusion list, which resolves all active findings including `convention_violation` before the convention pass re-upserts them. The plan (Task 2, Step 2) explicitly required BOTH `resolveFindings` calls in the existing loop to be updated from `[]` to `["convention_violation"]`. Only the content-unchanged branch at line 312 was corrected; the content-changed branch at line 344 was missed.

The practical impact is that on content-change scans, `convention_violation` findings are momentarily cleared and then re-created in the same scan operation. The finding will still be visible after the scan completes, but the resolution timestamp is incorrectly set and cleared within the same run. This undermines the tracking integrity of when violations first appeared versus when they were resolved.

The fix is a one-line change: line 344 `resolveFindings(sqlite, target.slug, [])` should become `resolveFindings(sqlite, target.slug, ["convention_violation"])`.

---

_Verified: 2026-03-21T18:30:00Z_
_Verifier: Claude (gsd-verifier)_
