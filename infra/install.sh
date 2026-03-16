#!/usr/bin/env bash
set -euo pipefail

# Mission Control - Mac Mini Install Script
# Follows mac-mini-ops v1.0 conventions: /opt/services/<name>/
# Compatible with `svc` CLI management

SERVICE_NAME="mission-control"
SERVICE_DIR="/opt/services/${SERVICE_NAME}"
PLIST_NAME="com.quartermint.${SERVICE_NAME}.plist"
PLIST_SRC="$(cd "$(dirname "$0")" && pwd)/${SERVICE_NAME}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${PLIST_NAME}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Mission Control Installer ==="
echo "Service dir: ${SERVICE_DIR}"
echo "Source repo: ${REPO_DIR}"
echo ""

# -- 1. Create service directory ------------------------------------------
if [ ! -d "${SERVICE_DIR}" ]; then
    echo "Creating ${SERVICE_DIR}..."
    sudo mkdir -p "${SERVICE_DIR}"
    sudo chown "$(whoami)" "${SERVICE_DIR}"
fi

# Create logs directory
mkdir -p "${SERVICE_DIR}/logs"
mkdir -p "${SERVICE_DIR}/data"

# -- 2. Sync source code --------------------------------------------------
echo "Syncing source code to ${SERVICE_DIR}..."
rsync -a --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    --exclude='data/*.db' \
    --exclude='data/*.db-wal' \
    --exclude='data/*.db-shm' \
    --exclude='.planning' \
    "${REPO_DIR}/" "${SERVICE_DIR}/"

# -- 3. Install dependencies ----------------------------------------------
echo "Installing dependencies..."
cd "${SERVICE_DIR}"
pnpm install --frozen-lockfile --prod=false

# -- 4. Copy config if not present ----------------------------------------
if [ ! -f "${SERVICE_DIR}/mc.config.json" ]; then
    if [ -f "${REPO_DIR}/mc.config.json" ]; then
        echo "Copying mc.config.json..."
        cp "${REPO_DIR}/mc.config.json" "${SERVICE_DIR}/mc.config.json"
    else
        echo "WARNING: No mc.config.json found. Copy mc.config.example.json and customize."
    fi
fi

# -- 5. Install launchd plist ---------------------------------------------
echo "Installing launchd plist..."
if launchctl list "${PLIST_NAME%.plist}" &>/dev/null 2>&1; then
    echo "Stopping existing service..."
    launchctl unload "${PLIST_DST}" 2>/dev/null || true
fi

cp "${PLIST_SRC}" "${PLIST_DST}"

# -- 6. Load and start ----------------------------------------------------
echo "Loading service..."
launchctl load "${PLIST_DST}"

echo ""
echo "=== Installation complete ==="
echo "Service: ${PLIST_NAME}"
echo "Status:  launchctl list | grep mission-control"
echo "Logs:    tail -f ${SERVICE_DIR}/logs/stdout.log"
echo "Stop:    launchctl unload ${PLIST_DST}"
echo "Start:   launchctl load ${PLIST_DST}"
