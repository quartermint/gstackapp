---
phase: 13-multi-provider-routing-expansion
plan: 03
subsystem: harness-routing
tags: [task-classifier, capability-matrix, eval-suite, routing]
dependency_graph:
  requires: [13-01]
  provides: [task-classifier, capability-matrix, eval-suite]
  affects: [harness-registry, model-router]
tech_stack:
  added: []
  patterns: [deterministic-classification, heuristic-scoring, keyword-rubric-scoring]
key_files:
  created:
    - packages/harness/src/router/task-classifier.ts
    - packages/harness/src/router/capability-matrix.ts
    - packages/harness/src/eval/runner.ts
    - packages/harness/src/eval/prompts.ts
    - packages/harness/src/eval/scorer.ts
    - packages/harness/src/__tests__/task-classifier.test.ts
    - packages/harness/src/__tests__/eval-runner.test.ts
  modified:
    - packages/harness/src/types.ts
    - packages/harness/src/registry.ts
    - packages/harness/src/router/model-router.ts
    - packages/harness/src/__tests__/model-router.test.ts
decisions:
  - "Deterministic classification only (no LLM classifier per D-11)"
  - "Three-layer classifier: manifest tier > sandbox detection > heuristic scoring"
  - "Capability matrix as JSON file on disk, consulted by classifier for recommendations"
  - "Heuristic scorer uses keyword matching against rubric (40% threshold)"
  - "Eval runner builds matrix entries by grouping scores by taskType + model"
metrics:
  duration: "4m 48s"
  completed: "2026-04-08T12:38:15Z"
  tasks_completed: 2
  tasks_total: 2
  test_count: 213
  files_created: 7
  files_modified: 4
---

# Phase 13 Plan 03: Task-Aware Routing + Eval Suite Summary

Deterministic TaskClassifier with 3-layer routing (manifest tiers, sandbox detection, heuristic scoring), capability matrix for model quality lookup, and eval suite scaffold with 8 prompts across 4 task types for empirical boundary discovery.

## Task Completion

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | TaskClassifier with skill manifest tiers and deterministic heuristics | 086021a | task-classifier.ts, capability-matrix.ts, types.ts |
| 2 | Integrate task classifier into router + create eval suite scaffold | ababda4 | registry.ts, model-router.ts, eval/runner.ts, eval/prompts.ts, eval/scorer.ts |

## What Was Built

### TaskClassifier (task-classifier.ts)
- **Layer 1:** Skill manifest declares tier (confidence 1.0) -- highest priority
- **Layer 2:** Sandbox detection (isMultiFileEdit -> Codex sandbox, confidence 0.8)
- **Layer 3:** Heuristic complexity scoring with weighted factors: message length (0.2), tool count (0.3), conversation depth (0.2), code review flag (0.3)
- Thresholds: FRONTIER >= 0.6, LOCAL <= 0.3, ambiguous range defaults to frontier (conservative)
- No LLM calls -- pure computation per D-11

### Capability Matrix (capability-matrix.ts)
- JSON file-based storage for model quality scores per task type
- `loadMatrix` / `saveMatrix` for persistence
- `getRecommendedModel` returns highest-quality recommended model for a task type

### Eval Suite (eval/)
- **prompts.ts:** 8 prompts across scaffolding, review, debugging, ideation (2 each)
- **scorer.ts:** Heuristic keyword-based rubric scoring, pairwise comparison
- **runner.ts:** Executes prompts against providers, produces scored results and matrix entries

### Router Integration
- `resolveModel` now accepts `options?: { taskType?: string }` for task-type-aware routing
- Priority: env override > taskType profile entry > stage profile entry > default
- All 4 route_decision log calls include `taskType` field for observability

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

All 213 tests pass across 19 test files. Task-classifier tests (11 cases) and eval-runner tests (7 cases) all green.

## Self-Check: PASSED

- All 7 created files exist on disk
- Both commits (086021a, ababda4) found in git log
