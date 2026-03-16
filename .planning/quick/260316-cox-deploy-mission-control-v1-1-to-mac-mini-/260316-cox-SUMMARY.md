---
type: quick
subsystem: infra
tags: [deploy, launchd, mac-mini, hono, serve-static, auto-update]

provides:
  - Production static file serving (Hono serveStatic in NODE_ENV=production)
  - deploy.sh for git pull + pnpm build + launchd restart
  - mc-update-watcher.sh for tag-based auto-deploy (5-min interval)
  - Watcher launchd plist (com.quartermint.mc-update-watcher)
  - install.sh updated to git clone + build + watcher install
  - mc.config.mac-mini.json with Mac Mini project paths

key-files:
  created:
    - infra/deploy.sh
    - infra/mc-update-watcher.sh
    - infra/com.quartermint.mc-update-watcher.plist
    - infra/mc.config.mac-mini.json
  modified:
    - packages/api/src/app.ts
    - infra/install.sh

key-decisions:
  - "serveStatic root relative to CWD (./packages/web/dist) -- works with launchd WorkingDirectory"
  - "Static serving guarded by NODE_ENV=production -- dev mode unchanged"
  - "Watcher uses git tag comparison (not HEAD) for versioned deployments"
  - "Mac Mini config sets macMiniSshHost to localhost and includes only Mac Mini-local + GitHub projects"

duration: 3min
completed: 2026-03-16
status: awaiting-deployment
---

# Quick Task: Deploy Mission Control v1.1 to Mac Mini

**Hono production static serving, git-clone installer, tag-based auto-update watcher with launchd plists**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-16T16:12:13Z
- **Completed:** 2026-03-16T16:15:54Z
- **Tasks:** 2 of 3 (Task 3 is manual deployment checkpoint)
- **Files modified:** 6

## Accomplishments

- API serves built web assets in production via `@hono/node-server/serve-static` with SPA fallback
- Created `deploy.sh` for pull + build + restart workflow (called by watcher or manually)
- Created `mc-update-watcher.sh` that polls for new `v*` tags every 5 minutes via launchd
- Updated `install.sh` from rsync to git clone, added web build step and watcher plist installation
- Created `mc.config.mac-mini.json` with Mac Mini-local project paths (7 local repos + 13 GitHub repos)

## Task Commits

Each task was committed atomically:

1. **Task 1: Static serving + deploy.sh + install.sh + Mac Mini config** - `14cd609` (feat)
2. **Task 2: Update watcher + launchd plist** - `ec4bf52` (feat)
3. **Task 3: Manual deployment verification** - PENDING (checkpoint:human-verify)

## Files Created/Modified

- `packages/api/src/app.ts` - Added serveStatic middleware for production (static files + SPA fallback)
- `infra/deploy.sh` - Git pull + pnpm install + web build + launchd restart
- `infra/install.sh` - Updated to git clone (not rsync), added web build, watcher plist install
- `infra/mc.config.mac-mini.json` - Mac Mini config with local paths for Mac Mini repos
- `infra/mc-update-watcher.sh` - Tag-based auto-update checker (polls every 5 min)
- `infra/com.quartermint.mc-update-watcher.plist` - Launchd plist for watcher (300s interval, RunAtLoad)

## Decisions Made

- Used `@hono/node-server/serve-static` with `root: "./packages/web/dist"` relative to CWD (launchd sets WorkingDirectory to /opt/services/mission-control)
- Static serving is production-only (`NODE_ENV === "production"` guard) so dev mode with Vite proxy is unaffected
- Watcher compares latest `v*` tag against `.last-deployed-tag` file -- silent when no update to avoid log spam
- Watcher checks out the specific tag (not HEAD of main) for versioned deployments
- Mac Mini config sets `macMiniSshHost: "localhost"` since MC is running on the Mac Mini itself
- Mac Mini config includes only projects that exist on Mac Mini (mac-mini-bridge, pixvault, msgvault, throughline, lifevault, rss_rawdata, foundry, streamline) plus all GitHub-hosted projects

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Manual Deployment Required

Task 3 is a checkpoint requiring manual deployment to Mac Mini. Steps:

1. SSH to Mac Mini: `ssh ryans-mac-mini`
2. Clone the repo:
   ```bash
   sudo mkdir -p /opt/services/mission-control
   sudo chown $(whoami) /opt/services/mission-control
   git clone git@github.com:vanboompow/mission-control.git /opt/services/mission-control
   cd /opt/services/mission-control
   bash infra/install.sh
   ```
3. Verify service: `launchctl list | grep mission-control`
4. Verify watcher: `launchctl list | grep mc-update-watcher`
5. Visit: http://ryans-mac-mini:3000
6. Check API: `curl http://localhost:3000/api/health`
7. Check logs: `tail /opt/services/mission-control/logs/stdout.log`

## Self-Check: PASSED

- All 4 created files exist and verified
- Both commits (14cd609, ec4bf52) exist in git log
- Both shell scripts are executable
- All 3 shell scripts pass `bash -n` syntax validation
- `pnpm typecheck` passes clean (all 4 packages)
- `pnpm test` passes clean (462 tests across 3 packages)

---
*Quick task: 260316-cox*
*Completed: 2026-03-16 (deployment pending)*
