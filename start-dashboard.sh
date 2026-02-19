#!/bin/bash
# Start Mission Control monitoring dashboard
# Accessible over tailnet at http://100.73.138.51:8080
cd "$(dirname "$0")/dashboard" || exit 1

export HUB_URL="${HUB_URL:-http://100.96.194.75:3000}"
export ZEROCLAW_URL="${ZEROCLAW_URL:-http://100.96.194.75:4000}"
export DASHBOARD_PORT="${DASHBOARD_PORT:-8080}"
export RUST_LOG="${RUST_LOG:-info}"

echo "Starting Mission Control Dashboard on port $DASHBOARD_PORT..."
echo "Hub: $HUB_URL"
echo "ZeroClaw: $ZEROCLAW_URL"

exec ./target/release/mission-dashboard
