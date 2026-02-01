# Infrastructure

Deployment configurations and infrastructure management for Mission Control.

## Overview

This directory contains:
- Systemd service files (Linux)
- Launchd agents (macOS)
- Docker configurations (optional)
- Deployment scripts

## Directory Structure

```
infra/
├── systemd/
│   └── mission-hub.service
├── launchd/
│   └── com.mission-control.compute.plist
├── docker/
│   ├── Dockerfile.hub
│   └── docker-compose.yml
├── scripts/
│   ├── deploy-hub.sh
│   ├── deploy-worker.sh
│   └── health-check.sh
└── tailscale/
    └── acl.json
```

## Hetzner Hub (Systemd)

### Service File

```ini
# /etc/systemd/system/mission-hub.service
[Unit]
Description=Mission Control Hub
After=network.target tailscaled.service
Wants=tailscaled.service

[Service]
Type=simple
User=mission
Group=mission
WorkingDirectory=/home/mission/mission-control/packages/hub
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production
EnvironmentFile=/home/mission/mission-control/.env

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mission-hub

[Install]
WantedBy=multi-user.target
```

### Management

```bash
# Install service
sudo cp infra/systemd/mission-hub.service /etc/systemd/system/
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable mission-hub

# Start/stop/restart
sudo systemctl start mission-hub
sudo systemctl stop mission-hub
sudo systemctl restart mission-hub

# View status
sudo systemctl status mission-hub

# View logs
sudo journalctl -u mission-hub -f
```

## Mac Compute (Launchd)

### Plist File

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mission-control.compute</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/you/mission-control/packages/compute/dist/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/you/mission-control/packages/compute</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>PORT</key>
        <string>3001</string>
    </dict>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/you/Library/Logs/mission-control-compute.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/you/Library/Logs/mission-control-compute.error.log</string>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

### Management

```bash
# Install
cp infra/launchd/com.mission-control.compute.plist ~/Library/LaunchAgents/

# Load (start)
launchctl load ~/Library/LaunchAgents/com.mission-control.compute.plist

# Unload (stop)
launchctl unload ~/Library/LaunchAgents/com.mission-control.compute.plist

# Check status
launchctl list | grep mission-control

# View logs
tail -f ~/Library/Logs/mission-control-compute.log
```

## Cloudflare Worker

### Deploy Script

```bash
#!/bin/bash
# scripts/deploy-worker.sh

cd packages/worker

# Set secrets if not already set
if ! wrangler secret list | grep -q HUB_URL; then
  echo "Setting HUB_URL secret..."
  echo "$HUB_URL" | wrangler secret put HUB_URL
fi

# Deploy
wrangler deploy

echo "Worker deployed successfully"
```

### Wrangler Commands

```bash
# Deploy
wrangler deploy

# View logs
wrangler tail

# Set secret
wrangler secret put SECRET_NAME

# List deployments
wrangler deployments list
```

## Tailscale ACLs

### ACL Configuration

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:mission-control"],
      "dst": ["tag:mission-control:*"]
    }
  ],

  "tagOwners": {
    "tag:mission-control": ["autogroup:admin"]
  },

  "hosts": {
    "hub": "100.x.x.10",
    "macmini": "100.x.x.20",
    "macbook": "100.x.x.30"
  }
}
```

### Apply ACLs

1. Go to Tailscale Admin Console
2. Access Controls
3. Paste ACL JSON
4. Save

## Health Checks

### Health Check Script

```bash
#!/bin/bash
# scripts/health-check.sh

HUB_URL="${HUB_URL:-http://100.x.x.10:3000}"
WORKER_URL="${WORKER_URL:-https://api.yourdomain.com}"

echo "Checking Hub..."
if curl -sf "$HUB_URL/health" > /dev/null; then
  echo "✓ Hub is healthy"
else
  echo "✗ Hub is down"
  exit 1
fi

echo "Checking Worker..."
if curl -sf "$WORKER_URL/health" > /dev/null; then
  echo "✓ Worker is healthy"
else
  echo "✗ Worker is down"
  exit 1
fi

echo "Checking Compute Nodes..."
for node in macmini macbook; do
  IP=$(tailscale status --json | jq -r ".Peer[] | select(.HostName==\"$node\") | .TailscaleIPs[0]")
  if [ -n "$IP" ]; then
    if curl -sf "http://$IP:3001/health" > /dev/null; then
      echo "✓ $node is healthy"
    else
      echo "✗ $node is down"
    fi
  else
    echo "- $node not in tailnet"
  fi
done

echo "All checks complete"
```

## Deployment Workflow

### Hub Deployment

```bash
#!/bin/bash
# scripts/deploy-hub.sh

set -e

echo "Deploying Hub..."

# Pull latest
cd /home/mission/mission-control
git pull

# Install dependencies
pnpm install

# Build
pnpm --filter hub build

# Restart service
sudo systemctl restart mission-hub

# Verify
sleep 5
if curl -sf http://localhost:3000/health > /dev/null; then
  echo "✓ Hub deployed successfully"
else
  echo "✗ Hub deployment failed"
  sudo journalctl -u mission-hub -n 50
  exit 1
fi
```

### Full Deployment

```bash
#!/bin/bash
# scripts/deploy-all.sh

echo "=== Deploying Mission Control ==="

echo "1. Deploying Hub..."
ssh hub "cd mission-control && ./infra/scripts/deploy-hub.sh"

echo "2. Deploying Worker..."
./infra/scripts/deploy-worker.sh

echo "3. Deploying Compute Nodes..."
ssh macmini "cd mission-control && git pull && pnpm install && pnpm --filter compute build"
launchctl unload ~/Library/LaunchAgents/com.mission-control.compute.plist
launchctl load ~/Library/LaunchAgents/com.mission-control.compute.plist

echo "4. Running health checks..."
./infra/scripts/health-check.sh

echo "=== Deployment Complete ==="
```

## Monitoring

### Prometheus Metrics (Optional)

Add to Hub:

```typescript
import { register, Counter, Histogram } from "prom-client";

const requestCounter = new Counter({
  name: "mission_requests_total",
  help: "Total requests",
  labelNames: ["method", "path", "status"],
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});
```

### Grafana Dashboard

Import dashboard JSON from `infra/grafana/dashboard.json`.

## Backup

### Convex Backup

```bash
# Export all data
npx convex export --path ./backups/$(date +%Y%m%d)
```

### Configuration Backup

```bash
# Backup all config files
tar -czf config-backup-$(date +%Y%m%d).tar.gz \
  .env \
  infra/systemd/*.service \
  infra/launchd/*.plist \
  infra/tailscale/acl.json
```
