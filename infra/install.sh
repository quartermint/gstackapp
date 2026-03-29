#!/usr/bin/env bash
set -euo pipefail

# Mission Control - Mac Mini Install Script
# Follows mac-mini-ops v1.0 conventions: /opt/services/<name>/
# Compatible with `svc` CLI management

SERVICE_NAME="mission-control"
SERVICE_DIR="/opt/services/${SERVICE_NAME}"
REPO_URL="git@github.com:quartermint/mission-control.git"
INFRA_DIR="$(cd "$(dirname "$0")" && pwd)"
PLIST_NAME="com.quartermint.${SERVICE_NAME}.plist"
PLIST_SRC="${INFRA_DIR}/${SERVICE_NAME}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${PLIST_NAME}"
WATCHER_PLIST_NAME="com.quartermint.mc-update-watcher.plist"
WATCHER_PLIST_SRC="${INFRA_DIR}/${WATCHER_PLIST_NAME}"
WATCHER_PLIST_DST="$HOME/Library/LaunchAgents/${WATCHER_PLIST_NAME}"

echo "=== Mission Control Installer ==="
echo "Service dir: ${SERVICE_DIR}"
echo "Repo:        ${REPO_URL}"
echo ""

# -- 1. Create service directory ------------------------------------------
if [ ! -d "${SERVICE_DIR}" ]; then
    echo "Creating ${SERVICE_DIR}..."
    sudo mkdir -p "${SERVICE_DIR}"
    sudo chown "$(whoami)" "${SERVICE_DIR}"
fi

# Create logs and data directories
mkdir -p "${SERVICE_DIR}/logs"
mkdir -p "${SERVICE_DIR}/data"

# -- 2. Clone or pull source code -----------------------------------------
if [ -d "${SERVICE_DIR}/.git" ]; then
    echo "Repo exists, pulling latest..."
    cd "${SERVICE_DIR}"
    git fetch origin --tags
    git pull origin main
else
    echo "Cloning repo to ${SERVICE_DIR}..."
    git clone "${REPO_URL}" "${SERVICE_DIR}"
    cd "${SERVICE_DIR}"
fi

# -- 3. Install dependencies ----------------------------------------------
echo "Installing dependencies..."
pnpm install --frozen-lockfile --prod=false

# -- 4. Build web assets --------------------------------------------------
echo "Building web frontend..."
pnpm --filter @mission-control/web build

# -- 5. Copy config if not present ----------------------------------------
if [ ! -f "${SERVICE_DIR}/mc.config.json" ]; then
    if [ -f "${SERVICE_DIR}/infra/mc.config.mac-mini.json" ]; then
        echo "Copying Mac Mini config..."
        cp "${SERVICE_DIR}/infra/mc.config.mac-mini.json" "${SERVICE_DIR}/mc.config.json"
    else
        echo "WARNING: No mc.config.mac-mini.json found. Copy mc.config.example.json and customize."
    fi
fi

# -- 6. Install MC service launchd plist ----------------------------------
echo "Installing MC service plist..."
if launchctl list "${PLIST_NAME%.plist}" &>/dev/null 2>&1; then
    echo "Stopping existing MC service..."
    launchctl unload "${PLIST_DST}" 2>/dev/null || true
fi

cp "${PLIST_SRC}" "${PLIST_DST}"

# -- 7. Install update watcher launchd plist ------------------------------
echo "Installing update watcher plist..."
if launchctl list "${WATCHER_PLIST_NAME%.plist}" &>/dev/null 2>&1; then
    echo "Stopping existing watcher..."
    launchctl unload "${WATCHER_PLIST_DST}" 2>/dev/null || true
fi

if [ -f "${WATCHER_PLIST_SRC}" ]; then
    cp "${WATCHER_PLIST_SRC}" "${WATCHER_PLIST_DST}"
else
    echo "WARNING: Watcher plist not found at ${WATCHER_PLIST_SRC}, skipping."
fi

# -- 8. Load and start ----------------------------------------------------
echo "Loading services..."
launchctl load "${PLIST_DST}"

if [ -f "${WATCHER_PLIST_DST}" ]; then
    launchctl load "${WATCHER_PLIST_DST}"
fi

echo ""
echo "=== Installation complete ==="
echo "MC Service:  ${PLIST_NAME}"
echo "Watcher:     ${WATCHER_PLIST_NAME}"
echo "Status:      launchctl list | grep mission-control"
echo "             launchctl list | grep mc-update-watcher"
echo "Logs:        tail -f ${SERVICE_DIR}/logs/stdout.log"
echo "Stop MC:     launchctl unload ${PLIST_DST}"
echo "Stop Watch:  launchctl unload ${WATCHER_PLIST_DST}"
echo "Start MC:    launchctl load ${PLIST_DST}"
echo "Start Watch: launchctl load ${WATCHER_PLIST_DST}"
