# Phase 10: Tool Adapters & Skills - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Cross-harness tool portability via adapter interface, and a SkillManifest registry that discovers, loads, and runs portable skills on any LLMProvider. Lives in the harness package.

</domain>

<decisions>
## Implementation Decisions

### Tool Adapter Interface (ADPT-01)
- **D-01:** Adapter is a static mapping object, not dynamic discovery. Each harness has a known, finite set of tools — a lookup table of `{ canonicalName → harnessSpecificName, schemaTransform }` is simpler and more predictable than runtime discovery
- **D-02:** Canonical tool names follow Claude Code conventions (Read, Write, Edit, Bash, Grep, Glob) since that's the primary harness. Adapters for OpenCode/Codex map these to their equivalents
- **D-03:** Adapter interface: `ToolAdapter { name: string; mapToolName(canonical: string): string; mapToolSchema(canonical: ToolDefinition): ToolDefinition; mapToolResult(result: string): string }`
- **D-04:** Three built-in adapters shipped: `claude-code`, `opencode`, `codex`. Community adapters can be added via the skill registry

### SkillManifest Schema (ADPT-02)
- **D-05:** Minimum viable SkillManifest fields (all required): `id` (unique string), `name` (display name), `version` (semver), `tools` (array of canonical tool names the skill needs), `prompt` (the skill's system prompt or path to prompt file), `outputSchema` (Zod-compatible JSON Schema for structured output)
- **D-06:** Optional fields: `minimumModel` (capability tier: 'opus' | 'sonnet' | 'haiku'), `capabilities` (array of required provider capabilities like 'tool_use', 'vision', 'long_context'), `description`, `author`, `license`
- **D-07:** File format: `.skill.json` — plain JSON, validated against the Zod schema at load time

### Skill Registry (ADPT-03, ADPT-04)
- **D-08:** Local discovery: scan a configured directory (default: `~/.gstackapp/skills/`) for `*.skill.json` files. Recursive scan, one manifest per file
- **D-09:** Remote URL loading: fetch `.skill.json` from HTTPS URLs only. No signature verification in v1.1 — user explicitly adds URLs to a config allowlist (`SKILL_REMOTE_URLS` as comma-separated env var). This is single-user software, not a package manager
- **D-10:** Registry is an in-memory Map populated at startup. No hot-reload in v1.1 — restart to pick up new skills

### Skill Runner (ADPT-05)
- **D-11:** Runner takes a SkillManifest + LLMProvider + ToolAdapter, runs the skill's prompt through a tool_use loop (same pattern as stage-runner.ts), and returns the structured output validated against the manifest's outputSchema
- **D-12:** Tool calls during skill execution are translated through the adapter before dispatch, and results are translated back. The skill author writes against canonical tool names, never provider-specific ones
- **D-13:** If a skill requires tools the target adapter doesn't support, the runner throws at load time (fail-fast), not mid-execution

### Claude's Discretion
- Internal organization of adapter implementations (separate files vs single file with all adapters)
- Whether SkillManifest Zod schema lives in shared package or harness package
- Test strategy for adapter mapping (unit tests with fixture manifests)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Harness Package (from Phase 8)
- `packages/harness/src/providers/types.ts` — ToolDefinition interface that adapters transform
- `packages/harness/src/providers/index.ts` — LLMProvider that skills run on

### Existing Patterns
- `packages/api/src/pipeline/stage-runner.ts` — The tool_use loop pattern that skill runner replicates
- `packages/api/src/pipeline/tools.ts` — Tool definition pattern (sandbox tools as reference)
- `packages/api/src/pipeline/prompts/` — Prompt file pattern (skills follow similar structure)

### Requirements
- `.planning/REQUIREMENTS.md` §Tool Adapters & Skills — ADPT-01 through ADPT-05

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `stage-runner.ts` tool_use loop is the exact pattern the skill runner needs — possible refactoring target to share the core loop between stage-runner and skill-runner
- `ToolDefinition` interface is already provider-agnostic — adapters map between these and harness-specific formats

### Established Patterns
- Zod schema validation used throughout for runtime type checking — SkillManifest schema follows this pattern
- Provider adapter pattern (anthropic.ts, gemini.ts, openai.ts) is analogous to tool adapters

### Integration Points
- Skill runner needs access to `LLMProvider.createCompletion()` — same interface as stage-runner
- Registry needs access to filesystem (local discovery) and fetch (remote URLs)
- Adapter mapping needs to be available to the router (Phase 9) so skills can specify provider preferences

</code_context>

<specifics>
## Specific Ideas

- The skill runner should be usable standalone — `npx @gstackapp/harness run-skill ./my-skill.skill.json` as a CLI command
- Tool adapters are intentionally simple in v1.1 — just name mapping and schema transforms. Complex behavioral adapters (e.g., multi-tool composition) are v2

</specifics>

<deferred>
## Deferred Ideas

- Skill marketplace / community registry — future milestone
- Skill versioning and dependency resolution — v2
- Skill chaining (output of one skill feeds input of another) — v2
- Interactive skill development mode with hot-reload — v2
- Behavioral adapters that compose multiple target tools from one canonical tool — v2

</deferred>

---

*Phase: 10-tool-adapters-skills*
*Context gathered: 2026-04-03*
