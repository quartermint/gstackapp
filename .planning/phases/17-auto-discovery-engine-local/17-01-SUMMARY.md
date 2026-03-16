---
phase: 17-auto-discovery-engine-local
plan: 01
subsystem: api
tags: [discovery, git, scanner, sqlite, drizzle, sse, event-bus]

# Dependency graph
requires:
  - phase: 16-data-foundation
    provides: discoveries table schema and migration
provides:
  - Discovery database query module (CRUD for discoveries table)
  - Discovery scanner service (depth-1 filesystem walk, git probe, promote, dismiss)
  - SSE event types for discovery lifecycle (found, promoted, dismissed)
  - Background discovery timer function
affects: [17-02 (routes), 17-03 (tests), dashboard discovery UI]

# Tech tracking
tech-stack:
  added: []
  patterns: [depth-1 directory walk with opendir, atomic JSON config write via tmp+rename, pLimit concurrency for git probes]

key-files:
  created:
    - packages/api/src/db/queries/discoveries.ts
    - packages/api/src/services/discovery-scanner.ts
  modified:
    - packages/api/src/services/event-bus.ts

key-decisions:
  - "Underscore-prefixed _config param in promoteDiscovery to maintain API signature for Plan 02 routes while satisfying strict TypeScript unused checks"
  - "Single sh -c invocation for probeGitRepo combines commit count + remote URL + last commit date to minimize process spawns"

patterns-established:
  - "Discovery scanner pattern: opendir + pLimit(5) parallel git probes at depth-1"
  - "Atomic config write: writeFileSync to .tmp then renameSync for crash-safe mc.config.json updates"

requirements-completed: [DISC-01, DISC-04]

# Metrics
duration: 4min
completed: 2026-03-16
---

# Phase 17 Plan 01: Discovery Scanner + Query Module Summary

**Depth-1 filesystem discovery scanner with git metadata extraction, CRUD query module, and atomic promote/dismiss lifecycle via SQLite + SSE events**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-16T20:44:31Z
- **Completed:** 2026-03-16T20:49:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Discovery query module with upsert (path+host conflict-aware), list with filters/pagination, get, updateStatus, getDismissedPaths, and getDiscoveryByPath
- Discovery scanner service that walks configured root dirs at depth-1, skips excluded dirs/tracked/dismissed/0-commit repos, and persists findings
- Promote flow: status update, atomic mc.config.json write (tmp+rename), project table upsert, single-project scan trigger, SSE event
- Dismiss flow: permanent status update preventing re-surfacing, SSE event
- Background timer function with configurable interval from discovery config
- Event bus extended with discovery:found, discovery:promoted, discovery:dismissed

## Task Commits

Each task was committed atomically:

1. **Task 1: Create discovery database query module** - `00b4d48` (feat)
2. **Task 2: Create discovery scanner service** - `47f8c90` (feat)

## Files Created/Modified
- `packages/api/src/db/queries/discoveries.ts` - CRUD operations for discoveries table (upsert, list, get, updateStatus, getDismissedPaths, getDiscoveryByPath)
- `packages/api/src/services/discovery-scanner.ts` - Filesystem discovery scanner (scanForDiscoveries, promoteDiscovery, dismissDiscovery, startDiscoveryScanner)
- `packages/api/src/services/event-bus.ts` - Added 3 discovery event types to MCEventType union

## Decisions Made
- Used underscore prefix (_config) for unused MCConfig parameter in promoteDiscovery to maintain the API contract Plan 02 routes expect while passing strict TypeScript checks
- Single sh -c invocation in probeGitRepo to minimize process spawns (commit count + remote URL + last commit date in one call)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused variable in updateDiscoveryStatus**
- **Found during:** Task 1 (Discovery query module)
- **Issue:** `const existing = getDiscovery(db, id)` assigned to unused variable, causing TS6133 error
- **Fix:** Changed to `getDiscovery(db, id)` call without assignment (still validates existence)
- **Files modified:** packages/api/src/db/queries/discoveries.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** 00b4d48 (Task 1 commit)

**2. [Rule 1 - Bug] Removed unused ProjectConfigEntry import and fixed unused config parameter**
- **Found during:** Task 2 (Discovery scanner service)
- **Issue:** Imported `ProjectConfigEntry` type was unused (TS6196), and `config: MCConfig` parameter in promoteDiscovery was unused (TS6133)
- **Fix:** Removed unused import, prefixed parameter with underscore `_config`
- **Files modified:** packages/api/src/services/discovery-scanner.ts
- **Verification:** pnpm typecheck passes
- **Committed in:** 47f8c90 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs - unused variables/imports)
**Impact on plan:** Minor TypeScript strict-mode compliance fixes. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Discovery query module and scanner service are ready for Plan 02 (API routes)
- Event bus types are in place for SSE streaming
- startDiscoveryScanner ready for server.ts integration
- All 442 tests pass, zero regressions

## Self-Check: PASSED

All created files exist. All commit hashes verified in git log.

---
*Phase: 17-auto-discovery-engine-local*
*Completed: 2026-03-16*
