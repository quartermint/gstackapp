---
phase: 02-pipeline-engine
plan: 01
subsystem: pipeline
tags: [sandbox, security, realpathSync, clone, simple-git, filter, anthropic-sdk, tool_use]

# Dependency graph
requires:
  - phase: 01-foundation-github-integration
    provides: GitHub auth (getInstallationOctokit), DB schema, shared types (Stage, Verdict)
provides:
  - Sandboxed file access (validatePath) with CVE-2025-53109 prevention
  - Claude tool definitions (read_file, list_files, search_code) and executor
  - Authenticated shallow clone with symlink removal
  - Smart stage filter (CEO/Design conditional, Eng/QA/Security always run)
  - Pino-based logger utility
affects: [02-02-PLAN, 02-03-PLAN, 03-review-output-signal-quality]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk ^0.80", "simple-git ^3.33", "pino logger utility"]
  patterns: ["realpathSync-first path validation", "execFileSync for shell-injection prevention", "stage filtering by PR content analysis"]

key-files:
  created:
    - packages/api/src/pipeline/sandbox.ts
    - packages/api/src/pipeline/tools.ts
    - packages/api/src/pipeline/clone.ts
    - packages/api/src/pipeline/filter.ts
    - packages/api/src/lib/logger.ts
    - packages/api/src/__tests__/sandbox.test.ts
    - packages/api/src/__tests__/filter.test.ts
  modified:
    - packages/api/package.json
    - package-lock.json

key-decisions:
  - "realpathSync before startsWith check for symlink escape prevention (CVE-2025-53109 pattern)"
  - "execFileSync (not execSync) for grep to prevent AI-injected shell commands"
  - "CEO stage filtered for small PRs without new files, arch changes, or dependency changes"
  - "Design stage filtered unless UI-related files touched (CSS, TSX/JSX, component paths)"

patterns-established:
  - "Sandbox pattern: resolve() then realpathSync() then prefix-check for all file access"
  - "Tool executor pattern: switch on tool name, validate path first, return string results"
  - "Clone pattern: temp dir, auth token from installation, shallow clone, symlink removal, cleanup fn"
  - "Filter pattern: always-run stages vs conditional stages based on PrFile analysis"

requirements-completed: [PIPE-03, PIPE-04, PIPE-08]

# Metrics
duration: 9min
completed: 2026-03-30
---

# Phase 02 Plan 01: Pipeline Infrastructure Summary

**Sandboxed file access with realpathSync CVE prevention, Claude tool definitions (read_file/list_files/search_code), authenticated shallow clone with symlink removal, and smart stage filtering for CEO/Design stages**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-30T23:00:10Z
- **Completed:** 2026-03-30T23:09:44Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Sandboxed file access with realpathSync-first security pattern preventing symlink escape (CVE-2025-53109)
- Three Claude tool definitions (read_file, list_files, search_code) with executor using execFileSync to prevent shell injection
- Authenticated shallow clone manager with auto symlink removal and cleanup
- Smart stage filter: CEO skipped for small/documentation PRs, Design skipped for non-UI changes, Eng/QA/Security always fire
- 23 tests passing across sandbox and filter modules

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create sandbox + tools** - `8b68464` (feat)
2. **Task 2: Clone manager, filter, and tests (TDD RED)** - `415d621` (test)
3. **Task 2: Clone manager, filter, and tests (TDD GREEN)** - `cdf75e9` (feat)

## Files Created/Modified
- `packages/api/src/pipeline/sandbox.ts` - Path validation with realpathSync-first security
- `packages/api/src/pipeline/tools.ts` - Claude tool definitions and executor (read_file, list_files, search_code)
- `packages/api/src/pipeline/clone.ts` - Authenticated shallow clone with symlink removal
- `packages/api/src/pipeline/filter.ts` - Smart stage filtering (CEO/Design conditional)
- `packages/api/src/lib/logger.ts` - Pino-based structured logger (silent in tests)
- `packages/api/src/__tests__/sandbox.test.ts` - 11 tests for path validation and tool execution
- `packages/api/src/__tests__/filter.test.ts` - 12 tests for stage filtering logic
- `packages/api/package.json` - Added @anthropic-ai/sdk and simple-git dependencies
- `package-lock.json` - Updated lockfile

## Decisions Made
- Used realpathSync before startsWith prefix check (not after) to prevent symlink-based sandbox escape
- Used execFileSync instead of execSync for grep to prevent shell injection from AI-generated patterns
- Created logger.ts utility (pino-based) not in original plan but needed by clone.ts -- deviation Rule 3
- macOS /var -> /private/var symlink handling: tests use realpathSync on tmpDir for stable assertions

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created logger.ts utility**
- **Found during:** Task 2 (clone.ts creation)
- **Issue:** clone.ts needed structured logging for clone/cleanup operations, no logger module existed
- **Fix:** Created packages/api/src/lib/logger.ts with pino, silent in test mode
- **Files modified:** packages/api/src/lib/logger.ts
- **Verification:** TypeScript compiles, clone.ts imports resolve
- **Committed in:** cdf75e9 (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Fixed macOS /var symlink in sandbox tests**
- **Found during:** Task 2 (TDD GREEN phase)
- **Issue:** macOS /var is symlink to /private/var, realpathSync returns /private/var but tmpdir() returns /var
- **Fix:** Applied realpathSync to tmpDir in test setup; split path traversal test into two: one for real file escape, one for nonexistent path
- **Files modified:** packages/api/src/__tests__/sandbox.test.ts
- **Verification:** All 11 sandbox tests pass on macOS
- **Committed in:** cdf75e9 (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. Logger utility is a natural infrastructure need. macOS symlink fix ensures tests are portable. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## Known Stubs
None -- all modules are fully implemented with real logic, no placeholder data.

## User Setup Required
None - no external service configuration required for this plan.

## Next Phase Readiness
- Pipeline infrastructure (sandbox, tools, clone, filter) ready for stage execution in 02-02
- Claude API key still needed for actual pipeline execution (existing blocker)
- Stage executor (02-02) can import sandbox tools, clone manager, and filter directly

## Self-Check: PASSED

All 8 created files verified present. All 3 commit hashes found in git log.

---
*Phase: 02-pipeline-engine*
*Completed: 2026-03-30*
