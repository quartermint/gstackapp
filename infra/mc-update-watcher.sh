#!/bin/bash
set -euo pipefail

# mc-update-watcher.sh -- Check for new git tags, deploy if found
# Runs on a schedule via launchd (every 5 minutes)

# Explicit PATH for launchd context (nvm for node/pnpm, homebrew for git)
export PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$HOME/.local/share/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

SERVICE_DIR="/opt/services/mission-control"
DEPLOY_SCRIPT="${SERVICE_DIR}/infra/deploy.sh"
TAG_FILE="${SERVICE_DIR}/logs/.last-deployed-tag"
LOG_FILE="${SERVICE_DIR}/logs/watcher.log"

mkdir -p "${SERVICE_DIR}/logs"

# Redirect to log (compatible with macOS /bin/bash 3.2)
exec >> "$LOG_FILE" 2>&1

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
