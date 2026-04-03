# Phase 7: Seam Cleanup - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix Anthropic type leak in tools.ts and MONOREPO_ROOT coupling in config.ts so the provider-related code can be extracted cleanly in Phase 8. Pure refactoring — no new functionality.

</domain>

<decisions>
## Implementation Decisions

### SEAM-01: Tool Type Decontamination
- **D-01:** `createSandboxTools()` return type changes from `Anthropic.Tool[]` to `ToolDefinition[]` (already defined in `providers/types.ts:16`)
- **D-02:** The `input_schema` field names stay as-is since `ToolDefinition.inputSchema` already uses camelCase — the Anthropic adapter in `providers/anthropic.ts:23-26` already handles the translation to `input_schema`
- **D-03:** Remove `import type Anthropic from '@anthropic-ai/sdk'` from tools.ts entirely — the only Anthropic SDK import should be in `providers/anthropic.ts`

### SEAM-02: Config Path Decoupling
- **D-04:** Replace `MONOREPO_ROOT` with a `findProjectRoot()` function that walks up from `import.meta.dirname` looking for `package.json` with `name` matching the package — works in both monorepo and standalone contexts
- **D-05:** `.env` loading: try `findProjectRoot()` first, then fall back to `process.cwd()`. When running as a standalone package, `.env` lives next to the package root
- **D-06:** `databasePath` relative resolution uses `process.cwd()` as base (not package root) — this matches standard CLI behavior where paths are relative to where you run the command
- **D-07:** Config stays in `packages/api/src/lib/config.ts` for now — it moves to harness in Phase 8. This phase only removes the hardcoded path assumption

### Claude's Discretion
- Test updates to reflect new return types — mechanical changes, no design decisions needed
- Whether to add a `findProjectRoot()` utility or inline the logic — Claude picks based on reuse potential

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Seam Targets
- `packages/api/src/pipeline/tools.ts` — SEAM-01 target: `Anthropic.Tool[]` return type on line 16
- `packages/api/src/lib/config.ts` — SEAM-02 target: `MONOREPO_ROOT` on line 7, used lines 10 and 15
- `packages/api/src/pipeline/providers/types.ts` — Provider-agnostic `ToolDefinition` interface (the replacement type)
- `packages/api/src/pipeline/providers/anthropic.ts` — Anthropic adapter that already translates `ToolDefinition` → `Anthropic.Tool` (lines 23-26)

### Tests
- `packages/api/src/__tests__/providers/anthropic.test.ts` — Provider tests that mock `@anthropic-ai/sdk`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ToolDefinition` interface already exists in `providers/types.ts:16-20` — exact replacement for `Anthropic.Tool[]`
- `AnthropicProvider.createCompletion()` already maps `ToolDefinition` → `Anthropic.Tool` in the adapter layer

### Established Patterns
- Provider adapter pattern: each provider translates from the normalized interface to its SDK types
- Zod schema validation for config with `.transform()` for path resolution

### Integration Points
- `tools.ts` is imported by `stage-runner.ts` and `orchestrator.ts` — both need to work after the type change
- `config.ts` is imported across the api package — the `config` export shape must not change

</code_context>

<specifics>
## Specific Ideas

No specific requirements — straightforward refactoring guided by the existing provider abstraction pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-seam-cleanup*
*Context gathered: 2026-04-03*
