---
phase: 19-gbrain-integration
plan: 02
subsystem: gbrain
tags: [clarification, degradation, knowledge-injection, sse]
dependency_graph:
  requires: [GbrainClient, gbrainCache-table, getGbrainCache]
  provides: [knowledge-enhanced-clarification, gbrain-degradation-events, spawner-knowledgeContext]
  affects: [operator-routes, clarifier, spawner]
tech_stack:
  added: []
  patterns: [optional-parameter-injection, graceful-degradation-sse, audit-trail-tracking]
key_files:
  created:
    - packages/api/src/__tests__/gbrain-clarification.test.ts
    - packages/api/src/__tests__/gbrain-degradation.test.ts
  modified:
    - packages/api/src/pipeline/clarifier.ts
    - packages/api/src/pipeline/spawner.ts
    - packages/api/src/routes/operator.ts
decisions:
  - "Knowledge block appended to system prompt (not prepended) to keep base instructions intact"
  - "buildKnowledgeBlock as pure function for testability and separation of concerns"
  - "Degradation event only fires on explicit available=false, not on null cache (prefetch not complete)"
  - "knowledgeContext written as null (not omitted) in request.json for explicit presence"
metrics:
  duration: 3min
  completed: 2026-04-12
  tasks_completed: 2
  tasks_total: 2
  tests_added: 12
  files_created: 2
  files_modified: 3
---

# Phase 19 Plan 02: Clarification Knowledge Injection and Graceful Degradation Summary

Gbrain entities injected into clarification system prompts via optional parameter, with SSE degradation events and subprocess knowledgeContext in request.json.

## What Was Built

### Task 1: Knowledge-enhanced clarification with gbrain context injection (69d6852)
- **clarifier.ts**: Added `buildKnowledgeBlock()` pure function and optional `gbrainContext` parameter to `generateClarificationQuestion()`. When gbrain entities are available, appends knowledge block to system prompt listing entity titles, types, and excerpts. Backward compatible -- no change when parameter is omitted.
- **operator.ts**: Three handlers updated (POST /request, POST /:requestId/clarify-answer, POST /:requestId/reject-brief) to load gbrain cache via `getGbrainCache()` and pass to clarification. Audit trail records `gbrain_context_used` with entity slugs and search result count when knowledge enhances clarification.
- **6 tests**: Knowledge block injection, backward compatibility, available=false guard, empty entities guard, multiple entities, missing entities field.

### Task 2: Graceful degradation SSE events and spawner knowledgeContext (87e8338)
- **spawner.ts**: Added `knowledgeContext?: GbrainCacheData` to `PipelineSpawnOptions`. Writes `knowledgeContext` field to request.json (null when not provided) for subprocess consumption.
- **operator.ts**: POST /:requestId/approve-brief loads gbrain cache, emits `operator:gbrain:degraded` SSE event with "Running without knowledge context" message when `available=false`, records `gbrain_unavailable` in audit trail. Passes knowledge context to `spawnPipeline()` only when available.
- **6 tests**: Spawner knowledgeContext write/backward-compat/resilience, degradation event emission/suppression for available=true/null cache.

## Deviations from Plan

None -- plan executed exactly as written.

## Threat Mitigations Applied

| Threat ID | Mitigation |
|-----------|------------|
| T-19-06 | Entity excerpts appended as context data block in system prompt, not as executable instructions. buildKnowledgeBlock is a pure function with clear boundaries. |
| T-19-07 | Accepted: knowledgeContext in request.json follows existing request.json security model (tmpdir, restricted permissions) |
| T-19-08 | Accepted: Single getGbrainCache() DB query per clarification call, negligible performance impact |

## Verification

- 12 new tests passing across 2 test files
- 22 total tests passing (including existing operator-clarify and pipeline-spawner)
- All acceptance criteria verified via grep checks
- No regressions in existing test suites

## Self-Check: PASSED

All 5 files verified on disk. Both commits (69d6852, 87e8338) verified in git log.
