---
phase: 08-harness-package-extraction
plan: 01
subsystem: api
tags: [npm-workspace, llm-providers, anthropic, gemini, openai, cli]

# Dependency graph
requires:
  - phase: 07-seam-cleanup
    provides: Clean provider types decoupled from Anthropic SDK internals
provides:
  - "@gstackapp/harness npm workspace with all provider logic"
  - "CLI entry point for provider status and testing"
  - "HarnessConfig decoupled from api config (no Zod, no GitHub)"
  - "resolveModel(stage: string) decoupled from @gstackapp/shared Stage type"
affects: [08-02-api-rewiring, 09-failover-router, 10-tool-name-adapters]

# Tech tracking
tech-stack:
  added: ["@gstackapp/harness workspace"]
  patterns: ["Harness-only config without Zod validation", "String-based stage parameter for provider decoupling"]

key-files:
  created:
    - packages/harness/package.json
    - packages/harness/tsconfig.json
    - packages/harness/vitest.config.ts
    - packages/harness/src/types.ts
    - packages/harness/src/anthropic.ts
    - packages/harness/src/gemini.ts
    - packages/harness/src/openai.ts
    - packages/harness/src/registry.ts
    - packages/harness/src/config.ts
    - packages/harness/src/cli.ts
    - packages/harness/src/index.ts
    - packages/harness/src/providers-entry.ts
    - packages/harness/bin/harness
  modified:
    - tsconfig.json

key-decisions:
  - "Used `as any` cast for Gemini parameters type mismatch (acceptable, matches api pattern)"
  - "Added type guard `tc.type !== 'function'` for OpenAI tool_calls to satisfy newer SDK types"
  - "loadHarnessConfig() called inside resolveModel and initProviders (not cached singleton like api config)"

patterns-established:
  - "Harness config pattern: dotenv + plain object, no Zod, no workspace deps"
  - "CLI pattern: process.argv parsing with --help/providers/test commands"

requirements-completed: [PKG-01, PKG-02, PKG-03, PKG-04]

# Metrics
duration: 4min
completed: 2026-04-03
---

# Phase 08 Plan 01: Harness Package Extraction Summary

**@gstackapp/harness npm workspace with 3 LLM providers, model profiles, CLI, and 35 passing tests**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-03T18:53:39Z
- **Completed:** 2026-04-03T18:57:52Z
- **Tasks:** 2
- **Files modified:** 19

## Accomplishments
- Created packages/harness/ as self-contained npm workspace with zero workspace:* dependencies
- Moved all provider code (types, Anthropic, Gemini, OpenAI, registry, profiles) from api to harness
- Added harness-only config.ts with no Zod, no GitHub, no Voyage -- just provider env vars
- Decoupled resolveModel from @gstackapp/shared Stage type to accept plain strings
- Created CLI with --help, providers, and test commands
- All 35 tests pass (7 anthropic, 7 gemini, 7 openai, 12 registry, 2 CLI)
- npm pack --dry-run validates publishability (9.2kB tarball)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create harness package scaffold** - `d69b9ed` (feat)
2. **Task 2: Move provider tests and CLI smoke test** - `029d3ed` (test)

## Files Created/Modified
- `packages/harness/package.json` - @gstackapp/harness manifest with publishConfig
- `packages/harness/tsconfig.json` - TypeScript config extending root, no workspace refs
- `packages/harness/vitest.config.ts` - Test configuration
- `packages/harness/src/types.ts` - LLMProvider, CompletionParams, CompletionResult etc.
- `packages/harness/src/anthropic.ts` - Anthropic provider adapter
- `packages/harness/src/gemini.ts` - Gemini provider adapter with rawPart preservation
- `packages/harness/src/openai.ts` - OpenAI/local provider adapter
- `packages/harness/src/registry.ts` - Provider registry, PROFILES, resolveModel(string)
- `packages/harness/src/config.ts` - Lightweight harness-only config
- `packages/harness/src/cli.ts` - CLI entry point
- `packages/harness/src/index.ts` - Public API re-exports
- `packages/harness/src/providers-entry.ts` - Direct provider class exports
- `packages/harness/bin/harness` - Executable CLI entry
- `packages/harness/src/__tests__/*.test.ts` - 5 test files (35 tests)
- `tsconfig.json` - Added harness to root references

## Decisions Made
- Used `as any` cast for Gemini `parameters` type mismatch -- matches existing api pattern, the Gemini SDK types are overly strict for JSON Schema objects
- Added `tc.type !== 'function'` guard in OpenAI provider -- newer OpenAI SDK v6 added `ChatCompletionMessageCustomToolCall` type that lacks `.function`, guard ensures only function tool calls are processed
- loadHarnessConfig() is called fresh each time in resolveModel/initProviders rather than cached as a module-level singleton -- this makes testing easier and avoids stale config issues

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Gemini parameters TypeScript error**
- **Found during:** Task 1 (package scaffold)
- **Issue:** `Record<string, unknown>` not assignable to `FunctionDeclarationSchema` in Gemini SDK types
- **Fix:** Added `as any` cast on parameters field (same pattern used in api)
- **Files modified:** packages/harness/src/gemini.ts
- **Verification:** TypeScript compilation succeeds

**2. [Rule 1 - Bug] Fixed OpenAI tool_calls TypeScript error**
- **Found during:** Task 1 (package scaffold)
- **Issue:** OpenAI SDK v6 `ChatCompletionMessageToolCall` union includes `CustomToolCall` type without `.function` property
- **Fix:** Added `if (tc.type !== 'function') continue` type guard before accessing `.function`
- **Files modified:** packages/harness/src/openai.ts
- **Verification:** TypeScript compilation succeeds

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all code is fully wired and functional.

## Next Phase Readiness
- harness package ready for Plan 02 (api rewiring to import from @gstackapp/harness)
- All provider tests pass in harness workspace, ready to be removed from api in Plan 02
- npm pack validates the package is publishable

---
*Phase: 08-harness-package-extraction*
*Completed: 2026-04-03*
