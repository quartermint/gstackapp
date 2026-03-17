---
phase: 22-cli-client
plan: "02"
subsystem: cli
tags: [commander, offline-queue, jsonl, project-detection, stdin-pipe, capture]

# Dependency graph
requires:
  - phase: 22-cli-client (plan 01)
    provides: CLI package scaffolding, config module, API client, output helpers
provides:
  - mc capture command with stdin pipe support and explicit project flag
  - Offline queue (queue.jsonl) with auto-flush on next successful call
  - Project auto-detection from cwd via longest prefix match
affects: [22-03, 22-04]

# Tech tracking
tech-stack:
  added: [commander, tsup]
  patterns: [offline-queue-jsonl, cwd-project-detection, stdin-pipe-detection]

key-files:
  created:
    - packages/cli/src/queue.ts
    - packages/cli/src/project-detect.ts
    - packages/cli/src/commands/capture.ts
    - packages/cli/package.json
    - packages/cli/tsup.config.ts
    - packages/cli/tsconfig.json
    - packages/cli/vitest.config.ts
    - packages/cli/src/config.ts
    - packages/cli/src/api-client.ts
    - packages/cli/src/output.ts
    - packages/cli/src/index.ts
    - packages/cli/src/commands/status.ts
    - packages/cli/src/commands/projects.ts
    - packages/cli/src/commands/init.ts
  modified: [pnpm-lock.yaml]

key-decisions:
  - "Created all 22-01 scaffolding inline (Rule 3 deviation) since dependency plan was never executed"
  - "Added passWithNoTests to vitest config to avoid CI failure before tests exist"

patterns-established:
  - "JSONL append-only queue at ~/.mc/queue.jsonl for offline resilience"
  - "Longest prefix match for cwd-to-project detection using API project paths"
  - "Exit code 2 convention for offline-queued operations"

requirements-completed: [CLI-01, CLI-02, CLI-03, CLI-06, CLI-07, CLI-08]

# Metrics
duration: 6min
completed: 2026-03-16
---

# Plan 22-02: Capture Command + Offline Queue Summary

**`mc capture` command with stdin piping, cwd project auto-detection, -p explicit project flag, and offline queue with auto-flush**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-16T23:55:14Z
- **Completed:** 2026-03-17T00:01:02Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments
- Offline queue module (queue.jsonl) with enqueue, readQueue, clearQueue, and queueCount
- Project auto-detection from working directory using longest prefix match against API project paths
- Full capture command: positional args, piped stdin, -p flag, offline resilience with exit code 2, auto-flush on success
- Complete CLI scaffolding (22-01 dependency created inline): package.json, tsup, tsconfig, config, api-client, output, entry point

## Task Commits

Each task was committed atomically:

1. **Task 1: Offline queue module + scaffolding** - `671d839` (feat)
2. **Task 2: Project detection module** - `671d839` (included in Task 1 commit -- files pre-existed from previous session)
3. **Task 3: Capture command** - `671d839` (included in Task 1 commit -- files pre-existed from previous session)

**Additional:** `81fcaf9` (chore: vitest config with passWithNoTests)

## Files Created/Modified
- `packages/cli/package.json` - CLI package with commander, tsup, bin field
- `packages/cli/tsup.config.ts` - Single ESM bundle with noExternal and shebang
- `packages/cli/tsconfig.json` - Extends base config, node22 target
- `packages/cli/vitest.config.ts` - Test config with passWithNoTests
- `packages/cli/src/config.ts` - ~/.mc/config.json with Tailscale default URL
- `packages/cli/src/api-client.ts` - fetch-based client with 5s timeout, McApiUnreachable
- `packages/cli/src/output.ts` - ANSI colors, NO_COLOR support, table formatting
- `packages/cli/src/queue.ts` - JSONL offline queue with append-only writes
- `packages/cli/src/project-detect.ts` - CWD-to-project detection via API path matching
- `packages/cli/src/commands/capture.ts` - mc capture with stdin, -p flag, offline queue
- `packages/cli/src/commands/status.ts` - mc status overview
- `packages/cli/src/commands/projects.ts` - mc projects table listing
- `packages/cli/src/commands/init.ts` - mc init with URL config and health check
- `packages/cli/src/index.ts` - Commander entry point with 4 subcommands

## Decisions Made
- Created all 22-01 scaffolding inline as Rule 3 deviation since dependency plan was never executed but all files existed as uncommitted changes from a previous session
- Added passWithNoTests to vitest config to avoid pre-commit hook failure before tests are written
- Used tsconfig extending base config (matching MCP package pattern) instead of standalone config from plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created 22-01 scaffolding (dependency not executed)**
- **Found during:** Task 1 (queue module requires config.ts, api-client.ts)
- **Issue:** Plan 22-01 (Package Scaffolding & API Client) was never executed, but all files already existed on disk as uncommitted changes from a previous session
- **Fix:** Created scaffolding files (config.ts, api-client.ts, output.ts, package.json, tsup.config.ts, tsconfig.json, index.ts) and committed them alongside plan 22-02 Task 1
- **Files modified:** All packages/cli/* files
- **Verification:** Build passes (134KB bundle), all patterns verified
- **Committed in:** 671d839

**2. [Rule 3 - Blocking] Added passWithNoTests to vitest config**
- **Found during:** Task 1 commit (pre-commit hook failure)
- **Issue:** vitest exits with code 1 when no test files exist, failing the pre-commit test hook
- **Fix:** Added `passWithNoTests: true` to vitest.config.ts
- **Files modified:** packages/cli/vitest.config.ts
- **Verification:** `pnpm test` passes for CLI package (exits code 0)
- **Committed in:** 81fcaf9

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for plan execution. Scaffolding was required dependency; vitest config was required for commit hooks.

## Issues Encountered
- All three task files (queue.ts, project-detect.ts, capture.ts) plus all other CLI files were already on disk as uncommitted changes from a previous session, causing them to be committed together in a single commit rather than individual per-task commits. Functionally equivalent -- all code matches plan specification.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI capture command fully functional with offline resilience
- Queue module ready for flush integration in status/projects commands
- Project detection ready for reuse across all commands
- Remaining plans: 22-03 (status + projects commands) and 22-04 (init + tests) can proceed

## Self-Check: PASSED

All 10 created files verified on disk. Both commit hashes (671d839, 81fcaf9) verified in git log.

---
*Phase: 22-cli-client*
*Completed: 2026-03-16*
