# Mission Control

A multi-node AI orchestration system that routes requests through a secure, cost-effective pipeline using Claude Max subscription.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Mission Control                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────┐     ┌──────────────┐     ┌─────────────────────────┐    │
│   │ CF Worker│────▶│ Hetzner Hub  │────▶│ Compute Nodes           │    │
│   │ (Entry)  │     │ (Claude CLI) │     │ • Mac mini (always-on)  │    │
│   └──────────┘     └──────────────┘     │ • MacBook (on-demand)   │    │
│        │                  │              │ • Mobile (notifications)│    │
│        │                  │              └─────────────────────────┘    │
│        │                  │                                             │
│        │           ┌──────▼──────┐                                      │
│        └──────────▶│   Convex    │◀─────────────────────────────────────┤
│                    │ (Coord DB)  │                                      │
│                    └─────────────┘                                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Features

- **Cost-Effective**: Leverages Claude Max subscription ($200/mo) instead of API pricing
- **Secure Pipeline**: Multi-stage security with trust classification, input sanitization, and scoped agents
- **Distributed Compute**: Route tasks to appropriate nodes based on capability requirements
- **Mobile Integration**: iOS/watchOS apps for monitoring and quick interactions

## Quick Start

1. **Prerequisites**
   - Cloudflare account
   - Hetzner VPS (CAX11 recommended, ~$4.50/mo)
   - Tailscale account
   - Convex account (free tier)
   - Claude Max subscription

2. **Setup Order**
   - Phase 0: DNS cleanup (if migrating from existing setup)
   - Phase 1: Network foundation (Tailscale + Convex)
   - Phase 2: Hub deployment (Hetzner + Claude CLI)
   - Phase 3: Worker deployment (Cloudflare)
   - Phase 4: Compute nodes (Mac mini)
   - Phase 5: Mobile apps (iOS/watchOS)

See [docs/phases/](docs/phases/) for detailed implementation guides.

## Project Structure

```
mission-control/
├── packages/           # Core services
│   ├── hub/           # Hetzner orchestration hub
│   ├── worker/        # Cloudflare Worker entry point
│   ├── compute/       # Mac compute node service
│   └── shared/        # Shared types and utilities
├── apps/              # Client applications
│   ├── ios/           # iPhone app
│   └── watchos/       # Apple Watch app
├── convex/            # Convex database schemas
├── infra/             # Infrastructure configs
└── docs/              # Documentation
```

## Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Claude Max | $200 |
| Hetzner CAX11 | ~$4.50 |
| Cloudflare Worker | Free tier |
| Convex | Free tier |
| Tailscale | Free tier |
| **Total** | **~$205/mo** |

## Documentation

- [Architecture](ARCHITECTURE.md) - System design and data flow
- [Security](SECURITY.md) - Threat model and defense layers
- [Contributing](CONTRIBUTING.md) - Development guidelines

## License

Private - All rights reserved
