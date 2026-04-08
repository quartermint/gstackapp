---
phase: 13-multi-provider-routing-expansion
plan: 04
subsystem: harness-routing
tags: [classifier, routing, capability-matrix, gap-closure]
dependency_graph:
  requires: [13-03]
  provides: [classifyTask-production-caller, classification-metadata-in-routing]
  affects: [packages/harness/src/registry.ts]
tech_stack:
  added: []
  patterns: [classification-based-routing, capability-matrix-consultation]
key_files:
  created: []
  modified:
    - packages/harness/src/registry.ts
    - packages/harness/src/__tests__/registry.test.ts
    - packages/harness/src/types.ts
    - packages/harness/src/router/task-classifier.ts
    - packages/harness/src/router/capability-matrix.ts
decisions:
  - "ResolveModelOptions interface extends existing options with classificationInput"
  - "Classification runs only when classificationInput provided AND no explicit taskType"
  - "RecommendedModel from capability matrix takes priority over profile lookup"
metrics:
  duration: 2min
  completed: 2026-04-08
  tasks_completed: 1
  tasks_total: 1
  tests_added: 5
  tests_total: 182
---

# Phase 13 Plan 04: Wire TaskClassifier into resolveModel Summary

Wired the orphaned classifyTask into resolveModel routing path so task classification actually runs during model selection, and the capability matrix is consulted for recommendations.

## What Was Done

### Task 1: Wire classifyTask into resolveModel (TDD)

**RED:** Added 5 failing tests verifying classifyTask integration:
- classifyTask called when classificationInput provided
- recommendedModel from capability matrix used for routing
- Explicit taskType bypasses classifier (existing behavior preserved)
- No classification inputs yields default behavior (unchanged)
- Classification metadata (tier, reason, confidence) returned in result

**GREEN:** Extended resolveModel with 4-priority routing:
1. Environment variable override (highest, unchanged)
2. Classification-based routing via classifyTask (NEW)
3. Explicit taskType string lookup (existing)
4. Stage-based profile default (existing)

Added `ResolveModelOptions` and `ResolveModelResult` interfaces for type-safe classification input/output. The `classification` field on the result is optional and only populated when classifyTask runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Copied 13-03 artifacts into worktree**
- **Found during:** Setup
- **Issue:** task-classifier.ts, capability-matrix.ts, and updated types.ts from 13-03 were not present in this worktree (based on older commit)
- **Fix:** Copied files from main repo where 13-03 had already merged
- **Files:** task-classifier.ts, capability-matrix.ts, types.ts

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| 3ab218d | test | Add failing tests for classifyTask integration in resolveModel |
| b059a79 | feat | Wire classifyTask into resolveModel routing path |

## Verification

- 182/182 harness tests passing (5 new + 177 existing)
- classifyTask has production caller in registry.ts (outside test files)
- Capability matrix getRecommendedModel consulted via classifyTask during routing
- All existing resolveModel behavior preserved (env override, stage-based, profile lookup)

## Self-Check: PASSED
