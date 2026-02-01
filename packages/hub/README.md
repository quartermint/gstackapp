# Hub Package

The Hub is the central orchestration service for Mission Control, running on Hetzner.

## Overview

The Hub handles:
- Claude CLI integration (Max subscription)
- Security pipeline (sanitization, trust classification)
- Agent routing and execution
- Task coordination
- Convex synchronization

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                            HUB                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐     ┌──────────────┐     ┌─────────────────┐    │
│   │ HTTP     │────▶│ Security     │────▶│ Agent           │    │
│   │ Server   │     │ Pipeline     │     │ Executor        │    │
│   └──────────┘     └──────────────┘     └─────────────────┘    │
│        │                                        │               │
│        │           ┌──────────────┐            │               │
│        └──────────▶│ Task         │◀───────────┘               │
│                    │ Dispatcher   │                             │
│                    └──────┬───────┘                             │
│                           │                                     │
│                    ┌──────▼───────┐                             │
│                    │ Convex       │                             │
│                    │ Client       │                             │
│                    └──────────────┘                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd packages/hub
pnpm install
```

## Configuration

Create `.env` file:

```bash
# Server
NODE_ENV=production
PORT=3000

# Convex
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod:xxxxx

# Security
JWT_SECRET=your-secure-secret-here
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100

# Claude CLI (authenticated via `claude auth login`)
CLAUDE_MAX_TOKENS=8192
CLAUDE_TIMEOUT=300000
```

## Development

```bash
# Start dev server with hot reload
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## Production

```bash
# Build
pnpm build

# Start
pnpm start

# Or with systemd (see infra/README.md)
sudo systemctl start mission-hub
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
  "uptime": 12345,
  "version": "1.0.0"
}
```

### Chat

```
POST /chat
Content-Type: application/json
X-Request-ID: <uuid>
X-Trust-Level: <internal|authenticated|untrusted>

{
  "message": "Hello",
  "conversationId": "<optional uuid>"
}
```

Response:
```json
{
  "message": "Hi there!",
  "requestId": "<uuid>",
  "conversationId": "<uuid>"
}
```

### Tasks

```
GET /tasks
X-User-ID: <user-id>
```

```
POST /tasks
Content-Type: application/json

{
  "type": "shell",
  "payload": { "command": "ls -la" }
}
```

### Nodes

```
GET /nodes
```

```
POST /nodes/heartbeat
Content-Type: application/json

{
  "hostname": "macmini",
  "type": "compute",
  "capabilities": ["shell", "code"]
}
```

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # HTTP server setup
├── routes/
│   ├── chat.ts          # Chat endpoint
│   ├── tasks.ts         # Task endpoints
│   ├── nodes.ts         # Node endpoints
│   └── health.ts        # Health check
├── services/
│   ├── sanitizer.ts     # Input sanitization
│   ├── trust.ts         # Trust classification
│   ├── agents.ts        # Agent execution
│   ├── dispatcher.ts    # Task dispatch
│   ├── convex.ts        # Convex client
│   └── audit.ts         # Audit logging
├── agents/
│   └── profiles.ts      # Agent definitions
└── types.ts             # Type definitions
```

## Testing

```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration

# Coverage
pnpm test:coverage
```

## Deployment

See [Phase 2: Hub Deployment](../../docs/phases/phase-2-hub.md) for detailed deployment instructions.

Quick deploy:

```bash
# On Hetzner server
git pull
pnpm install
pnpm build
sudo systemctl restart mission-hub
```

## Troubleshooting

### Claude CLI not responding

```bash
# Check auth status
claude auth status

# Re-authenticate
claude auth logout
claude auth login
```

### High memory usage

- Check for memory leaks with `--inspect`
- Review buffer sizes in config
- Consider increasing server resources

### Connection issues

```bash
# Check Tailscale
tailscale status

# Test connectivity
curl http://localhost:3000/health
```

## Security Notes

- Never expose port 3000 to public internet
- All access should be through CF Worker → Tailscale
- Rotate JWT_SECRET regularly
- Monitor audit logs for anomalies
