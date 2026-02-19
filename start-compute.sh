#!/bin/bash
# Start compute node on MacBook Air (on-demand, not launchd)
cd "$(dirname "$0")/packages/compute" || exit 1

export HUB_URL=http://100.96.194.75:3000
export HOSTNAME=macbook-air
export PORT=3001
export SANDBOX_ENABLED=true
export SANDBOX_WORKDIR=/tmp/mission-sandbox
export LOG_LEVEL=debug

mkdir -p "$SANDBOX_WORKDIR"
echo "Starting MacBook Air compute node on port $PORT..."
echo "Hub: $HUB_URL"
exec node dist/index.js
