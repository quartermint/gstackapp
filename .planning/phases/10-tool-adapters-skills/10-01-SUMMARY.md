---
phase: 10-tool-adapters-skills
plan: 01
subsystem: harness
tags: [tool-adapter, skill-manifest, zod, registry, portability]

requires:
  - phase: 08-harness-extract
    provides: "@gstackapp/harness package with LLMProvider, ToolDefinition types"
provides:
  - "ToolAdapter interface for cross-harness tool name normalization"
  - "3 built-in adapters: claude-code (identity), opencode (lowercase), codex (shell/apply_patch)"
  - "getAdapter factory for adapter resolution by name"
  - "SkillManifest Zod schema for .skill.json validation"
  - "SkillRegistry class with local directory + remote HTTPS loading"
affects: [10-02-skill-runner, 11-state-sync]

tech-stack:
  added: [zod (to harness package)]
  patterns: [adapter-pattern, static-mapping, zod-schema-validation, in-memory-registry]

key-files:
  created:
    - packages/harness/src/adapters/types.ts
    - packages/harness/src/adapters/claude-code.ts
    - packages/harness/src/adapters/opencode.ts
    - packages/harness/src/adapters/codex.ts
    - packages/harness/src/adapters/index.ts
    - packages/harness/src/skills/manifest.ts
    - packages/harness/src/skills/registry.ts
    - packages/harness/src/skills/index.ts
    - packages/harness/src/__tests__/adapters.test.ts
    - packages/harness/src/__tests__/manifest.test.ts
    - packages/harness/src/__tests__/registry.test.ts
    - packages/harness/src/__tests__/fixtures/valid.skill.json
    - packages/harness/src/__tests__/fixtures/invalid.skill.json
  modified:
    - packages/harness/package.json

key-decisions:
  - "Added zod as direct dependency to harness package (was only in shared)"
  - "Adapters are standalone objects (not class hierarchy) -- simple for 3 implementations"
  - "Codex adapter maps to shell schema with cmd array format for Read/Bash/Grep/Glob"

patterns-established:
  - "Adapter pattern: static mapping objects implementing ToolAdapter interface"
  - "Skill manifest: .skill.json files validated by Zod at load time"
  - "Registry pattern: in-memory Map with sync directory scan + async URL fetch"

requirements-completed: [ADPT-01, ADPT-02, ADPT-03, ADPT-04]

duration: 3min
completed: 2026-04-03
---

# Phase 10 Plan 01: Tool Adapters & Skills Summary

**ToolAdapter interface with 3 harness adapters (claude-code/opencode/codex), SkillManifest Zod schema, and SkillRegistry with local + remote loading**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-03T20:04:48Z
- **Completed:** 2026-04-03T20:07:29Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- ToolAdapter interface normalizing tool names across Claude Code, OpenCode, and Codex harnesses
- SkillManifest Zod schema validating .skill.json files with required/optional fields and semver version
- SkillRegistry discovering skills from local directories (recursive) and remote HTTPS URLs
- 34 tests covering all adapter mappings, schema validation, and registry behaviors

## Task Commits

Each task was committed atomically:

1. **Task 1: ToolAdapter interface + 3 adapters + SkillManifest schema** - `2e4f436` (feat)
2. **Task 2: SkillRegistry with local directory + remote URL loading** - `a29c96c` (feat)

## Files Created/Modified
- `packages/harness/src/adapters/types.ts` - ToolAdapter interface definition
- `packages/harness/src/adapters/claude-code.ts` - Identity adapter (canonical = Claude Code)
- `packages/harness/src/adapters/opencode.ts` - Lowercase name mapping adapter
- `packages/harness/src/adapters/codex.ts` - Shell/apply_patch two-tool mapping adapter
- `packages/harness/src/adapters/index.ts` - Barrel export + getAdapter factory
- `packages/harness/src/skills/manifest.ts` - SkillManifest Zod schema with CanonicalToolSchema
- `packages/harness/src/skills/registry.ts` - SkillRegistry class (Map + loadFromDirectory + loadFromUrl)
- `packages/harness/src/skills/index.ts` - Skills barrel export
- `packages/harness/src/__tests__/adapters.test.ts` - 24 adapter tests
- `packages/harness/src/__tests__/manifest.test.ts` - 6 manifest schema tests
- `packages/harness/src/__tests__/registry.test.ts` - 10 registry tests
- `packages/harness/src/__tests__/fixtures/valid.skill.json` - Valid test fixture
- `packages/harness/src/__tests__/fixtures/invalid.skill.json` - Invalid test fixture
- `packages/harness/package.json` - Added zod dependency

## Decisions Made
- Added zod as direct dependency to harness package.json (was only in shared package, but skills are a harness concern per research recommendation)
- Adapters implemented as standalone objects, not a class hierarchy -- three adapters is too few for inheritance
- Codex adapter transforms canonical tool schemas to shell format with `cmd` array property

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all implementations are complete and functional.

## Next Phase Readiness
- Adapter interface and skill manifest ready for Plan 02 (skill runner)
- SkillRegistry provides the manifest lookup the runner needs
- ToolAdapter provides the translation layer the runner injects at tool call boundaries

## Self-Check: PASSED

All 13 created files verified on disk. Both task commits (2e4f436, a29c96c) verified in git log. 34/34 tests pass.

---
*Phase: 10-tool-adapters-skills*
*Completed: 2026-04-03*
