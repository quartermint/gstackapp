# Mission Control

A secure, multi-node AI orchestration system that routes requests through a cost-effective pipeline using Claude Max subscription instead of per-API-call pricing.

## Overview

Mission Control enables you to run Claude-powered AI workflows across distributed compute nodes while maintaining strong security guarantees. It's designed for developers who need AI capabilities at scale without unpredictable API costs.

### Key Benefits

- **Fixed-Cost AI**: Leverage Claude Max subscription ($200/mo) instead of variable API pricing
- **Secure by Design**: Multi-layer security with trust classification, input sanitization, and sandboxed execution
- **Distributed Architecture**: Route tasks to Mac compute nodes based on availability and capability
- **Mobile Ready**: iOS, macOS, and watchOS apps for monitoring and quick interactions
- **Real-time Coordination**: Convex database for live task tracking and audit logging

## Architecture

```
                                    Mission Control System
    ┌─────────────────────────────────────────────────────────────────────────────┐
    │                                                                              │
    │   ┌─────────────┐     ┌───────────────┐     ┌───────────────────────────┐  │
    │   │  Cloudflare │     │   Hetzner     │     │     Compute Nodes          │  │
    │   │   Worker    │────▶│     Hub       │────▶│  ┌─────────┐ ┌─────────┐  │  │
    │   │             │     │               │     │  │Mac mini │ │MacBook  │  │  │
    │   │ • Rate limit│     │ • Security    │     │  │(always) │ │(demand) │  │  │
    │   │ • Auth      │     │   pipeline    │     │  └─────────┘ └─────────┘  │  │
    │   │ • Route     │     │ • Claude CLI  │     └───────────────────────────┘  │
    │   └─────────────┘     │ • Task queue  │                                    │
    │         │             └───────┬───────┘                                    │
    │         │                     │                                            │
    │         │             ┌───────▼───────┐                                    │
    │         └────────────▶│    Convex     │◀──────── Mobile Apps ──────────────┤
    │                       │   Database    │         (iOS/macOS/watchOS)        │
    │                       │               │                                    │
    │                       │ • Tasks       │                                    │
    │                       │ • Nodes       │                                    │
    │                       │ • Audit logs  │                                    │
    │                       └───────────────┘                                    │
    │                                                                              │
    └─────────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. **Entry Point**: Cloudflare Worker receives requests, validates tokens, applies rate limits
2. **Security Pipeline**: Hub runs 6-stage security: parse → sanitize → classify → route → execute → validate
3. **Trust Classification**: Requests are classified as `internal`, `power_user`, `authenticated`, or `untrusted`
4. **Task Execution**: Compute nodes run tasks in sandboxed environments with command allowlists
5. **Audit Logging**: All actions logged to Convex with request IDs for forensics

## Getting Started

### Prerequisites

| Component | Purpose | Cost |
|-----------|---------|------|
| Claude Max | AI subscription | $200/mo |
| Hetzner VPS | Hub server (CAX11) | ~$4.50/mo |
| Cloudflare | Worker + DNS | Free tier |
| Convex | Database | Free tier |
| Tailscale | VPN mesh | Free tier |
| **Total** | | **~$205/mo** |

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourorg/mission-control.git
cd mission-control

# Install dependencies (requires pnpm)
pnpm install

# Run all tests
pnpm test

# Start development servers
pnpm dev
```

### Development Commands

```bash
# Run all packages in development mode
pnpm dev

# Run specific package
pnpm --filter hub dev        # Hub on port 3000
pnpm --filter worker dev     # Worker on port 8787

# Testing
pnpm test                    # All packages
pnpm test:coverage           # With coverage
pnpm --filter hub test       # Single package

# Quality checks
pnpm typecheck               # TypeScript validation
pnpm lint                    # Linting

# Build
pnpm build                   # All packages
```

## Project Structure

```
mission-control/
├── packages/                 # Core Node.js services
│   ├── hub/                  # Hetzner orchestration hub (Fastify)
│   ├── worker/               # Cloudflare Worker entry point
│   ├── compute/              # Mac compute node service
│   └── shared/               # Shared types, schemas, utilities
│
├── apps/                     # Native client applications
│   ├── ios/                  # iPhone/iPad app (SwiftUI)
│   ├── macos/                # macOS desktop client
│   └── watchos/              # Apple Watch companion
│
├── packages/swift/           # Shared Swift packages
│   ├── MissionControlKit/    # Core API client, models
│   └── MissionControlUI/     # Shared SwiftUI components
│
├── convex/                   # Convex database configuration
│   ├── schema.ts             # Database schema
│   └── *.ts                  # Query/mutation functions
│
├── docs/                     # Documentation
│   ├── phases/               # Deployment phase guides
│   └── security/             # Security documentation
│
└── infra/                    # Infrastructure configs
    ├── systemd/              # Hub service files
    └── launchd/              # Mac compute service files
```

## Security Model

Mission Control prevents the "Lethal Trifecta" (untrusted input + AI agent + shell access) through 7 defense layers:

### Defense Layers

1. **Network Boundary**: Rate limiting and token validation at Cloudflare edge
2. **Trust Classification**: Four-tier trust system based on source and credentials
3. **Input Sanitization**: Detection of 15+ injection patterns, 10KB size limit
4. **Scoped Agents**: Different agent profiles with varying tool access
5. **Command Allowlist**: Only pre-approved commands can execute
6. **Sandbox Execution**: Isolated temp directories, timeouts, restricted PATH
7. **Audit Logging**: Complete request tracing for forensic analysis

### Trust Levels

| Level | Source | Capabilities |
|-------|--------|--------------|
| `internal` | Tailscale peer | Full access, system commands |
| `power_user` | JWT + device approval | Task creation, sandboxed execution |
| `authenticated` | Valid JWT | Read tools, chat, view tasks |
| `untrusted` | No valid auth | Rate-limited chat only |

### Agent Profiles

| Agent | Trust Required | Capabilities |
|-------|---------------|--------------|
| `task-orchestrator` | internal / power_user (sandboxed) | Full tool access |
| `code-assistant` | authenticated+ | Read-only file tools |
| `chat-readonly` | any | No tools |

## Configuration

### Environment Variables

**Required for all packages:**
```bash
NODE_ENV=production
JWT_SECRET=your-secure-secret-min-32-chars
CONVEX_URL=https://your-project.convex.cloud
CONVEX_DEPLOY_KEY=your-deploy-key
```

**Hub (packages/hub):**
```bash
PORT=3000
CLAUDE_MAX_TOKENS=8192
CLAUDE_TIMEOUT=60000
```

**Worker (packages/worker):**
```bash
HUB_URL=http://100.x.x.x:3000  # Tailscale IP
```

**Compute (packages/compute):**
```bash
PORT=3001
HOSTNAME=mac-mini-01
HUB_URL=http://100.x.x.x:3000
SANDBOX_ENABLED=true
SANDBOX_WORKDIR=/tmp/sandbox
```

**iOS Push Notifications:**
```bash
APN_KEY_PATH=/path/to/AuthKey.p8
APN_KEY_ID=XXXXXXXXXX
APN_TEAM_ID=XXXXXXXXXX
```

## Deployment

### Phase-by-Phase Setup

1. **Phase 1: Network Foundation**
   - Set up Tailscale mesh network
   - Configure Convex database

2. **Phase 2: Hub Deployment**
   - Deploy Hetzner VPS
   - Install Claude CLI
   - Configure systemd service

3. **Phase 3: Worker Deployment**
   - Deploy Cloudflare Worker
   - Configure DNS routing

4. **Phase 4: Compute Nodes**
   - Set up Mac mini nodes
   - Configure launchd services

5. **Phase 5: Mobile Apps**
   - Build iOS/watchOS apps
   - Configure push notifications

See [docs/phases/](docs/phases/) for detailed guides.

### Service Management

**Hub (systemd):**
```bash
sudo systemctl start|stop|restart|status mission-hub
sudo journalctl -u mission-hub -f
```

**Compute (launchd):**
```bash
launchctl load ~/Library/LaunchAgents/com.mission-control.compute.plist
launchctl list | grep mission-control
```

## API Reference

### Chat Endpoint

```bash
POST /chat
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "message": "Your message here",
  "conversationId": "optional-conversation-id",
  "history": []  # Optional previous messages
}
```

### Health Check

```bash
GET /health

# Response
{
  "status": "ok",
  "version": "0.1.1",
  "uptime": 12345
}
```

### Admin Endpoints (Internal Only)

```bash
GET /admin/nodes          # List compute nodes
GET /admin/tasks          # List tasks
POST /admin/tasks         # Create task
GET /admin/metrics        # Prometheus metrics
```

## Testing

The project includes comprehensive test coverage:

| Package | Tests | Description |
|---------|-------|-------------|
| shared | 81 | Validation, ID generation, JWT, schemas |
| hub | 387 | Security pipeline, routes, middleware |
| compute | 42 | Sandbox command validation |

Run tests:
```bash
pnpm test                    # All packages
pnpm --filter hub test       # Hub only
pnpm test:coverage           # With coverage report
```

## Contributing

### Code Conventions

- **TypeScript strict mode**: No `any` types, use `unknown`
- **Zod schemas**: All external boundaries validated
- **Naming**: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`
- **Commits**: Conventional format (`feat:`, `fix:`, `security:`, etc.)

### Development Workflow

1. Create feature branch from `main`
2. Make changes with tests
3. Run `pnpm test && pnpm typecheck`
4. Submit PR for review

## Troubleshooting

### Common Issues

**Hub won't start:**
- Check `JWT_SECRET` is at least 32 characters
- Verify Convex URL is correct
- Check port 3000 isn't in use

**Worker returns 502:**
- Verify Hub is running on Tailscale IP
- Check Tailscale connection status
- Review wrangler logs: `wrangler tail`

**Compute node offline:**
- Check launchd service status
- Verify Tailscale connection
- Review logs in `~/Library/Logs/mission-control/`

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug pnpm --filter hub dev
```

## License

Private - All rights reserved

## Support

- Documentation: [docs/](docs/)
- Issues: GitHub Issues
- Security: See [SECURITY.md](SECURITY.md)
