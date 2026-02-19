#!/bin/bash
# Start Mission Control monitoring dashboard
# Accessible over tailnet at http://100.x.x.x:8080
cd "$(dirname "$0")/dashboard" || exit 1

export HUB_URL="${HUB_URL:-http://100.x.x.x:3000}"
export ZEROCLAW_URL="${ZEROCLAW_URL:-http://100.x.x.x:4000}"
export DASHBOARD_PORT="${DASHBOARD_PORT:-8080}"
export RUST_LOG="${RUST_LOG:-info}"

echo "Starting Mission Control Dashboard on port $DASHBOARD_PORT..."
echo "Hub: $HUB_URL"
echo "ZeroClaw: $ZEROCLAW_URL"

exec ./target/release/mission-dashboard
