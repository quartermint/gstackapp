# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Mission Control is a multi-node AI orchestration system that routes requests through a secure pipeline using Claude Max subscription ($200/mo) instead of per-API-call pricing. It consists of a Cloudflare Worker entry point, a Hetzner Hub (orchestration center), Mac compute nodes, and a Convex coordination database.

## Architecture

```
Internet -> CF Worker (rate limit, auth) -> Tailscale VPN -> Hetzner Hub (security pipeline, Claude CLI) -> Compute Nodes (Mac mini/MacBook)
                                                              |
                                                         Convex DB (real-time coordination, audit logs)
```

**Request Flow:**
1. CF Worker validates tokens and rate limits (100 req/min per IP)
2. Hub runs 6-stage security pipeline: parse -> sanitize -> classify -> route -> execute -> validate
3. Trust level (`internal`/`authenticated`/`untrusted`) determines agent scope and available tools
4. Tasks dispatched to compute nodes run in sandboxed environments with command allowlist

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                    # All packages
pnpm --filter hub dev       # Single package
pnpm --filter worker dev    # Worker runs on port 8787

# Testing
pnpm test                   # All packages
pnpm test:coverage          # With coverage
pnpm --filter hub test      # Single package

# Type checking & linting
pnpm typecheck
pnpm lint

# Build
pnpm build
pnpm --filter hub build
```

**Convex:**
```bash
npx convex dev              # Local dev server
npx convex deploy           # Deploy to production
npx convex dashboard        # Open web dashboard
npx convex run <fn> '{}'    # Run function manually
```

**Cloudflare Worker:**
```bash
wrangler deploy             # Deploy worker
wrangler tail               # Live logs
wrangler secret put NAME    # Set secret
```

## Package Structure

| Package | Port | Role |
|---------|------|------|
| `packages/hub` | 3000 | Orchestration, Claude CLI integration, security pipeline |
| `packages/worker` | 8787 (dev) | Public entry point (Cloudflare), token validation |
| `packages/compute` | 3001 | Task execution on Mac nodes, sandbox enforcement |
| `packages/shared` | - | Zod schemas, types, utilities |

## Security Model

The system prevents the "Lethal Trifecta" (untrusted input + AI agent + shell access) through 7 defense layers:

1. **Network Boundary**: Rate limiting, token validation at CF Worker
2. **Trust Classification**: `internal` (Tailscale peer), `authenticated` (valid JWT), `untrusted` (external)
3. **Input Sanitization**: 15+ injection pattern detection, 10K char limit
4. **Scoped Agents**: `chat-readonly` (no tools), `code-assistant` (read-only), `task-orchestrator` (full, internal only)
5. **Command Allowlist**: Only pre-approved commands (git, npm, pnpm, basic file ops)
6. **Sandbox Execution**: Isolated temp dir, timeout, restricted PATH
7. **Audit Logging**: All actions logged to Convex with requestId for forensics

## Code Conventions

- **TypeScript strict mode** - no `any` types, use `unknown`
- **Zod schemas** for all external boundaries
- **Naming**: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`
- **Typed errors**: Extend `Error` with error code property
- **Conventional commits**: `feat(scope):`, `fix(scope):`, `security(scope):`, etc.

## Testing

Test suites are configured with vitest. Run `pnpm test` for all packages.

| Package | Tests | Coverage |
|---------|-------|----------|
| shared | 58 | Validation, ID generation, schemas |
| hub | 73 | Sanitizer, health routes, trust |
| compute | 42 | Sandbox command validation |

## JWT Authentication

Hub uses `jose` library for JWT operations:
- `verifyJwt(token)` - Verify signature and claims
- `signJwt(payload, expiresIn)` - Generate tokens (admin/testing)
- Algorithms: HS256, HS384, HS512
- Required claims: `sub`, `iat`, `exp`

## Convex Integration

Hub connects to Convex via `ConvexHttpClient`:
- Graceful degradation when `CONVEX_URL` not set
- Task storage: create, get, listByStatus, updateStatus
- Node registry: upsert, markOffline, listOnline
- Audit logging: non-blocking, requestId tracing

## Convex Database

Tables: `conversations`, `messages`, `tasks`, `nodes`, `auditLog`

Key indexes:
- `messages.by_conversation`
- `tasks.by_status`
- `nodes.by_hostname`
- `auditLog.by_timestamp`, `auditLog.by_requestId`

## Client Development

Native client applications for iOS, macOS, and watchOS are in the `apps/` directory.

### Apps

| App | Path | Description |
|-----|------|-------------|
| iOS | `apps/ios/` | iPhone/iPad client with SwiftUI |
| macOS | `apps/macos/` | Desktop client with dual-mode (menubar/window) |
| watchOS | `apps/watchos/` | Apple Watch companion app |

### Shared Swift Packages

Shared code is in `packages/swift/`:
- **MissionControlKit** - Core API client, models, and utilities
- **MissionControlUI** - Shared SwiftUI components and styles

### Building

```bash
# Open iOS project
open apps/ios/MissionControl.xcodeproj

# Open macOS project
open apps/macos/MissionControl.xcodeproj

# Build from command line
xcodebuild -project apps/ios/MissionControl.xcodeproj -scheme MissionControl -configuration Release
```

### Configuration

Clients connect to the hub via the configured endpoint. Set in each app's scheme or Info.plist:
- Development: `http://localhost:3000`
- Production: Hub's Tailscale IP or public URL via CF Worker

## Service Management

**Hub (systemd on Hetzner):**
```bash
sudo systemctl start|stop|restart|status mission-hub
sudo journalctl -u mission-hub -f
```

**Compute (launchd on Mac):**
```bash
launchctl load|unload ~/Library/LaunchAgents/com.mission-control.compute.plist
launchctl list | grep mission-control
```

## Environment Variables

Required for all: `NODE_ENV`, `CONVEX_URL`, `CONVEX_DEPLOY_KEY`, `JWT_SECRET`

Hub: `PORT` (3000), `CLAUDE_MAX_TOKENS`, `CLAUDE_TIMEOUT`
Worker: `HUB_URL` (Tailscale IP)
Compute: `PORT` (3001), `HOSTNAME`, `HUB_URL`, `SANDBOX_ENABLED`, `SANDBOX_WORKDIR`
