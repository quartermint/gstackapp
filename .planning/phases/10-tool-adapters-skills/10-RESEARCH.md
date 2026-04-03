# Phase 10: Tool Adapters & Skills - Research

**Researched:** 2026-04-03
**Domain:** Cross-harness tool portability, skill manifest schema, skill registry and runner
**Confidence:** HIGH

## Summary

Phase 10 builds a tool adapter layer and portable skill system on top of the existing `@gstackapp/harness` package. The three target harnesses (Claude Code, OpenCode, Codex) each expose a small, well-known set of tools with different names but overlapping semantics. The adapter is a static lookup table -- no dynamic discovery needed -- mapping canonical tool names (Claude Code conventions) to harness-specific equivalents.

The skill system follows patterns already established in the codebase: Zod schemas for validation, a tool_use loop (from stage-runner.ts), and JSON configuration files. The SkillManifest schema is straightforward Zod, the registry is an in-memory Map with filesystem scanning, and the runner is a generalization of the existing stage-runner loop with adapter translation injected at the tool call boundary.

**Primary recommendation:** Extract the tool_use loop from stage-runner.ts into a shared `runToolLoop()` utility in the harness package, then build skill-runner on top of it. This avoids duplicating the proven loop logic and keeps the pipeline and skill systems in sync.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Adapter is a static mapping object, not dynamic discovery
- D-02: Canonical tool names follow Claude Code conventions (Read, Write, Edit, Bash, Grep, Glob)
- D-03: Adapter interface: `ToolAdapter { name: string; mapToolName(canonical: string): string; mapToolSchema(canonical: ToolDefinition): ToolDefinition; mapToolResult(result: string): string }`
- D-04: Three built-in adapters: `claude-code`, `opencode`, `codex`
- D-05: Required SkillManifest fields: id, name, version, tools, prompt, outputSchema
- D-06: Optional fields: minimumModel, capabilities, description, author, license
- D-07: File format: `.skill.json`, validated by Zod at load time
- D-08: Local discovery: scan `~/.gstackapp/skills/` for `*.skill.json`, recursive
- D-09: Remote URL loading: HTTPS only, allowlist via `SKILL_REMOTE_URLS` env var, no signature verification
- D-10: Registry is in-memory Map, populated at startup, no hot-reload
- D-11: Runner takes SkillManifest + LLMProvider + ToolAdapter, runs tool_use loop, returns validated output
- D-12: Tool calls translated through adapter before dispatch, results translated back
- D-13: Missing tools = throw at load time (fail-fast)

### Claude's Discretion
- Internal organization of adapter implementations (separate files vs single file)
- Whether SkillManifest Zod schema lives in shared or harness package
- Test strategy for adapter mapping

### Deferred Ideas (OUT OF SCOPE)
- Skill marketplace / community registry
- Skill versioning and dependency resolution
- Skill chaining (output of one feeds another)
- Interactive skill development mode with hot-reload
- Behavioral adapters that compose multiple target tools from one canonical tool
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADPT-01 | Tool adapter interface normalizes tool names/schemas across harnesses | Tool name mapping tables for all 3 harnesses verified; ToolAdapter interface specified in D-03 |
| ADPT-02 | SkillManifest Zod schema defines portable skill format | Zod 3.25 already project-wide; schema fields locked in D-05/D-06; JSON Schema output supported |
| ADPT-03 | Skill registry loads manifests from local directories | fs.readdirSync + recursive glob pattern; default path `~/.gstackapp/skills/` from D-08 |
| ADPT-04 | Skill registry loads manifests from remote URLs | Native fetch (Node 22); HTTPS-only allowlist from D-09 |
| ADPT-05 | Skill runner executes any registered skill on any LLMProvider via tool_use loop | Existing stage-runner.ts tool_use loop is the exact pattern; adapter translation at call boundary |
</phase_requirements>

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25 | SkillManifest schema validation | Already used project-wide for all runtime validation |
| @gstackapp/harness | 0.1.0 | LLMProvider, ToolDefinition, CompletionParams | The foundation this phase builds on |
| vitest | ^3.1 | Unit testing | Already configured in harness package |

### Supporting (no new dependencies needed)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:fs | built-in | Local skill directory scanning | Registry local discovery (ADPT-03) |
| node:path | built-in | Path resolution for skill directories | Resolving `~/.gstackapp/skills/` |
| fetch | built-in (Node 22) | Remote URL skill loading | Registry remote loading (ADPT-04) |

### No New Dependencies

This phase requires **zero new npm packages**. Everything builds on existing infrastructure: Zod for schema validation, Node.js built-ins for filesystem/fetch, and the harness package for LLM interaction.

## Architecture Patterns

### Recommended File Structure

```
packages/harness/src/
├── adapters/
│   ├── types.ts              # ToolAdapter interface
│   ├── claude-code.ts        # Claude Code adapter (identity mapping)
│   ├── opencode.ts           # OpenCode adapter
│   ├── codex.ts              # Codex adapter
│   └── index.ts              # Barrel export + getAdapter(name)
├── skills/
│   ├── manifest.ts           # SkillManifest Zod schema
│   ├── registry.ts           # SkillRegistry class (Map + load)
│   ├── runner.ts             # SkillRunner (tool_use loop with adapter)
│   └── index.ts              # Barrel export
├── __tests__/
│   ├── adapters.test.ts      # Adapter mapping tests
│   ├── manifest.test.ts      # Schema validation tests
│   ├── registry.test.ts      # Registry load/discover tests
│   └── skill-runner.test.ts  # Runner integration tests
```

**Recommendation:** Separate files per adapter (not a single file). Each adapter is self-contained with its mapping table, making it easy for community contributors to add new adapters by copying an existing one.

**Recommendation:** SkillManifest schema lives in the harness package, not shared. Skills are a harness concern -- the api/web packages don't need to know about skill manifests. The shared package is for pipeline types (Stage, Finding, Verdict).

### Pattern 1: Tool Adapter as Static Mapping

**What:** Each adapter is a simple object implementing the ToolAdapter interface with a lookup table for tool name/schema translation.

**When to use:** All tool translation. The adapter is injected into the skill runner.

```typescript
// packages/harness/src/adapters/types.ts
import type { ToolDefinition } from '../types'

export interface ToolAdapter {
  /** Adapter identifier (e.g., 'claude-code', 'opencode', 'codex') */
  readonly name: string

  /** Map canonical tool name to harness-specific name */
  mapToolName(canonical: string): string

  /** Transform canonical tool schema to harness-specific schema */
  mapToolSchema(canonical: ToolDefinition): ToolDefinition

  /** Transform harness-specific result back to canonical format */
  mapToolResult(toolName: string, result: string): string
}
```

### Pattern 2: Tool Name Mapping Tables

**What:** Verified mapping of canonical (Claude Code) tool names to OpenCode and Codex equivalents.

**Claude Code canonical tools** (from this environment):
| Canonical | Description |
|-----------|-------------|
| Read | Read a file |
| Write | Write/create a file |
| Edit | Edit part of a file (diff-based) |
| Bash | Execute shell command |
| Grep | Search file contents |
| Glob | Find files by pattern |

**OpenCode tool mapping** (verified via opencode.ai/docs/tools/):
| Canonical (Claude Code) | OpenCode Equivalent | Schema Differences |
|-------------------------|--------------------|--------------------|
| Read | read | Parameter names likely differ (file_path vs path) |
| Write | write | Parameter names likely differ |
| Edit | edit | Edit format may differ (exact match replace vs diff) |
| Bash | bash | Likely compatible (command string) |
| Grep | grep | Likely compatible (pattern + path) |
| Glob | glob | Likely compatible (pattern) |

**Codex tool mapping** (verified via OpenAI docs + philschmid.de):
| Canonical (Claude Code) | Codex Equivalent | Schema Differences |
|-------------------------|------------------|--------------------|
| Read | shell (cat) | No dedicated read tool -- uses shell with cat/head |
| Write | apply_patch (new file) | Patch format for file creation |
| Edit | apply_patch | Patch format (unified diff style) |
| Bash | shell | `cmd` array format: `{"cmd": ["command", "args"]}` |
| Grep | shell (grep/rg) | No dedicated grep -- uses shell |
| Glob | shell (find/ls) | No dedicated glob -- uses shell |

**Key insight for Codex:** Codex has only 2 native tools (`shell` and `apply_patch`). The adapter must compose shell commands for Read/Grep/Glob operations, and use apply_patch format for Write/Edit. This is the most complex adapter but still static mapping -- it translates canonical tool calls into shell/apply_patch invocations.

### Pattern 3: Skill Runner as Generalized Tool Loop

**What:** The skill runner reuses the exact same tool_use loop pattern from stage-runner.ts (lines 202-258), but with adapter translation injected.

```typescript
// Pseudocode for the core loop
for (let i = 0; i < maxIterations; i++) {
  const result = await provider.createCompletion({
    model,
    system: skill.prompt,
    messages,
    tools: skill.tools.map(t => adapter.mapToolSchema(t)),  // <- adapter translates
    maxTokens,
    signal,
  })

  if (result.stopReason === 'end_turn') break

  if (result.stopReason === 'tool_use') {
    for (const toolBlock of toolUseBlocks) {
      const canonicalName = adapter.mapToolName(toolBlock.name) // <- reverse map
      const toolResult = await executeTool(canonicalName, toolBlock.input)
      const mappedResult = adapter.mapToolResult(canonicalName, toolResult)
      // ... push to messages
    }
  }
}
```

### Pattern 4: Fail-Fast Tool Validation

**What:** When loading a skill, validate that every tool in the manifest's `tools` array has a mapping in the target adapter. Throw immediately if not.

```typescript
function validateToolSupport(manifest: SkillManifest, adapter: ToolAdapter): void {
  for (const tool of manifest.tools) {
    try {
      adapter.mapToolName(tool)
    } catch {
      throw new Error(
        `Skill "${manifest.name}" requires tool "${tool}" but adapter ` +
        `"${adapter.name}" does not support it`
      )
    }
  }
}
```

### Anti-Patterns to Avoid

- **Dynamic tool discovery at runtime:** The CONTEXT.md explicitly locks this out (D-01). Each harness has a finite, known tool set. A static lookup table is simpler and more predictable.
- **Duplicating the tool_use loop:** stage-runner.ts already has the proven loop. Either extract it into a shared utility or at minimum follow the exact same structure. Do not reinvent message ordering (assistant message first, then user message with tool results -- this is critical).
- **Putting SkillManifest in shared package:** Skills are a harness concern. The api package doesn't need manifest types.
- **Complex adapter inheritance:** Each adapter should be a standalone implementation, not a class hierarchy. Three adapters is too few to justify inheritance.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON Schema validation | Custom validator | Zod `.parse()` + `.safeParse()` | Zod already handles all schema validation in this project |
| File system scanning | Custom recursive walker | `node:fs.readdirSync` with `{recursive: true, withFileTypes: true}` (Node 22) | Node 22 supports recursive option natively |
| HTTP fetching | Custom HTTP client | Global `fetch` (Node 22) | No axios/node-fetch needed, built-in is sufficient |
| Semver validation | Custom regex | Simple regex `^\d+\.\d+\.\d+` | Full semver lib is overkill for manifest version field |

## Common Pitfalls

### Pitfall 1: Message Ordering in Tool Loop
**What goes wrong:** Tool results sent before assistant response in conversation history.
**Why it happens:** The message protocol requires assistant message (with tool_use blocks) followed by user message (with tool_result blocks). Getting this wrong causes API errors or hallucinations.
**How to avoid:** Copy the exact pattern from stage-runner.ts lines 249-253: push assistant content first, then user tool results.
**Warning signs:** "Invalid message ordering" errors from provider APIs.

### Pitfall 2: Codex Adapter Complexity
**What goes wrong:** Codex only has 2 tools (shell + apply_patch), so mapping 6 canonical tools requires composing shell commands.
**Why it happens:** Codex's minimalist tool design means the adapter must generate shell command strings for Read/Grep/Glob.
**How to avoid:** The Codex adapter's `mapToolSchema` should transform Read into a shell tool call with `{"cmd": ["cat", filePath]}`. Test extensively with fixture data.
**Warning signs:** Shell injection vectors if file paths aren't sanitized in generated commands.

### Pitfall 3: Remote Manifest Security
**What goes wrong:** Fetched `.skill.json` contains malicious prompt content or unexpected fields.
**Why it happens:** Remote URLs are user-configured but could point to tampered content.
**How to avoid:** Zod validation strips unknown fields (`z.object().strict()` or `.strip()`). The prompt field is just a string -- it's the same trust model as AGENTS.md files. Single-user software (D-09) means the user controls the allowlist.
**Warning signs:** Unexpected fields passing through validation.

### Pitfall 4: Adapter Schema Mismatch
**What goes wrong:** Tool schemas translated for one harness don't match expected parameter names/types.
**Why it happens:** Each harness expects slightly different parameter schemas (e.g., `file_path` vs `path` vs `filename`).
**How to avoid:** Unit test every adapter mapping with fixture ToolDefinitions. Verify both directions (canonical-to-harness name, and harness-result-to-canonical result).
**Warning signs:** "Missing required parameter" errors from target harness.

### Pitfall 5: Registry Startup Blocking
**What goes wrong:** Registry scans `~/.gstackapp/skills/` synchronously at startup, blocking the event loop for directories with many files.
**Why it happens:** Using sync fs operations on startup.
**How to avoid:** Use `readdirSync` with `{recursive: true}` -- this is fine for startup. The directory is user-controlled and will have <100 files. The decision (D-10) says "populated at startup" which implies sync is acceptable.
**Warning signs:** Only if users dump thousands of non-skill files in the directory.

## Code Examples

### SkillManifest Zod Schema

```typescript
// packages/harness/src/skills/manifest.ts
import { z } from 'zod'

/** Capability tiers matching model profiles */
const ModelTierSchema = z.enum(['opus', 'sonnet', 'haiku'])

/** Provider capabilities a skill may require */
const CapabilitySchema = z.enum(['tool_use', 'vision', 'long_context'])

/** Canonical tool names (Claude Code conventions) */
const CanonicalToolSchema = z.enum(['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'])

export const SkillManifestSchema = z.object({
  // Required fields (D-05)
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver (e.g., 1.0.0)'),
  tools: z.array(CanonicalToolSchema).min(1),
  prompt: z.string().min(1),  // Inline prompt text or file path
  outputSchema: z.record(z.unknown()),  // JSON Schema object

  // Optional fields (D-06)
  minimumModel: ModelTierSchema.optional(),
  capabilities: z.array(CapabilitySchema).optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
})

export type SkillManifest = z.infer<typeof SkillManifestSchema>
```

### Claude Code Adapter (Identity Mapping)

```typescript
// packages/harness/src/adapters/claude-code.ts
import type { ToolAdapter } from './types'
import type { ToolDefinition } from '../types'

export const claudeCodeAdapter: ToolAdapter = {
  name: 'claude-code',

  mapToolName(canonical: string): string {
    // Claude Code IS the canonical -- identity mapping
    return canonical
  },

  mapToolSchema(canonical: ToolDefinition): ToolDefinition {
    return canonical  // No transformation needed
  },

  mapToolResult(_toolName: string, result: string): string {
    return result  // No transformation needed
  },
}
```

### OpenCode Adapter

```typescript
// packages/harness/src/adapters/opencode.ts
import type { ToolAdapter } from './types'
import type { ToolDefinition } from '../types'

const NAME_MAP: Record<string, string> = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Bash: 'bash',
  Grep: 'grep',
  Glob: 'glob',
}

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(NAME_MAP).map(([k, v]) => [v, k])
)

export const openCodeAdapter: ToolAdapter = {
  name: 'opencode',

  mapToolName(canonical: string): string {
    const mapped = NAME_MAP[canonical]
    if (!mapped) throw new Error(`OpenCode adapter: unknown canonical tool "${canonical}"`)
    return mapped
  },

  mapToolSchema(canonical: ToolDefinition): ToolDefinition {
    return {
      ...canonical,
      name: this.mapToolName(canonical.name),
    }
  },

  mapToolResult(_toolName: string, result: string): string {
    return result
  },
}
```

### Registry Discovery

```typescript
// packages/harness/src/skills/registry.ts
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { SkillManifestSchema, type SkillManifest } from './manifest'

export class SkillRegistry {
  private skills = new Map<string, SkillManifest>()

  /** Scan a directory for *.skill.json files */
  loadFromDirectory(dir: string = join(homedir(), '.gstackapp', 'skills')): void {
    const resolvedDir = resolve(dir)
    let entries: string[]
    try {
      entries = readdirSync(resolvedDir, { recursive: true }) as unknown as string[]
    } catch {
      return  // Directory doesn't exist -- not an error
    }

    for (const entry of entries) {
      if (!entry.endsWith('.skill.json')) continue
      const fullPath = join(resolvedDir, entry)
      try {
        const raw = JSON.parse(readFileSync(fullPath, 'utf-8'))
        const manifest = SkillManifestSchema.parse(raw)
        this.skills.set(manifest.id, manifest)
      } catch (err) {
        // Log warning but don't fail -- one bad manifest shouldn't break registry
        console.warn(`Skipping invalid skill manifest: ${fullPath}`, err)
      }
    }
  }

  /** Fetch a manifest from a remote HTTPS URL */
  async loadFromUrl(url: string): Promise<void> {
    if (!url.startsWith('https://')) {
      throw new Error('Remote skill URLs must use HTTPS')
    }
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch skill: ${response.status}`)
    const raw = await response.json()
    const manifest = SkillManifestSchema.parse(raw)
    this.skills.set(manifest.id, manifest)
  }

  get(id: string): SkillManifest | undefined {
    return this.skills.get(id)
  }

  list(): SkillManifest[] {
    return Array.from(this.skills.values())
  }
}
```

### CLI Extension for run-skill

```typescript
// Addition to cli.ts
// harness run-skill ./my-skill.skill.json --adapter claude-code
if (command === 'run-skill') {
  const manifestPath = args[1]
  const adapterName = args.find(a => a.startsWith('--adapter='))?.split('=')[1] ?? 'claude-code'
  // Load manifest, get adapter, get provider, run
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded tool names per provider | Adapter pattern with canonical names | This phase | Skills become portable across harnesses |
| Stage-runner-only tool loop | Shared tool loop utility | This phase | Both pipeline stages and skills use same loop |
| No skill concept | SkillManifest + Registry + Runner | This phase | Skills are discoverable, portable, validated units |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | `packages/harness/vitest.config.ts` |
| Quick run command | `cd packages/harness && npx vitest run --reporter=verbose` |
| Full suite command | `cd packages/harness && npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADPT-01 | Tool adapter maps names + schemas for 3 harnesses | unit | `cd packages/harness && npx vitest run src/__tests__/adapters.test.ts -x` | Wave 0 |
| ADPT-02 | SkillManifest validates valid/invalid .skill.json | unit | `cd packages/harness && npx vitest run src/__tests__/manifest.test.ts -x` | Wave 0 |
| ADPT-03 | Registry discovers skills from local directory | unit | `cd packages/harness && npx vitest run src/__tests__/registry.test.ts -x` | Wave 0 |
| ADPT-04 | Registry loads skills from remote HTTPS URLs | unit | `cd packages/harness && npx vitest run src/__tests__/registry.test.ts -x` | Wave 0 |
| ADPT-05 | Skill runner completes tool_use loop with adapter | integration | `cd packages/harness && npx vitest run src/__tests__/skill-runner.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/harness && npx vitest run --reporter=verbose`
- **Per wave merge:** `cd packages/harness && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/adapters.test.ts` -- covers ADPT-01 (adapter mapping for all 3 harnesses)
- [ ] `src/__tests__/manifest.test.ts` -- covers ADPT-02 (valid/invalid manifests)
- [ ] `src/__tests__/registry.test.ts` -- covers ADPT-03, ADPT-04 (local + remote loading)
- [ ] `src/__tests__/skill-runner.test.ts` -- covers ADPT-05 (tool loop with mocked provider)
- [ ] Test fixtures: `src/__tests__/fixtures/valid.skill.json`, `invalid.skill.json`

## Open Questions

1. **Exact OpenCode schema parameter names**
   - What we know: OpenCode tools are named `read`, `write`, `edit`, `bash`, `grep`, `glob` (verified from opencode.ai/docs/tools/)
   - What's unclear: Exact parameter names in each tool's input schema (e.g., does `read` use `path` or `file_path`?)
   - Recommendation: The adapter's `mapToolSchema` handles parameter renaming. Start with the most likely parameter names based on Claude Code conventions, verify against OpenCode source (Go codebase on GitHub) during implementation, and adjust mappings as needed. Unit tests with fixture data will catch mismatches.

2. **Codex shell command composition**
   - What we know: Codex uses `shell` (with `cmd` array) and `apply_patch` as its only 2 tools
   - What's unclear: Whether the skill runner should actually compose shell commands, or whether the Codex adapter is more useful for a future scenario where skills target Codex directly
   - Recommendation: Implement the mapping but document that Codex adapter is lower confidence than Claude Code and OpenCode adapters. The adapter translates tool names but the actual tool execution happens in the harness, not in Codex itself -- so the adapter is about making skill definitions portable, not about executing Codex commands.

3. **Prompt file vs inline prompt**
   - What we know: D-05 says `prompt` field is a string. Existing pipeline uses file paths (`prompts/*.md`).
   - What's unclear: Should the manifest's `prompt` field support both inline text and file paths?
   - Recommendation: Support both. If the string starts with `./` or `/` or ends with `.md`, treat as file path and read content. Otherwise treat as inline prompt text. This matches the existing pipeline pattern while supporting portable skills that bundle their prompt inline.

## Sources

### Primary (HIGH confidence)
- `packages/harness/src/types.ts` -- ToolDefinition, LLMProvider, CompletionParams interfaces
- `packages/api/src/pipeline/stage-runner.ts` -- Proven tool_use loop pattern (lines 169-291)
- `packages/api/src/pipeline/tools.ts` -- ToolDefinition usage, executeTool pattern
- `packages/harness/src/registry.ts` -- Provider registry pattern (analogous to skill registry)
- `packages/harness/src/cli.ts` -- CLI pattern for adding `run-skill` command

### Secondary (MEDIUM confidence)
- [OpenCode Tools Documentation](https://opencode.ai/docs/tools/) -- Tool names: read, write, edit, bash, grep, glob
- [OpenCode Agents Documentation](https://opencode.ai/docs/agents/) -- Agent architecture, tool permissions
- [Codex CLI blog post (philschmid.de)](https://www.philschmid.de/openai-codex-cli) -- Codex uses shell + apply_patch tools
- [OpenAI Codex CLI reference](https://developers.openai.com/codex/cli/reference) -- CLI architecture
- [OpenAI Apply Patch docs](https://developers.openai.com/api/docs/guides/tools-apply-patch) -- apply_patch tool format

### Tertiary (LOW confidence)
- Exact OpenCode parameter schemas (not fully verified -- need to check Go source during implementation)
- Exact Codex shell command format (verified as `{"cmd": [...]}` but detailed schema not fully confirmed)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- zero new dependencies, all existing libraries
- Architecture: HIGH -- follows established patterns (registry, adapter, Zod schema, tool loop)
- Pitfalls: HIGH -- based on direct analysis of stage-runner.ts and harness types
- Tool mapping (Claude Code): HIGH -- canonical tools are from this environment
- Tool mapping (OpenCode): MEDIUM -- names verified from docs, parameter schemas need implementation-time verification
- Tool mapping (Codex): MEDIUM -- tool names verified, but Codex's 2-tool model makes adapter more complex

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain -- tool names rarely change)
