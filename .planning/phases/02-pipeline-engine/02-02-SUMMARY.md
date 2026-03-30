---
phase: 02-pipeline-engine
plan: 02
subsystem: pipeline-prompts
tags: [ai-prompts, claude-api, code-review, prompt-engineering]
dependency_graph:
  requires: [shared-schemas]
  provides: [stage-prompts]
  affects: [stage-runner, pipeline-orchestrator]
tech_stack:
  added: []
  patterns: [prompt-caching-optimization, structured-json-output, verdict-schema]
key_files:
  created:
    - packages/api/src/pipeline/prompts/ceo.md
    - packages/api/src/pipeline/prompts/eng.md
    - packages/api/src/pipeline/prompts/design.md
    - packages/api/src/pipeline/prompts/qa.md
    - packages/api/src/pipeline/prompts/security.md
    - packages/api/src/__tests__/prompts.test.ts
  modified: []
decisions:
  - Prompt word counts sized for prompt caching minimums (Opus 4096+ tokens = 1500+ words, Sonnet 2048+ tokens = 1000+ words)
  - CEO prompt implements Garry Tan gstack philosophy (challenges premise, not implementation)
  - Structured JSON output via system instructions, not prefill (Claude 4.6 prefill restriction)
  - Per-stage category values for domain-specific finding classification
metrics:
  duration: 18min
  completed: "2026-03-30T23:18:46Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 0
  test_count: 20
  test_pass: 20
---

# Phase 02 Plan 02: Stage Prompt Files Summary

Five dedicated AI reviewer prompt files for the cognitive review pipeline, each with structured JSON response format matching FindingSchema/VerdictSchema.

## What Was Built

Five markdown prompt files under `packages/api/src/pipeline/prompts/` that define the identity, focus areas, tool usage instructions, and structured output format for each AI review stage:

| Stage | File | Model | Words | Focus |
|-------|------|-------|-------|-------|
| CEO | ceo.md | Opus 4.6 | 1,746 | Strategic product review -- challenges premise of changes |
| Eng | eng.md | Sonnet 4.6 | 1,487 | Code quality, architecture, performance, maintainability |
| Design | design.md | Sonnet 4.6 | 1,716 | UI/UX, accessibility, design system adherence |
| QA | qa.md | Sonnet 4.6 | 1,922 | Test coverage, edge cases, error handling, reliability |
| Security | security.md | Opus 4.6 | 1,928 | Vulnerability detection, injection, auth bypass, data exposure |

Total: 8,799 words across 5 prompts.

Each prompt includes:
- Role definition and persona
- Detailed review criteria with examples
- Tool usage instructions (read_file, list_files, search_code)
- Stage-specific category values for finding classification
- Severity guidelines (critical/notable/minor)
- Verdict rules (PASS/FLAG/BLOCK -- never SKIP)
- Structured JSON response format matching FindingSchema

## Key Decisions

1. **Prompt sizing for caching**: All prompts exceed their model's prompt caching minimum (Opus stages 1500+ words for 4096+ token threshold, Sonnet stages 1000+ words for 2048+ token threshold). This ensures prompt caching delivers 90% cost reduction on cache hits.

2. **CEO as premise challenger**: The CEO prompt implements the Garry Tan gstack philosophy -- it challenges WHY a change exists rather than HOW it is implemented. Categories include "premise", "abstraction", "direction", "complexity", "dependency", "scope".

3. **Per-stage category taxonomies**: Each prompt defines domain-specific category values rather than sharing a generic set. This enables precise filtering and aggregation in the dashboard.

4. **Design system color reference**: The Design prompt includes stage identity colors and verdict colors from DESIGN.md for consistent pipeline UI review.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4ded612 | CEO, Eng, Security prompt files |
| 2 | 397f567 | Design, QA prompts and test suite |

## Test Results

20 tests passing across 5 stages (4 tests per stage):
- exists and is readable
- contains JSON format instructions with verdict and findings
- contains verdict definitions (PASS, FLAG, BLOCK)
- is substantial enough for prompt caching (word count check)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all prompt files are complete and substantive.

## Self-Check: PASSED

- All 7 files verified present on disk
- Both commit hashes (4ded612, 397f567) verified in git log
