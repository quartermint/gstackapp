# Phase 7: Seam Cleanup - Research

**Researched:** 2026-04-03
**Domain:** TypeScript refactoring -- type decoupling and path resolution
**Confidence:** HIGH

## Summary

This is a surgical refactoring phase with two well-defined targets: (1) remove the `Anthropic.Tool[]` type leak from `tools.ts` and (2) replace the hardcoded `MONOREPO_ROOT` path assumption in `config.ts`. Both changes are prerequisites for Phase 8's package extraction.

The codebase is already well-prepared. A `ToolDefinition` interface exists in `providers/types.ts` that is the exact replacement type. The Anthropic adapter already handles the translation from `ToolDefinition` to `Anthropic.Tool`. The `stage-runner.ts` already manually maps `input_schema` to `inputSchema` on lines 189-193 -- after SEAM-01, this mapping becomes unnecessary and should be removed.

**Primary recommendation:** Execute as a single plan with two tasks (one per seam). Total code changes are approximately 30 lines across 3-4 files, plus test updates.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `createSandboxTools()` return type changes from `Anthropic.Tool[]` to `ToolDefinition[]` (already defined in `providers/types.ts:16`)
- **D-02:** The `input_schema` field names stay as-is since `ToolDefinition.inputSchema` already uses camelCase -- the Anthropic adapter in `providers/anthropic.ts:23-26` already handles the translation to `input_schema`
- **D-03:** Remove `import type Anthropic from '@anthropic-ai/sdk'` from tools.ts entirely -- the only Anthropic SDK import should be in `providers/anthropic.ts`
- **D-04:** Replace `MONOREPO_ROOT` with a `findProjectRoot()` function that walks up from `import.meta.dirname` looking for `package.json` with `name` matching the package -- works in both monorepo and standalone contexts
- **D-05:** `.env` loading: try `findProjectRoot()` first, then fall back to `process.cwd()`. When running as a standalone package, `.env` lives next to the package root
- **D-06:** `databasePath` relative resolution uses `process.cwd()` as base (not package root) -- this matches standard CLI behavior where paths are relative to where you run the command
- **D-07:** Config stays in `packages/api/src/lib/config.ts` for now -- it moves to harness in Phase 8. This phase only removes the hardcoded path assumption

### Claude's Discretion
- Test updates to reflect new return types -- mechanical changes, no design decisions needed
- Whether to add a `findProjectRoot()` utility or inline the logic -- Claude picks based on reuse potential

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEAM-01 | tools.ts createSandboxTools() returns ToolDefinition[] instead of Anthropic.Tool[] | ToolDefinition already exists in providers/types.ts:16-20. Stage-runner mapping code (lines 189-193) becomes dead code after this change. |
| SEAM-02 | config.ts loads environment without MONOREPO_ROOT path assumption, supports standalone usage | findProjectRoot() pattern is standard Node.js -- walk up directories looking for package.json. Two uses of MONOREPO_ROOT: .env path (line 10) and databasePath resolution (line 15). |
</phase_requirements>

## Architecture Patterns

### SEAM-01: Tool Type Decontamination

**Current state (tools.ts:16):**
```typescript
import type Anthropic from '@anthropic-ai/sdk'
export function createSandboxTools(clonePath: string): Anthropic.Tool[] {
  return [
    { name: 'read_file', description: '...', input_schema: { ... } },
    // ...
  ]
}
```

**Target state:**
```typescript
import type { ToolDefinition } from './providers/types'
export function createSandboxTools(clonePath: string): ToolDefinition[] {
  return [
    { name: 'read_file', description: '...', inputSchema: { ... } },
    // ...
  ]
}
```

**Key change: field name.** `input_schema` (Anthropic's snake_case) becomes `inputSchema` (camelCase, matching ToolDefinition). This is not just a type annotation swap -- the object literal property names change too.

**Downstream impact on stage-runner.ts (lines 188-193):**
```typescript
// BEFORE: manual mapping needed because tools returns Anthropic format
const sandboxTools = createSandboxTools(input.clonePath)
const tools = sandboxTools.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.input_schema,
}))

// AFTER: direct use, no mapping
const tools = createSandboxTools(input.clonePath)
```

**Files touched:**
1. `packages/api/src/pipeline/tools.ts` -- change return type, rename properties
2. `packages/api/src/pipeline/stage-runner.ts` -- remove mapping code (lines 189-193)
3. `packages/api/src/__tests__/stage-runner.test.ts` -- update mock to use `inputSchema` instead of `input_schema`

**Files NOT touched:**
- `sandbox.test.ts` -- imports `executeTool`, not `createSandboxTools` return type
- `providers/anthropic.ts` -- already works with `ToolDefinition`, no changes needed

### SEAM-02: Config Path Decoupling

**Current state (config.ts:7-15):**
```typescript
const MONOREPO_ROOT = resolve(import.meta.dirname, '../../../..')
loadDotenv({ path: resolve(MONOREPO_ROOT, '.env') })
// ...
databasePath: z.string().default('./data/gstackapp.db').transform(
  (p) => (p.startsWith('/') ? p : resolve(MONOREPO_ROOT, p))
),
```

**Target state:**
```typescript
function findProjectRoot(): string {
  let dir = import.meta.dirname
  while (dir !== resolve(dir, '..')) {
    const pkgPath = resolve(dir, 'package.json')
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.name === '@gstackapp/api') return dir
    }
    dir = resolve(dir, '..')
  }
  return process.cwd()  // fallback
}

const PROJECT_ROOT = findProjectRoot()

// .env: try project root first, then cwd
const envPath = resolve(PROJECT_ROOT, '.env')
loadDotenv({ path: existsSync(envPath) ? envPath : resolve(process.cwd(), '.env') })

// databasePath: relative to cwd (D-06)
databasePath: z.string().default('./data/gstackapp.db').transform(
  (p) => (p.startsWith('/') ? p : resolve(process.cwd(), p))
),
```

**Key design details:**
- `findProjectRoot()` walks UP from module location, not down from filesystem root
- Looks for `package.json` with matching `name` field -- handles both monorepo (`packages/api/package.json` with `@gstackapp/api`) and standalone
- Falls back to `process.cwd()` if no match found
- `.env` loading tries project root first, then cwd (D-05)
- `databasePath` resolution uses `process.cwd()` only (D-06) -- different base than .env

**Files touched:**
1. `packages/api/src/lib/config.ts` -- replace MONOREPO_ROOT, add findProjectRoot()

**Recommendation on utility extraction:** Inline `findProjectRoot()` in config.ts as a module-level function. Phase 8 will move config to harness anyway, so creating a separate utility file adds unnecessary churn. If Phase 8 needs it elsewhere, it can extract then.

### Anti-Patterns to Avoid
- **Changing the config export shape:** The `config` object must remain identical in type and runtime values. Only the internal path resolution mechanism changes.
- **Breaking .env loading order:** `dotenv` only sets vars that are not already in `process.env`. The load must happen before `configSchema.parse()`, same as today.
- **Over-generalizing findProjectRoot():** Don't make it configurable or accept package names as parameters yet. YAGNI until Phase 8.

## Common Pitfalls

### Pitfall 1: input_schema vs inputSchema Property Name Mismatch
**What goes wrong:** Changing the return type annotation without changing the property names in the object literals, or vice versa. TypeScript would catch this, but it's the most likely mistake.
**How to avoid:** Change both the type and the property names simultaneously. Run `tsc --noEmit` after to verify.
**Warning signs:** TypeScript errors mentioning missing properties.

### Pitfall 2: Stage-Runner Mock Drift
**What goes wrong:** The `stage-runner.test.ts` mock on line 19 uses `input_schema` (Anthropic format). After SEAM-01, it must use `inputSchema` (ToolDefinition format). But since the mock bypasses real `createSandboxTools()`, tests pass even if the mock is wrong -- the mock shape just needs to match what stage-runner expects.
**How to avoid:** After the change, stage-runner passes tools directly to the provider (no mapping). The mock should return `ToolDefinition[]` format. Verify the mock matches the actual `createSandboxTools()` return shape.
**Warning signs:** Tests pass but the mock structure doesn't match the real function's return type.

### Pitfall 3: findProjectRoot() Infinite Loop
**What goes wrong:** The while loop in `findProjectRoot()` could theoretically loop forever if the filesystem root check fails.
**How to avoid:** Use `dir !== resolve(dir, '..')` as the termination condition. At filesystem root, `resolve('/', '..')` returns `/`, so the loop terminates.

### Pitfall 4: Config Module Side Effects in Tests
**What goes wrong:** `config.ts` runs `loadDotenv()` and `configSchema.parse()` at import time. Tests that mock config (like `providers/index.test.ts`) use `vi.mock('../../lib/config')` to avoid these side effects. The `findProjectRoot()` change must not break these mocks.
**How to avoid:** `findProjectRoot()` is a regular function call at module level, same as `MONOREPO_ROOT` was. Mocked modules skip the real module entirely, so no impact.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| .env loading | Custom env parser | `dotenv` (already used) | Edge cases with quotes, multiline, comments |
| Path walking | Custom fs traversal library | Simple while loop with `resolve(dir, '..')` | The pattern is 8 lines, no library needed |

## Code Examples

### SEAM-01: Updated tools.ts createSandboxTools()
```typescript
// Source: codebase analysis of providers/types.ts
import type { ToolDefinition } from './providers/types'

export function createSandboxTools(clonePath: string): ToolDefinition[] {
  return [
    {
      name: 'read_file',
      description: 'Read the contents of a file...',
      inputSchema: {           // was: input_schema
        type: 'object' as const,
        properties: { path: { type: 'string', description: '...' } },
        required: ['path'],
      },
    },
    // ... list_files, search_code similarly updated
  ]
}
```

### SEAM-01: Simplified stage-runner.ts
```typescript
// Source: codebase analysis of stage-runner.ts:188-193
// BEFORE (5 lines):
const sandboxTools = createSandboxTools(input.clonePath)
const tools = sandboxTools.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: t.input_schema,
}))

// AFTER (1 line):
const tools = createSandboxTools(input.clonePath)
```

### SEAM-02: findProjectRoot() Implementation
```typescript
// Source: standard Node.js pattern for project root discovery
function findProjectRoot(): string {
  let dir = import.meta.dirname
  while (dir !== resolve(dir, '..')) {
    const pkgPath = resolve(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        if (pkg.name === '@gstackapp/api') return dir
      } catch {
        // malformed package.json, skip
      }
    }
    dir = resolve(dir, '..')
  }
  return process.cwd()
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.1 |
| Config file | `packages/api/vitest.config.ts` + `vitest.workspace.ts` |
| Quick run command | `cd packages/api && npx vitest run` |
| Full suite command | `npx vitest run` (from repo root) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEAM-01 | createSandboxTools returns ToolDefinition[] without Anthropic SDK import | unit | `cd packages/api && npx vitest run src/__tests__/stage-runner.test.ts -x` | Yes (update mock) |
| SEAM-01 | No `@anthropic-ai/sdk` import in tools.ts | smoke | `! grep -q "anthropic-ai/sdk" packages/api/src/pipeline/tools.ts` | N/A (shell check) |
| SEAM-02 | Config loads without MONOREPO_ROOT | unit | `cd packages/api && npx vitest run src/__tests__/providers/index.test.ts -x` | Yes (uses mocked config) |
| SEAM-02 | findProjectRoot finds package.json | unit | `cd packages/api && npx vitest run src/__tests__/config.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `cd packages/api && npx vitest run`
- **Per wave merge:** `npx vitest run` (full suite from root)
- **Phase gate:** Full suite green + `tsc --noEmit` clean

### Wave 0 Gaps
- [ ] `packages/api/src/__tests__/config.test.ts` -- covers SEAM-02 findProjectRoot() behavior (project root found, fallback to cwd, .env loading order)
- Existing `stage-runner.test.ts` and `sandbox.test.ts` cover SEAM-01 after mock updates

## Impact Analysis

### Files Modified (4 files)
| File | Change | Risk |
|------|--------|------|
| `packages/api/src/pipeline/tools.ts` | Return type + property names | LOW -- TypeScript catches mismatches |
| `packages/api/src/pipeline/stage-runner.ts` | Remove 5-line mapping, use tools directly | LOW -- simplification |
| `packages/api/src/lib/config.ts` | Replace MONOREPO_ROOT with findProjectRoot() | LOW -- same behavior in monorepo context |
| `packages/api/src/__tests__/stage-runner.test.ts` | Update mock property names | LOW -- mechanical |

### Files NOT Modified (verified)
| File | Reason |
|------|--------|
| `providers/anthropic.ts` | Already works with ToolDefinition, maps to Anthropic.Tool internally |
| `providers/types.ts` | ToolDefinition interface unchanged |
| `sandbox.test.ts` | Tests executeTool(), not createSandboxTools() return type |
| All config consumers (5 files) | Config export shape unchanged |

## Open Questions

None. This phase is fully specified by CONTEXT.md decisions D-01 through D-07. All code targets have been inspected and the change set is deterministic.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection of all target files
- `packages/api/src/pipeline/tools.ts` -- current Anthropic.Tool[] return type
- `packages/api/src/pipeline/providers/types.ts` -- ToolDefinition interface
- `packages/api/src/pipeline/stage-runner.ts` -- mapping code on lines 189-193
- `packages/api/src/lib/config.ts` -- MONOREPO_ROOT usage
- `packages/api/package.json` -- package name `@gstackapp/api` for findProjectRoot()

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, pure refactoring of existing code
- Architecture: HIGH -- patterns already established, changes are mechanical
- Pitfalls: HIGH -- small change set with clear TypeScript guardrails

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (stable -- no external dependencies affected)
