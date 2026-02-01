# Compute Package

The Compute service runs on Mac nodes for heavy processing and sandboxed code execution.

## Overview

The Compute service handles:
- Task execution from Hub
- Sandboxed code execution
- Shell command execution (allowlisted)
- Build and test operations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      COMPUTE NODE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Hub (via Tailscale)                                           │
│      │                                                          │
│      ▼                                                          │
│   ┌──────────────┐                                              │
│   │ Task         │                                              │
│   │ Receiver     │                                              │
│   └──────┬───────┘                                              │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────┐     ┌─────────────────────┐                 │
│   │ Executor     │────▶│ Sandbox             │                 │
│   │ Router       │     │ Environment         │                 │
│   └──────────────┘     └─────────────────────┘                 │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────┐                                              │
│   │ Result       │                                              │
│   │ Reporter     │                                              │
│   └──────────────┘                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd packages/compute
pnpm install
```

## Configuration

Create `.env.local`:

```bash
# Server
NODE_ENV=production
PORT=3001
HOSTNAME=macmini

# Hub connection
HUB_URL=http://100.x.x.x:3000

# Convex
CONVEX_URL=https://your-deployment.convex.cloud

# Sandbox
SANDBOX_ENABLED=true
SANDBOX_WORKDIR=/tmp/mission-sandbox
SANDBOX_TIMEOUT=300000
```

## Development

```bash
# Start dev server
pnpm dev

# Run tests
pnpm test

# Build
pnpm build
```

## Production

```bash
# Build and start
pnpm build
pnpm start

# Or with launchd (macOS)
launchctl load ~/Library/LaunchAgents/com.mission-control.compute.plist
```

## API Endpoints

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "healthy",
  "hostname": "macmini",
  "uptime": 12345,
  "load": 0.25
}
```

### Execute Task

```
POST /execute
Content-Type: application/json

{
  "taskId": "uuid",
  "type": "shell|code|build",
  "payload": { ... }
}
```

## Task Types

### Shell

Execute allowlisted shell commands:

```json
{
  "taskId": "...",
  "type": "shell",
  "payload": {
    "command": "git status"
  }
}
```

Allowed commands:
- `git` (status, diff, log, branch)
- `npm`, `pnpm` (install, build, test)
- `node`
- `cat`, `ls`, `head`, `tail`, `pwd`

### Code

Execute code in sandbox:

```json
{
  "taskId": "...",
  "type": "code",
  "payload": {
    "language": "javascript",
    "code": "console.log('Hello')"
  }
}
```

Supported languages:
- JavaScript (Node.js)
- TypeScript (via ts-node)
- Python

### Build

Execute build commands in project directory:

```json
{
  "taskId": "...",
  "type": "build",
  "payload": {
    "repoPath": "/path/to/project",
    "command": "build"
  }
}
```

## Project Structure

```
src/
├── index.ts           # Entry point
├── server.ts          # HTTP server
├── executor.ts        # Task execution
├── sandbox.ts         # Sandbox management
├── registration.ts    # Hub registration
└── types.ts           # Type definitions
```

## Sandbox Security

The sandbox provides isolation:

1. **Temporary directory** - Each execution gets fresh directory
2. **Timeout enforcement** - Configurable per-task
3. **Resource limits** - Memory and CPU constraints
4. **Path restrictions** - Cannot access sensitive paths
5. **Cleanup** - Directory deleted after execution

### macOS sandbox-exec

For additional isolation on macOS:

```bash
sandbox-exec -f sandbox.sb node script.js
```

See `sandbox.sb` for the profile.

## Launch Agent Setup

For macOS auto-start:

```xml
<!-- ~/Library/LaunchAgents/com.mission-control.compute.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" ...>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.mission-control.compute</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/dist/index.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

## Monitoring

### Logs

```bash
# View logs
tail -f ~/Library/Logs/mission-control-compute.log

# View errors
tail -f ~/Library/Logs/mission-control-compute.error.log
```

### Metrics

The service exposes metrics at `/metrics`:
- Active tasks
- CPU usage
- Memory usage
- Task completion times

## Troubleshooting

### Service won't start

```bash
# Check launchd status
launchctl list | grep mission-control

# Check logs
cat ~/Library/Logs/mission-control-compute.error.log
```

### Sandbox errors

```bash
# Verify sandbox directory
ls -la /tmp/mission-sandbox

# Check permissions
chmod 755 /tmp/mission-sandbox
```

### Can't connect to Hub

```bash
# Test Tailscale
tailscale status
tailscale ping hub

# Test Hub connectivity
curl http://100.x.x.x:3000/health
```

## Security Notes

- Only allowlisted commands can execute
- Sandbox isolates code execution
- All actions logged to Hub
- Tailscale provides network security
