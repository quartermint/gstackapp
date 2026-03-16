---
phase: 11-data-foundation
plan: 03
subsystem: infra
tags: [launchd, bash, mac-mini, deployment, rsync]

# Dependency graph
requires: []
provides:
  - Mac Mini deployment script (install.sh)
  - Launchd service definition (mission-control.plist)
  - /opt/services/mission-control/ convention established
affects: [12-session-ingestion, 13-lm-gateway-budget, 14-intelligence, 15-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [mac-mini-ops v1.0 /opt/services/ convention, launchd KeepAlive + RunAtLoad, rsync deploy with exclusions]

key-files:
  created:
    - infra/install.sh
    - infra/mission-control.plist
  modified: []

key-decisions:
  - "Used tsx runner for plist ProgramArguments (consistent with dev workflow, avoids separate build step)"
  - "rsync with --delete and selective exclusions (preserves DB files, excludes .git and node_modules)"
  - "SoftResourceLimits NumberOfFiles 4096 for SQLite + file watcher headroom"

patterns-established:
  - "mac-mini-ops v1.0: /opt/services/<name>/ directory convention"
  - "launchd plist with KeepAlive + RunAtLoad for auto-restart and boot persistence"
  - "Install script pattern: rsync source, pnpm install, copy config, load plist"

requirements-completed: [INFR-01]

# Metrics
duration: 2min
completed: 2026-03-16
---

# Phase 11 Plan 03: Infrastructure Scripts Summary

**Launchd plist and install script for Mac Mini deployment using /opt/services/ convention with KeepAlive, RunAtLoad, and rsync-based code sync**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-16T14:04:48Z
- **Completed:** 2026-03-16T14:07:24Z
- **Tasks:** 1
- **Files created:** 2

## Accomplishments
- Created launchd plist configuring Mission Control as a persistent background service (com.quartermint.mission-control, port 3000, production NODE_ENV)
- Created install.sh handling full deployment lifecycle: create service dir, rsync source, pnpm install, copy config, install/reload launchd plist
- Both scripts follow mac-mini-ops v1.0 conventions with /opt/services/mission-control/ paths

## Task Commits

Each task was committed atomically:

1. **Task 1: Create launchd plist and install script** - `c1fa213` (feat)

**Plan metadata:** `767578f` (docs: complete plan)

## Files Created/Modified
- `infra/install.sh` - Deployment script: rsync code to /opt/services/, pnpm install, copy config, load launchd plist
- `infra/mission-control.plist` - Launchd service definition: com.quartermint.mission-control, tsx runner, port 3000, KeepAlive + RunAtLoad, log paths

## Decisions Made
- Used tsx runner directly in plist ProgramArguments rather than a build step -- keeps deployment simple and consistent with dev workflow
- rsync deploys with --delete but excludes .git, node_modules, SQLite DB files, and .planning directory
- Set SoftResourceLimits NumberOfFiles to 4096 for SQLite + file watcher headroom
- Install script copies mc.config.json only if not already present at destination (preserves Mac Mini-specific config)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Scripts are ready to run on Mac Mini when Mission Control is deployed.

## Next Phase Readiness
- Infrastructure scripts ready for Mac Mini deployment
- install.sh can be run after any code changes to redeploy
- Future phases can add environment variables to plist as needed (e.g., AI API keys for Phase 14)

## Self-Check: PASSED

All files verified present, all commits verified in git log.

---
*Phase: 11-data-foundation*
*Completed: 2026-03-16*
