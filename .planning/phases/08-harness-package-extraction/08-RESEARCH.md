# Phase 8: Harness Package Extraction - Research

**Researched:** 2026-04-03
**Domain:** npm workspace package extraction, TypeScript monorepo, CLI entry points
**Confidence:** HIGH

## Summary

This phase extracts the provider abstraction layer (LLMProvider interface, 3 provider implementations, model profiles, and a minimal CLI) from `packages/api/` into a new `packages/harness/` workspace package. Phase 7 already cleaned the two coupling seams (tools.ts returns ToolDefinition[], config.ts uses findProjectRoot()), so extraction is primarily file moves + import rewiring.

The main complexity is the config separation: api's config.ts has a monolithic Zod schema that bundles GitHub, Voyage, database, and provider config together. Harness needs only provider-related config (API keys, model profiles, local API URL). The harness package must have its own lightweight config that loads .env and exposes only what providers need, while api continues using its full config.

One dependency to handle: `resolveModel()` currently imports `Stage` from `@gstackapp/shared`. Since Stage is just a string literal union (`'ceo' | 'eng' | 'design' | 'qa' | 'security'`), harness should accept a plain `string` parameter instead, avoiding a dependency on shared. The stage-specific model lookup uses Stage only as a key lookup -- a string works identically.

**Primary recommendation:** Move provider files to harness with a flat src/ layout. Create a minimal harness-specific config that reads only provider env vars. Change `resolveModel(stage: Stage)` to `resolveModel(stage: string)` to decouple from @gstackapp/shared. Wire api imports to @gstackapp/harness. Keep the CLI dead simple with process.argv.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** What moves to harness: `providers/` directory (types.ts, anthropic.ts, gemini.ts, openai.ts, index.ts), model profiles (`PROFILES` constant and `resolveModel()`), and the new CLI entry point
- **D-02:** What stays in api: `tools.ts` (sandbox file tools), `sandbox.ts` (path validation), `stage-runner.ts` (tool_use loop orchestration), `orchestrator.ts` (pipeline orchestration), `prompts/` (stage prompt files). These are gstackapp-specific, not portable
- **D-03:** `ToolDefinition`, `LLMProvider`, `CompletionParams`, `CompletionResult`, `ContentBlock`, `ConversationMessage`, `ToolResultBlock` -- all types move to harness and are re-exported from the package root
- **D-04:** Package name: `@gstackapp/harness` with `"public": true` in package.json
- **D-05:** Exports map uses subpath exports: `.` (main), `./providers` (individual classes), `./cli` (CLI entry)
- **D-06:** Workspace dependency: api uses `"@gstackapp/harness": "workspace:*"`
- **D-07:** CLI scope: `--help`, `providers` (list + status), `test <provider>` (hello-world completion). Debug-oriented, not a full platform
- **D-08:** CLI uses same config resolution from Phase 7 (findProjectRoot, .env loading)
- **D-09:** CLI framework: none -- just process.argv parsing. 3 commands doesn't justify a dependency
- **D-10:** Move files, update imports, verify all existing tests pass. No API changes -- just reorganization
- **D-11:** api imports change from relative (`../pipeline/providers`) to package (`@gstackapp/harness`)

### Claude's Discretion
- Internal file organization within `packages/harness/src/` -- flat vs nested
- tsconfig.json settings for the new package -- match api conventions
- Whether to add `packages/harness/README.md` -- only if it helps npm publish

### Deferred Ideas (OUT OF SCOPE)
- npm publish automation (CI/CD for package releases) -- future phase
- Changelog generation for harness package -- future phase
- Version strategy (independent vs lockstep with gstackapp) -- decide at first publish
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PKG-01 | packages/harness/ exists as npm workspace with independent package.json | Workspace pattern established by shared/api packages; follow same conventions (type: module, composite tsconfig) |
| PKG-02 | LLMProvider interface, provider implementations, and model profiles extracted to harness | 5 files move (types.ts, anthropic.ts, gemini.ts, openai.ts, index.ts); resolveModel needs Stage->string decoupling |
| PKG-03 | @gstackapp/harness publishable to npm (public: true, exports configured) | Subpath exports via package.json "exports" field; npm pack validation pattern documented |
| PKG-04 | bin/harness CLI entry point works standalone (npx @gstackapp/harness --help) | process.argv parsing, bin field in package.json, hashbang + tsx for dev |
| PKG-05 | gstackapp api imports from @gstackapp/harness with no provider duplication | 4 import sites in api source + 4 in tests need rewiring; vi.mock paths change |
</phase_requirements>

## Standard Stack

### Core (already in project -- moves to harness)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @anthropic-ai/sdk | ^0.80.0 | Claude API adapter | Already used in api; becomes harness dependency |
| @google/generative-ai | ^0.24.1 | Gemini API adapter | Already used in api; becomes harness dependency |
| openai | ^6.33.0 | OpenAI/local model adapter | Already used in api; becomes harness dependency |
| dotenv | ^16.4 | .env loading for standalone usage | Already used; harness config needs it |
| typescript | ^5.7 | Type compilation | Matches existing workspace convention |

### Supporting (no new dependencies)
No new libraries needed. The harness package reuses existing dependencies that move from api's package.json.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| process.argv (CLI) | commander/yargs | 3 commands doesn't justify 50KB+ dependency; process.argv is sufficient |
| workspace:* protocol | file: protocol | workspace:* is the npm standard for monorepo; file: doesn't resolve correctly for npm pack |

## Architecture Patterns

### Recommended Package Structure
```
packages/harness/
├── package.json           # @gstackapp/harness, public: true, exports map, bin
├── tsconfig.json          # composite, extends root
├── src/
│   ├── index.ts           # Re-exports: types, getProvider, resolveModel, PROFILES
│   ├── types.ts           # LLMProvider, CompletionParams, etc (moved from api)
│   ├── anthropic.ts       # AnthropicProvider (moved from api)
│   ├── gemini.ts          # GeminiProvider (moved from api)
│   ├── openai.ts          # OpenAIProvider (moved from api)
│   ├── config.ts          # Harness-specific config (provider env vars only)
│   ├── cli.ts             # CLI entry point (--help, providers, test)
│   └── __tests__/         # Provider tests (moved from api)
│       ├── anthropic.test.ts
│       ├── gemini.test.ts
│       ├── openai.test.ts
│       └── index.test.ts
└── bin/
    └── harness            # Hashbang entry: #!/usr/bin/env node
```

**Flat src/ recommended** (Claude's discretion): All 7 source files at src/ root. No nested providers/ directory. The package IS the providers -- nesting adds a pointless layer.

### Pattern 1: Package.json Exports Map
**What:** Subpath exports control what consumers can import
**When to use:** Any publishable package with multiple entry points
**Example:**
```json
{
  "name": "@gstackapp/harness",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./providers": "./src/providers-entry.ts",
    "./cli": "./src/cli.ts"
  },
  "bin": {
    "harness": "./bin/harness"
  },
  "publishConfig": {
    "exports": {
      ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
      "./providers": { "import": "./dist/providers-entry.js", "types": "./dist/providers-entry.d.ts" }
    },
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

**Note on dev vs publish:** During development, exports point to `./src/*.ts` (tsx resolves). For publish, `publishConfig.exports` overrides with `./dist/*.js`. This is a common monorepo pattern -- the alternative (always pointing to dist) requires a build step during dev.

### Pattern 2: Workspace Dependency in api
**What:** api depends on harness via workspace protocol
**Example in packages/api/package.json:**
```json
{
  "dependencies": {
    "@gstackapp/harness": "workspace:*"
  }
}
```
Then remove from api's dependencies: `@anthropic-ai/sdk`, `@google/generative-ai`, `openai` (these become harness's deps).

### Pattern 3: Harness Config (subset of api config)
**What:** Lightweight config that only loads provider-related env vars
**Why:** api config requires GitHub App credentials (crashes without them). Harness must work standalone with just API keys.
**Example:**
```typescript
// packages/harness/src/config.ts
import { config as loadDotenv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Load .env from cwd (standalone) or wherever it lives
const envPath = resolve(process.cwd(), '.env')
if (existsSync(envPath)) loadDotenv({ path: envPath })

export interface HarnessConfig {
  anthropicApiKey?: string
  geminiApiKey?: string
  openaiApiKey?: string
  localApiUrl?: string
  pipelineProfile: 'quality' | 'balanced' | 'budget' | 'local'
}

export function loadHarnessConfig(): HarnessConfig {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    localApiUrl: process.env.LOCAL_API_URL,
    pipelineProfile: (process.env.PIPELINE_PROFILE as HarnessConfig['pipelineProfile']) ?? 'balanced',
  }
}
```

### Pattern 4: Decoupling resolveModel from @gstackapp/shared
**What:** Change `resolveModel(stage: Stage)` to `resolveModel(stage: string)`
**Why:** Stage is defined in @gstackapp/shared. If harness depends on shared, it drags in all shared schemas (verdicts, pipelines, findings, GitHub types) which are irrelevant. A string parameter works identically since Stage is just `'ceo' | 'eng' | 'design' | 'qa' | 'security'` used as a lookup key.
**Example:**
```typescript
// Before (in api):
import type { Stage } from '@gstackapp/shared'
export function resolveModel(stage: Stage): { ... }

// After (in harness):
export function resolveModel(stage: string): { ... }
```
The api code that calls `resolveModel(stage)` still passes a Stage -- TypeScript allows passing a literal union where a string is expected.

### Anti-Patterns to Avoid
- **Circular dependency:** harness must NOT import from api or shared. Dependency flows one way: api -> harness -> (only external SDKs)
- **Config coupling:** Do NOT import api's config.ts in harness. Harness has its own config that reads the same env vars independently
- **Re-exporting from api:** Do NOT create barrel re-exports of harness types in api's providers directory. Delete the old directory entirely after extraction

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Workspace linking | Manual symlinks | npm workspaces (already configured) | Root package.json already has `"workspaces": ["packages/*"]` -- just create the directory |
| Package validation | Manual checking | `npm pack --dry-run` | Shows exactly what files will be published, catches missing files or monorepo-internal deps |
| CLI argument parsing | Mini-framework | Raw process.argv | 3 commands total -- a switch statement is clearer than any framework |
| TypeScript project refs | Manual paths | tsconfig composite + references | Existing pattern in shared/api; just add harness reference |

## Common Pitfalls

### Pitfall 1: workspace:* protocol and npm pack
**What goes wrong:** `npm pack` in a workspace package that depends on another workspace package via `workspace:*` will include that literal string in the tarball's package.json, which is unresolvable outside the monorepo.
**Why it happens:** `workspace:*` is a development-time protocol. npm replaces it with the actual version only during `npm publish`.
**How to avoid:** For PKG-03 validation, use `npm pack` and then inspect the resulting tarball's package.json. Harness should NOT depend on any workspace packages (no @gstackapp/shared, no @gstackapp/api). If it does, the tarball will be broken.
**Warning signs:** `workspace:*` appearing in the packed tarball's package.json.

### Pitfall 2: Provider SDK dependencies as peer vs direct
**What goes wrong:** Making provider SDKs peer dependencies means users must install all three even if they only use one provider.
**Why it happens:** Over-engineering for npm package "best practices."
**How to avoid:** Keep all three SDKs as direct dependencies for now. Harness is single-user (Ryan) in Phase 1. Peer deps optimization is a future concern if/when the package has external users.
**Warning signs:** Install errors about missing peer dependencies.

### Pitfall 3: Stale provider singleton after config change
**What goes wrong:** `_providers` Map is a module-level singleton. If harness config changes (e.g., API key set after import), the cached providers won't reflect it.
**Why it happens:** Lazy initialization caches on first call to `initProviders()`.
**How to avoid:** Keep the existing `resetProviders()` function. Document that config must be set (env vars loaded) before first `getProvider()` call. The CLI should call `loadHarnessConfig()` before any provider access.
**Warning signs:** Tests failing due to provider state leaking between test files.

### Pitfall 4: Vitest mock paths after extraction
**What goes wrong:** `vi.mock('../pipeline/providers', ...)` in stage-runner.test.ts breaks because the module path changed.
**Why it happens:** Vitest mocks by module specifier. After extraction, stage-runner.ts imports from `@gstackapp/harness`, not a relative path.
**How to avoid:** Update the mock to `vi.mock('@gstackapp/harness', ...)` and ensure the mock exports match harness's public API (getProvider, resolveModel, resetProviders, PROFILES).
**Warning signs:** "Cannot find module" errors in test output.

### Pitfall 5: bin entry and hashbang
**What goes wrong:** `npx @gstackapp/harness` fails with "command not found" or permission error.
**Why it happens:** Missing hashbang (`#!/usr/bin/env node`), missing executable permission, or bin path pointing to wrong file.
**How to avoid:** The `bin/harness` file must have `#!/usr/bin/env node` as line 1, be marked executable (`chmod +x`), and import the compiled/transpiled CLI entry. For development (tsx), use `#!/usr/bin/env -S npx tsx` or a wrapper that invokes tsx.
**Warning signs:** `EACCES` errors or `env: node: No such file or directory`.

### Pitfall 6: api config.ts still imports provider env vars
**What goes wrong:** api's config.ts continues to define `geminiApiKey`, `openaiApiKey`, `localApiUrl`, `pipelineProfile` in its schema, creating duplication with harness config.
**Why it happens:** Forgetting to trim api's config after extraction.
**How to avoid:** Keep api's config as-is for now. The env vars are still loaded by api's process, and stage-runner passes them through to harness providers. The duplication is cosmetic, not functional -- api reads them to construct providers (via harness), harness reads them independently for CLI. Cleaning this up would require api to pass config to harness explicitly, which adds complexity for no Phase 8 benefit.
**Warning signs:** None -- this is acceptable duplication for now.

## Code Examples

### Harness package.json
```json
{
  "name": "@gstackapp/harness",
  "version": "0.1.0",
  "description": "Multi-provider LLM abstraction with model profiles",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./providers": "./src/providers-entry.ts",
    "./cli": "./src/cli.ts"
  },
  "bin": {
    "harness": "./bin/harness"
  },
  "files": ["dist", "bin", "src"],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@google/generative-ai": "^0.24.1",
    "dotenv": "^16.4",
    "openai": "^6.33.0"
  },
  "devDependencies": {
    "typescript": "^5.7",
    "tsx": "^4.19",
    "vitest": "^3.1"
  }
}
```

### Harness index.ts (main entry)
```typescript
// Re-export all types
export type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
  ToolDefinition,
} from './types'

// Re-export provider registry
export { getProvider, resolveModel, resetProviders, PROFILES } from './registry'

// Re-export config
export { loadHarnessConfig } from './config'
export type { HarnessConfig } from './config'
```

### Harness providers-entry.ts (./providers subpath)
```typescript
export { AnthropicProvider } from './anthropic'
export { GeminiProvider } from './gemini'
export { OpenAIProvider } from './openai'
```

### CLI entry (bin/harness)
```bash
#!/usr/bin/env -S npx tsx
import '../src/cli.ts'
```

### CLI implementation (src/cli.ts)
```typescript
import { loadHarnessConfig } from './config'
import { getProvider, resetProviders, PROFILES } from './registry'

const args = process.argv.slice(2)
const command = args[0]

if (!command || command === '--help' || command === '-h') {
  console.log(`
@gstackapp/harness - Multi-provider LLM abstraction

Commands:
  providers          List configured providers and their status
  test <provider>    Send a test completion to verify API key works
  --help             Show this help message
`)
  process.exit(0)
}

if (command === 'providers') {
  const config = loadHarnessConfig()
  const providers = [
    { name: 'anthropic', configured: !!config.anthropicApiKey },
    { name: 'gemini', configured: !!config.geminiApiKey },
    { name: 'openai', configured: !!config.openaiApiKey },
    { name: 'local', configured: !!config.localApiUrl },
  ]
  console.log('\nProvider Status:')
  for (const p of providers) {
    console.log(`  ${p.configured ? '[ok]' : '[--]'} ${p.name}`)
  }
  console.log(`\nActive profile: ${config.pipelineProfile}`)
  process.exit(0)
}

if (command === 'test') {
  const providerName = args[1]
  if (!providerName) {
    console.error('Usage: harness test <provider>')
    process.exit(1)
  }
  // ... send hello-world completion
}
```

### Updated import in stage-runner.ts
```typescript
// Before:
import { resolveModel } from './providers'
import type { ContentBlock, ConversationMessage, ToolResultBlock } from './providers'

// After:
import { resolveModel } from '@gstackapp/harness'
import type { ContentBlock, ConversationMessage, ToolResultBlock } from '@gstackapp/harness'
```

### Updated mock in stage-runner.test.ts
```typescript
// Before:
vi.mock('../pipeline/providers', () => ({ ... }))

// After:
vi.mock('@gstackapp/harness', () => ({ ... }))
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| exports field absent | package.json "exports" with subpath exports | Node 16+ / npm 8+ | Controls public API surface; prevents deep imports |
| workspace:* only in pnpm | workspace:* in npm | npm 9+ (Node 18+) | npm pack replaces workspace:* with version at publish time |
| bin as single string | bin as object | Always | Object form supports multiple commands, clearer intent |

## Open Questions

1. **npm scope ownership**
   - What we know: Package name is `@gstackapp/harness`. The npm scope `@gstackapp` may not be claimed yet.
   - What's unclear: Whether Ryan has npm credentials set up and owns the @gstackapp scope
   - Recommendation: Defer npm publish to future phase (per CONTEXT.md deferred items). Package just needs to pass `npm pack` validation, not actually publish.

2. **Pre-existing TypeScript errors in gemini.ts and openai.ts**
   - What we know: Phase 7 summary noted "Pre-existing TypeScript errors in gemini.ts and openai.ts provider files (unrelated to this plan's changes, out of scope)"
   - What's unclear: Whether these are real type errors or just strict-mode warnings
   - Recommendation: Fix any TS errors during extraction since the files are being moved anyway. Cannot publish a package with type errors.

3. **Vitest config for harness package**
   - What we know: api has vitest.config.ts at `packages/api/`. Root has none. Tests run via `npm test` from api workspace.
   - What's unclear: Whether harness needs its own vitest.config.ts or can share root config
   - Recommendation: Create a simple vitest.config.ts in packages/harness/ matching api's pattern. Provider tests should run independently.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v22.22.0 | -- |
| npm | Workspace management | Yes | 10.9.4 | -- |
| TypeScript | Compilation | Yes | ^5.7 (workspace) | -- |
| tsx | Dev CLI execution | Yes | ^4.19 (api devDep) | -- |
| vitest | Testing | Yes | ^3.1 (api devDep) | -- |

No missing dependencies. All required tools are already installed in the monorepo.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.1 |
| Config file | `packages/api/vitest.config.ts` (existing); `packages/harness/vitest.config.ts` (new, Wave 0) |
| Quick run command | `npm test --workspace=packages/harness` |
| Full suite command | `npm test --workspaces --if-present` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PKG-01 | Workspace resolves, package.json valid | smoke | `npm ls @gstackapp/harness` | N/A (npm built-in) |
| PKG-02 | Provider tests pass from harness package | unit | `npm test --workspace=packages/harness` | Yes (moving from api) |
| PKG-03 | npm pack produces valid tarball | smoke | `cd packages/harness && npm pack --dry-run` | N/A (npm built-in) |
| PKG-04 | CLI --help works | smoke | `npx --workspace=packages/harness harness --help` | Wave 0 |
| PKG-05 | All api tests still pass after import change | integration | `npm test --workspace=packages/api` | Yes (264 existing tests) |

### Sampling Rate
- **Per task commit:** `npm test --workspaces --if-present`
- **Per wave merge:** Full suite + `npm pack --dry-run` in harness
- **Phase gate:** All workspace tests green + npm pack validates

### Wave 0 Gaps
- [ ] `packages/harness/vitest.config.ts` -- test runner config for harness workspace
- [ ] `packages/harness/tsconfig.json` -- TypeScript config for harness workspace

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all 5 provider files, config.ts, stage-runner.ts, test files
- Existing monorepo patterns from packages/shared/ and packages/api/
- Phase 7 summary (07-01-SUMMARY.md) confirming seam cleanup completion

### Secondary (MEDIUM confidence)
- npm workspaces documentation (workspace:* protocol behavior during npm pack)
- Node.js subpath exports documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, just reorganizing existing code
- Architecture: HIGH -- following established monorepo patterns already in the project
- Pitfalls: HIGH -- based on direct inspection of actual code and known npm workspace behaviors

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable domain, no fast-moving dependencies)
