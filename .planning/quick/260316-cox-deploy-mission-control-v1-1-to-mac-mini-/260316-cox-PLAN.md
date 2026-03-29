---
type: quick
autonomous: true
files_modified:
  - infra/deploy.sh
  - infra/mc-update-watcher.sh
  - infra/com.quartermint.mc-update-watcher.plist
  - infra/install.sh
  - infra/mc.config.mac-mini.json
  - packages/api/src/index.ts
---

<objective>
Deploy Mission Control v1.1 to the Mac Mini as a persistent, self-updating service accessible via Tailscale.

Purpose: MC is the browser homepage -- it needs to run on the Mac Mini 24/7, auto-update when new git tags are pushed, and serve both the API and the dashboard from a single :3000 endpoint.

Output: MC API + dashboard live on http://100.x.x.x:3000 (or http://mac-mini-host:3000), with auto-update watcher detecting new tags.
</objective>

<context>
@.planning/STATE.md
@CLAUDE.md
@infra/install.sh (existing installer -- rsync + pnpm + launchd)
@infra/mission-control.plist (existing launchd plist -- tsx runner on :3000)
@packages/api/src/index.ts (API entry point -- no static serving yet)
@packages/web/vite.config.ts (Vite build -- outputs to packages/web/dist/)
@mc.config.json (project registry -- paths are MacBook-local, need Mac Mini version)

Key facts:
- Repo remote: git@github.com:sternryan/mission-control.git
- Existing tags: v1.0, v1.1
- Mac Mini SSH: mac-mini-host (100.x.x.x)
- Service dir: /opt/services/mission-control/
- Plist uses tsx to run API from source (no build step for API)
- Web frontend needs `pnpm build` (Vite) then static serving
- No `gh` CLI on Mac Mini -- use git directly
- Mac Mini already has: pnpm, node, tsx (used by other services)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add production static serving + deploy.sh + Mac Mini config</name>
  <files>
    packages/api/src/index.ts
    infra/deploy.sh
    infra/install.sh
    infra/mc.config.mac-mini.json
  </files>
  <action>
**1a. Add static file serving to the API for production.**

In `packages/api/src/index.ts`, after the server starts, the API already serves on :3000. For production, the Hono API needs to serve the built web assets. Add a conditional static file middleware:

- Import `serveStatic` from `@hono/node-server/serve-static` (already a dependency via @hono/node-server)
- In `src/app.ts` (where routes are composed), add a catch-all AFTER all `/api/*` routes that serves static files from a configurable path. In production (NODE_ENV=production), serve from `../web/dist/` relative to the api package. This means the built web assets at `/opt/services/mission-control/packages/web/dist/` get served by Hono.
- The catch-all should serve `index.html` for any non-API, non-file route (SPA fallback).
- Use `@hono/node-server/serve-static` which reads from the filesystem.
- Only add these routes when `NODE_ENV === 'production'` -- dev mode continues to use Vite's dev server with proxy.

Check if `@hono/node-server` already exports `serveStatic`. If not, use Node.js fs to read and serve files manually (simple approach: read file, set content-type, return). Keep it minimal -- this is a single-user app.

**1b. Create `infra/deploy.sh`** -- the update/redeploy script the watcher will call:

```bash
#!/usr/bin/env bash
set -euo pipefail
# deploy.sh -- Pull latest code, rebuild, restart MC service
# Called by the update watcher or manually

SERVICE_DIR="/opt/services/mission-control"
PLIST_NAME="com.quartermint.mission-control"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
LOG_FILE="${SERVICE_DIR}/logs/deploy.log"

exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== Deploy started at $(date) ==="

cd "$SERVICE_DIR"

# Pull latest
git fetch origin --tags
git checkout main
git pull origin main

# Install deps
pnpm install --frozen-lockfile --prod=false

# Build web assets
pnpm --filter @mission-control/web build

# Restart service
launchctl unload "$PLIST_PATH" 2>/dev/null || true
sleep 1
launchctl load "$PLIST_PATH"

echo "=== Deploy complete at $(date) ==="
echo "API: http://$(hostname):3000"
```

Make executable (chmod +x).

**1c. Update `infra/install.sh`** to use git clone instead of rsync (the Mac Mini needs its own git repo for the watcher to pull from):

- Change Step 2 from rsync to: if SERVICE_DIR/.git exists, run `git pull`; otherwise, `git clone <repo-url> $SERVICE_DIR`
- After clone/pull, run `pnpm install --frozen-lockfile --prod=false`
- Add Step 2.5: `pnpm --filter @mission-control/web build` (build web assets)
- Keep the existing config copy, plist install, and launchd load steps
- Copy mc.config.mac-mini.json as mc.config.json if no config exists yet

**1d. Create `infra/mc.config.mac-mini.json`** -- a config file with Mac Mini paths:

Take mc.config.json but update project paths to Mac Mini locations. Projects that exist on Mac Mini (host: "mac-mini" in current config) keep their paths. Projects on MacBook (host: "local") should either:
- Point to Mac Mini paths if the repos exist there (mac-mini-bridge, pixvault, msgvault, lifevault, rss_rawdata, throughline are on Mac Mini)
- Be removed or left with empty paths for MacBook-only projects (they won't scan but that's fine -- MC on Mac Mini will scan what's available)

Set `macMiniSshHost` to `"localhost"` (it IS the Mac Mini). Set `dataDir` to `"./data"`.

For project paths on Mac Mini, use `/Users/ryanstern/<project>` (Mac Mini has same username).
  </action>
  <verify>
    <automated>cd /Users/ryanstern/mission-control && pnpm typecheck</automated>
  </verify>
  <done>
- API serves static web assets in production mode (NODE_ENV=production)
- deploy.sh exists and is executable
- install.sh uses git clone (not rsync) for Mac Mini deployment
- mc.config.mac-mini.json has Mac Mini-appropriate paths
  </done>
</task>

<task type="auto">
  <name>Task 2: Create auto-update watcher + launchd plist for watcher</name>
  <files>
    infra/mc-update-watcher.sh
    infra/com.quartermint.mc-update-watcher.plist
  </files>
  <action>
**2a. Create `infra/mc-update-watcher.sh`** -- a script that checks for new git tags and triggers deploy:

```bash
#!/usr/bin/env bash
set -euo pipefail
# mc-update-watcher.sh -- Check for new git tags, deploy if found
# Runs on a schedule via launchd (every 5 minutes)

SERVICE_DIR="/opt/services/mission-control"
DEPLOY_SCRIPT="${SERVICE_DIR}/infra/deploy.sh"
TAG_FILE="${SERVICE_DIR}/logs/.last-deployed-tag"
LOG_FILE="${SERVICE_DIR}/logs/watcher.log"

exec > >(tee -a "$LOG_FILE") 2>&1

cd "$SERVICE_DIR"

# Fetch latest tags from remote
git fetch origin --tags --quiet 2>/dev/null || { echo "$(date): fetch failed"; exit 0; }

# Get the latest tag (sorted by version)
LATEST_TAG=$(git tag -l 'v*' --sort=-version:refname | head -1)

if [ -z "$LATEST_TAG" ]; then
  echo "$(date): No tags found"
  exit 0
fi

# Read last deployed tag
LAST_TAG=""
if [ -f "$TAG_FILE" ]; then
  LAST_TAG=$(cat "$TAG_FILE")
fi

# Compare
if [ "$LATEST_TAG" = "$LAST_TAG" ]; then
  # Already deployed, nothing to do (silent -- don't spam logs)
  exit 0
fi

echo "$(date): New tag detected: $LATEST_TAG (was: ${LAST_TAG:-none})"

# Checkout the tag
git checkout "$LATEST_TAG"

# Run deploy
bash "$DEPLOY_SCRIPT"

# Record deployed tag
echo "$LATEST_TAG" > "$TAG_FILE"
echo "$(date): Successfully deployed $LATEST_TAG"
```

Make executable (chmod +x).

Important design choices:
- The watcher checks every 5 minutes (via launchd interval)
- It compares the latest `v*` tag against a `.last-deployed-tag` file
- Silent when no update needed (avoids log spam)
- Uses `git checkout $TAG` to deploy specific versions (not HEAD of main)
- The deploy.sh it calls will handle the actual build + restart

**2b. Create `infra/com.quartermint.mc-update-watcher.plist`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.quartermint.mc-update-watcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/opt/services/mission-control/infra/mc-update-watcher.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>  <!-- every 5 minutes -->
    <key>WorkingDirectory</key>
    <string>/opt/services/mission-control</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/opt/services/mission-control/logs/watcher-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/opt/services/mission-control/logs/watcher-stderr.log</string>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

Update `infra/install.sh` to also install this watcher plist alongside the main MC plist (copy to ~/Library/LaunchAgents/, launchctl load).
  </action>
  <verify>
    <automated>bash -n /Users/ryanstern/mission-control/infra/mc-update-watcher.sh && bash -n /Users/ryanstern/mission-control/infra/deploy.sh && echo "Scripts are syntactically valid"</automated>
  </verify>
  <done>
- mc-update-watcher.sh exists and is executable, checks for new v* tags every 5 minutes
- Watcher launchd plist exists with 300-second interval
- install.sh installs both the MC service plist AND the watcher plist
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
Complete Mac Mini deployment infrastructure:
1. API serves static web assets in production (Hono serveStatic)
2. deploy.sh for pull + build + restart
3. mc-update-watcher.sh for tag-based auto-updates (every 5 min)
4. launchd plists for both MC service and watcher
5. install.sh updated to git clone + build flow
6. mc.config.mac-mini.json with Mac Mini paths
  </what-built>
  <how-to-verify>
1. SSH to Mac Mini: `ssh mac-mini-host`
2. Run installer: `bash /path/to/mission-control/infra/install.sh` (from MacBook, scp the repo first, OR clone on Mac Mini directly)
   - Actually: on Mac Mini, clone the repo first:
     ```
     sudo mkdir -p /opt/services/mission-control
     sudo chown $(whoami) /opt/services/mission-control
     git clone git@github.com:sternryan/mission-control.git /opt/services/mission-control
     cd /opt/services/mission-control
     bash infra/install.sh
     ```
3. Check service is running: `launchctl list | grep mission-control`
4. Check watcher is running: `launchctl list | grep mc-update-watcher`
5. Visit http://mac-mini-host:3000 in browser -- should see MC dashboard
6. Check API: `curl http://localhost:3000/api/health` on Mac Mini
7. Check logs: `tail /opt/services/mission-control/logs/stdout.log`
  </how-to-verify>
  <resume-signal>Type "approved" if MC is serving from Mac Mini, or describe issues</resume-signal>
</task>

</tasks>

<verification>
- `pnpm typecheck` passes (static serving changes compile)
- `bash -n infra/deploy.sh` passes (valid bash syntax)
- `bash -n infra/mc-update-watcher.sh` passes (valid bash syntax)
- After deployment: `curl http://mac-mini-host:3000/api/health` returns 200
- After deployment: `http://mac-mini-host:3000` serves the dashboard
</verification>

<success_criteria>
- Mission Control API running on Mac Mini :3000 via launchd (KeepAlive)
- Dashboard accessible at http://mac-mini-host:3000 from any Tailscale device
- Auto-update watcher checks for new v* tags every 5 minutes
- New tag push triggers automatic redeploy (pull, build, restart)
- mc.config.json on Mac Mini has correct paths for Mac Mini-local projects
</success_criteria>
