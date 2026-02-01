# Worker Package

The Cloudflare Worker serves as the public entry point for Mission Control.

## Overview

The Worker handles:
- Public API endpoint
- Rate limiting
- Token validation
- Request forwarding to Hub via Tailscale

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE WORKER                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Internet                                                       │
│      │                                                          │
│      ▼                                                          │
│   ┌──────────────┐                                              │
│   │ Rate Limiter │                                              │
│   └──────┬───────┘                                              │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────┐                                              │
│   │ Auth Check   │                                              │
│   └──────┬───────┘                                              │
│          │                                                       │
│          ▼                                                       │
│   ┌──────────────┐     ┌─────────────────────┐                 │
│   │ Router       │────▶│ Forward to Hub      │                 │
│   └──────────────┘     │ (via Tailscale)     │                 │
│                        └─────────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Installation

```bash
cd packages/worker
pnpm install
```

## Configuration

### wrangler.toml

```toml
name = "mission-control-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"

# Rate limiting binding
[[unsafe.bindings]]
name = "RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 100, period = 60 }
```

### Secrets

```bash
# Set Hub URL (Tailscale IP)
wrangler secret put HUB_URL

# Set JWT secret
wrangler secret put JWT_SECRET
```

## Development

```bash
# Start local dev server
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck
```

## Deployment

```bash
# Deploy to Cloudflare
pnpm deploy

# Check deployment
wrangler tail
```

## API Endpoints

### Health Check

```
GET /health
```

No authentication required.

### Chat

```
POST /api/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Hello"
}
```

### Tasks

```
GET /api/tasks
Authorization: Bearer <token>
```

## Project Structure

```
src/
├── index.ts        # Entry point, main handler
├── handler.ts      # Request routing
├── auth.ts         # Token validation
├── ratelimit.ts    # Rate limiting
└── types.ts        # Type definitions
```

## Environment Types

```typescript
interface Env {
  HUB_URL: string;           // Hub Tailscale URL
  JWT_SECRET: string;        // JWT signing secret
  RATE_LIMITER: RateLimit;   // Cloudflare rate limiter
}
```

## Rate Limiting

Default: 100 requests per minute per IP.

Configurable in wrangler.toml:
```toml
simple = { limit = 100, period = 60 }
```

## Authentication

The Worker validates JWT tokens:
- Algorithm: HS256
- Required claims: `sub`, `exp`, `scope`
- Token format: `Authorization: Bearer <token>`

Token generation (for clients):
```typescript
import jwt from "jsonwebtoken";

const token = jwt.sign(
  { sub: "user-id", scope: "user" },
  JWT_SECRET,
  { expiresIn: "1h" }
);
```

## Error Responses

All errors return JSON:

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message"
}
```

Error codes:
- `RATE_LIMITED` - 429
- `UNAUTHORIZED` - 401
- `INVALID_TOKEN` - 401
- `NOT_FOUND` - 404
- `INTERNAL_ERROR` - 500

## Custom Domain

To set up a custom domain:

1. In Cloudflare Dashboard → Workers → Your Worker
2. Triggers → Add Custom Domain
3. Enter your domain (e.g., `api.yourdomain.com`)

## Monitoring

```bash
# Real-time logs
wrangler tail

# With filters
wrangler tail --status error
```

## Testing

```bash
# Local testing
pnpm dev
curl http://localhost:8787/health

# Test with token
TOKEN="..."
curl -X POST http://localhost:8787/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "test"}'
```

## Troubleshooting

### Worker not starting

```bash
# Check for syntax errors
pnpm typecheck

# View deployment logs
wrangler tail --status error
```

### Connection to Hub failing

- Verify Tailscale is configured on Hub
- Check HUB_URL secret is correct
- Ensure Hub port 3000 is accessible

### Rate limiting not working

- Verify binding in wrangler.toml
- Check namespace_id is unique
- Review Cloudflare dashboard for rate limit settings
