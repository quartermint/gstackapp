# Phase 8: Harness Package Extraction - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Extract the provider abstraction, model profiles, and CLI into `packages/harness/` as an independently publishable npm package. gstackapp api imports from `@gstackapp/harness` with zero provider duplication.

</domain>

<decisions>
## Implementation Decisions

### Extraction Boundary
- **D-01:** What moves to harness: `providers/` directory (types.ts, anthropic.ts, gemini.ts, openai.ts, index.ts), model profiles (`PROFILES` constant and `resolveModel()`), and the new CLI entry point
- **D-02:** What stays in api: `tools.ts` (sandbox file tools), `sandbox.ts` (path validation), `stage-runner.ts` (tool_use loop orchestration), `orchestrator.ts` (pipeline orchestration), `prompts/` (stage prompt files). These are gstackapp-specific, not portable
- **D-03:** `ToolDefinition`, `LLMProvider`, `CompletionParams`, `CompletionResult`, `ContentBlock`, `ConversationMessage`, `ToolResultBlock` — all types move to harness and are re-exported from the package root

### Package Structure
- **D-04:** Package name: `@gstackapp/harness` with `"public": true` in package.json
- **D-05:** Exports map uses subpath exports:
  - `.` → main entry (LLMProvider, types, getProvider, resolveModel, profiles)
  - `./providers` → individual provider classes for direct import
  - `./cli` → CLI entry point
- **D-06:** Workspace dependency: api package uses `"@gstackapp/harness": "workspace:*"` — npm workspaces handles resolution in monorepo, `npm pack` produces a standalone tarball

### CLI Entry Point
- **D-07:** `bin/harness` CLI scope for v1.1 is minimal: `--help`, `providers` (list configured providers and their status), `test <provider>` (send a hello-world completion to verify API key works). Keep it useful for debugging, not a full platform
- **D-08:** CLI uses the same config resolution from Phase 7 (D-04/D-05) — finds .env, initializes providers, reports status
- **D-09:** CLI framework: no framework — just `process.argv` parsing. 3 commands doesn't justify a dependency

### Migration Strategy
- **D-10:** Move files, update imports, verify all existing tests pass. No API changes — just reorganization
- **D-11:** api package's import paths change from relative (`../pipeline/providers`) to package (`@gstackapp/harness`). Find-and-replace across all files

### Claude's Discretion
- Internal file organization within `packages/harness/src/` — flat vs nested is Claude's call
- tsconfig.json settings for the new package — match api package conventions
- Whether to add a `packages/harness/README.md` — only if it helps npm publish

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Files (extraction targets)
- `packages/api/src/pipeline/providers/types.ts` — Core type definitions moving to harness
- `packages/api/src/pipeline/providers/index.ts` — Provider registry, profiles, resolveModel moving to harness
- `packages/api/src/pipeline/providers/anthropic.ts` — Anthropic adapter moving to harness
- `packages/api/src/pipeline/providers/gemini.ts` — Gemini adapter moving to harness
- `packages/api/src/pipeline/providers/openai.ts` — OpenAI/local adapter moving to harness
- `packages/api/src/lib/config.ts` — Config that harness needs (post Phase 7 cleanup)

### Files That Stay (import paths change)
- `packages/api/src/pipeline/stage-runner.ts` — Imports LLMProvider, stays in api
- `packages/api/src/pipeline/orchestrator.ts` — Imports resolveModel, stays in api
- `packages/api/src/pipeline/tools.ts` — Sandbox tools, stays in api

### Test Files (need import updates)
- `packages/api/src/__tests__/providers/` — All provider tests move to harness
- `packages/api/src/__tests__/stage-runner.test.ts` — Stays in api, imports change
- `packages/api/src/__tests__/orchestrator.test.ts` — Stays in api, imports change

### Monorepo Config
- `package.json` (root) — Workspace config needs `packages/harness` added
- `tsconfig.json` (root) — May need project reference for harness

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Provider implementations are already cleanly separated with a shared interface — extraction is mostly file moves
- `PROFILES` and `resolveModel()` are self-contained in providers/index.ts

### Established Patterns
- npm workspaces already used for api/web/shared — harness follows the same pattern
- Shared package (`packages/shared/`) already demonstrates cross-package type sharing

### Integration Points
- `stage-runner.ts` calls `LLMProvider.createCompletion()` — import path changes from relative to `@gstackapp/harness`
- `orchestrator.ts` calls `resolveModel()` — same import path change
- Config is the trickiest integration: harness needs its own config for standalone, but api's config is a superset (includes GitHub, Voyage, etc.)

</code_context>

<specifics>
## Specific Ideas

- Harness config should be a subset of api config — only provider-related env vars (API keys, model profiles, local API URL). GitHub/Voyage/dashboard config stays in api
- The harness package should work with zero config if you just want to use it as a library (provider initialization is lazy via `getProvider()`)

</specifics>

<deferred>
## Deferred Ideas

- npm publish automation (CI/CD for package releases) — future phase
- Changelog generation for harness package — future phase
- Version strategy (independent vs lockstep with gstackapp) — decide at first publish

</deferred>

---

*Phase: 08-harness-package-extraction*
*Context gathered: 2026-04-03*
