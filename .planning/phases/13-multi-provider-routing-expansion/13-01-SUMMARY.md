---
phase: 13-multi-provider-routing-expansion
plan: 01
subsystem: harness-providers
tags: [codex, provider, routing, gemma, multi-provider]
dependency_graph:
  requires: []
  provides: [CodexProvider, codex-routing, gemma-routing, task-type-profiles]
  affects: [packages/harness]
tech_stack:
  added: ["@openai/codex-sdk"]
  patterns: [lazy-sdk-init, dual-mode-provider, named-export-import]
key_files:
  created:
    - packages/harness/src/providers/codex.ts
    - packages/harness/src/__tests__/codex-provider.test.ts
  modified:
    - packages/harness/src/types.ts
    - packages/harness/src/registry.ts
    - packages/harness/src/router/model-router.ts
    - packages/harness/src/router/config.ts
    - packages/harness/src/providers-entry.ts
    - packages/harness/src/__tests__/model-router.test.ts
    - packages/harness/src/__tests__/router-infra.test.ts
    - packages/harness/package.json
decisions:
  - Lazy-init Codex SDK to avoid import failures when only API mode is needed
  - Named import { Codex } from @openai/codex-sdk (not default export)
  - Export inferProviderFromModel for direct testing
metrics:
  duration: 259s
  completed: "2026-04-08T12:29:41Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 16
  tests_total: 193
  files_changed: 10
---

# Phase 13 Plan 01: Codex Provider + Model Routing Expansion Summary

Dual-mode CodexProvider (OpenAI API for GPT-5.x conversation + @openai/codex-sdk for sandboxed CLI tasks) with extended model inference routing codex/gemma models and task-type profile entries.

## Completed Tasks

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create CodexProvider with dual-mode (API + CLI subprocess) | e759e23 | providers/codex.ts, types.ts, codex-provider.test.ts |
| 2 | Extend registry, router config, and model inference | fbdfd08 | registry.ts, model-router.ts, config.ts, providers-entry.ts |

## What Was Built

### CodexProvider (packages/harness/src/providers/codex.ts)
- Implements `LLMProvider` interface for API mode (GPT-5.4, GPT-5.2)
- `runSandbox()` method for @openai/codex-sdk CLI subprocess tasks with timeout
- `isCodexAvailable()` health check for codex CLI binary on PATH
- Lazy Codex SDK initialization (only when sandbox mode is used)
- Full message normalization (tool_calls, content blocks, usage)

### Extended Model Inference (model-router.ts)
- `codex` check before `gpt-*` so `gpt-5.3-codex` routes to codex provider
- `gemma-*` models route to `local` provider (Gemma 4 26B-A4B)
- `inferProviderFromModel` now exported for direct testing

### Registry + Profiles (registry.ts)
- CodexProvider auto-initialized when OPENAI_API_KEY is present
- PROFILES.balanced extended with task-type entries: ideation, scaffolding, review, debugging, refactor
- PROFILES.local updated to qwen3.5-35b-a3b

### Router Config (router/config.ts)
- Default providerChain: anthropic, openai, codex, gemini, local
- ROUTER_BILLING_CAP_CODEX env var support

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed @openai/codex-sdk import pattern**
- **Found during:** Task 2 (integration test failures)
- **Issue:** Plan specified `import Codex from '@openai/codex-sdk'` (default export) but SDK exports `{ Codex }` as named export
- **Fix:** Changed to `import { Codex } from '@openai/codex-sdk'` and updated test mock accordingly
- **Files modified:** providers/codex.ts, codex-provider.test.ts

**2. [Rule 1 - Bug] Lazy Codex SDK initialization**
- **Found during:** Task 2 (router-integration tests failed on CodexProvider construction)
- **Issue:** Constructing Codex SDK eagerly in constructor caused failures in tests that load the real registry without mocking @openai/codex-sdk
- **Fix:** Lazy-init pattern: SDK constructed on first `runSandbox()` call, not in constructor
- **Files modified:** providers/codex.ts

**3. [Rule 1 - Bug] Updated router-infra test for new default providerChain**
- **Found during:** Task 2 (existing test expected old 3-provider chain)
- **Issue:** Test asserted `['anthropic', 'gemini', 'openai']` but default chain is now 5 providers
- **Fix:** Updated assertion to match new default: `['anthropic', 'openai', 'codex', 'gemini', 'local']`
- **Files modified:** router-infra.test.ts

## Decisions Made

1. **Lazy Codex SDK init** - SDK is only needed for sandbox mode. Eager init breaks test environments that don't mock the SDK. Lazy init means API mode (the common path) works everywhere.
2. **Export inferProviderFromModel** - Made public for direct unit testing rather than testing through integration. Cleaner test isolation.
3. **Named import pattern** - @openai/codex-sdk uses named exports (`{ Codex }`), not default. Discovered empirically.

## Threat Mitigations Verified

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-13-01 | API key via SDK constructor, not CLI args | Implemented |
| T-13-02 | Sandbox uses workspace-write mode (skipGitRepoCheck: true) | Implemented |
| T-13-03 | AbortController timeout on thread.run() (default 120s) | Implemented + tested |

## Self-Check: PASSED

All files exist. All commits found. 193 tests passing.
