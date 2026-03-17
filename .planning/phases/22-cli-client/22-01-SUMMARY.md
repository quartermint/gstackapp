---
phase: 22-cli-client
plan: 01
subsystem: cli
tags: [commander, tsup, fetch, typescript, cli]

# Dependency graph
requires:
  - phase: 10-mcp-server
    provides: tsup bundle pattern (noExternal, shebang, ESM)
provides:
  - "@mission-control/cli package scaffolding"
  - "Config module (~/.mc/config.json) with Tailscale default URL"
  - "API client with 5s timeout and McApiUnreachable/McApiError"
  - "Output helpers with NO_COLOR support and table formatting"
  - "Commander.js CLI entry point with 4 subcommands"
affects: [22-02, 22-03, 22-04]

# Tech tracking
tech-stack:
  added: [commander, tsup (cli bundle)]
  patterns: [plain fetch with AbortController timeout, ~/.mc config directory, NO_COLOR env support]

key-files:
  created:
    - packages/cli/package.json
    - packages/cli/tsup.config.ts
    - packages/cli/tsconfig.json
    - packages/cli/vitest.config.ts
    - packages/cli/src/index.ts
    - packages/cli/src/config.ts
    - packages/cli/src/api-client.ts
    - packages/cli/src/output.ts
  modified:
    - pnpm-lock.yaml

key-decisions:
  - "Mirrored MCP package tsup config exactly (noExternal bundles all deps inline)"
  - "tsconfig extends base config with composite:false (matches MCP pattern)"
  - "Added vitest.config.ts with passWithNoTests for empty test suite during scaffolding"

patterns-established:
  - "CLI package follows MCP bundle pattern: tsup noExternal, shebang banner, ESM only"
  - "API client uses McApiUnreachable error class for offline queue detection"
  - "Config stored at ~/.mc/config.json with default Tailscale URL fallback"

requirements-completed: [CLI-09]

# Metrics
duration: 5min
completed: 2026-03-17
---

# Phase 22 Plan 01: Package Scaffolding & API Client Summary

**CLI package scaffold with Commander.js entry point, ~/.mc config system, and fetch-based API client with 5s timeout**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-16T23:55:10Z
- **Completed:** 2026-03-17T00:00:58Z
- **Tasks:** 7
- **Files modified:** 9

## Accomplishments
- Created @mission-control/cli package following MCP tsup bundle pattern (noExternal, shebang, ESM)
- Config module reads/writes ~/.mc/config.json with Mac Mini Tailscale IP default
- API client wraps fetch with 5-second AbortController timeout and typed error classes
- Output helpers respect NO_COLOR env var with table formatting and relative time
- Commander.js entry point wired with 4 subcommands (capture, status, projects, init)

## Task Commits

Each task was committed atomically:

1. **Tasks 1-7: Package scaffolding + config + API client + output + entry point** - `671d839` (feat) - prior session commit
2. **Vitest config addition** - `81fcaf9` (feat) - vitest.config.ts with passWithNoTests

**Plan metadata:** (pending docs commit)

## Files Created/Modified
- `packages/cli/package.json` - Package definition with bin field, commander dep, ESM
- `packages/cli/tsup.config.ts` - Build config mirroring MCP pattern
- `packages/cli/tsconfig.json` - TypeScript config extending base
- `packages/cli/vitest.config.ts` - Test config with passWithNoTests for empty suite
- `packages/cli/src/index.ts` - Commander.js entry point with 4 subcommands
- `packages/cli/src/config.ts` - ~/.mc/config.json read/write with Tailscale default
- `packages/cli/src/api-client.ts` - Fetch-based API client with 5s timeout
- `packages/cli/src/output.ts` - NO_COLOR-aware output helpers (colors, table, relativeTime)
- `pnpm-lock.yaml` - Updated with commander dependency

## Decisions Made
- Mirrored MCP package tsup config exactly (noExternal bundles all deps inline, shebang banner)
- tsconfig extends base config with composite:false matching MCP package pattern
- Added vitest.config.ts with passWithNoTests to handle empty test suite during scaffolding phase

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added vitest.config.ts for test runner compatibility**
- **Found during:** Task 1 (initial commit attempt)
- **Issue:** CLI package's `vitest run` resolved root vitest.config.ts which imports vitest/config but CLI node_modules didn't have vitest hoisted
- **Fix:** Created local vitest.config.ts with passWithNoTests matching API/MCP pattern
- **Files modified:** packages/cli/vitest.config.ts
- **Verification:** Build and test pass cleanly via turbo
- **Committed in:** 81fcaf9

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for build pipeline compatibility. No scope creep.

## Issues Encountered
- Prior session (commit 671d839) had already implemented all 7 tasks. This execution verified completeness, added missing vitest config, and documented the work.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI package builds successfully (134KB bundle)
- Config, API client, and output modules ready for command implementations
- Commander.js entry point wired for capture, status, projects, init subcommands
- Plans 22-02 through 22-04 can proceed with command implementations

## Self-Check: PASSED

All 8 created files verified present. Both commits (671d839, 81fcaf9) verified in git log. Build passes (134KB ESM bundle with shebang). All 5 must-haves verified.

---
*Phase: 22-cli-client*
*Completed: 2026-03-17*
