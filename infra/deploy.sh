#!/bin/bash
set -euo pipefail

# deploy.sh -- Pull latest code, rebuild, restart MC service
# Called by the update watcher or manually

# Explicit PATH for launchd context
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

SERVICE_DIR="/opt/services/mission-control"
PLIST_NAME="com.quartermint.mission-control"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
LOG_FILE="${SERVICE_DIR}/logs/deploy.log"

mkdir -p "${SERVICE_DIR}/logs"

exec >> "$LOG_FILE" 2>&1
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
