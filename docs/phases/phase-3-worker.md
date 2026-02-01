# Phase 3: Worker Deployment

This phase deploys the Cloudflare Worker that serves as the public entry point.

## Overview

The CF Worker handles:
- Public API endpoint
- Rate limiting
- Token validation
- Request forwarding to Hub via Tailscale

```
Internet → CF Worker → Tailscale → Hub
```

## Prerequisites

- Cloudflare account with Workers enabled
- Hub deployed and accessible (Phase 2)
- Tailscale configured (Phase 1)

## Part 1: Project Setup

### 1.1 Initialize Worker

```bash
cd mission-control/packages/worker

# Initialize if not already done
pnpm init
pnpm add -D wrangler typescript @cloudflare/workers-types
```

### 1.2 Configure Wrangler

Create `wrangler.toml`:

```toml
name = "mission-control-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
ENVIRONMENT = "production"

# Rate limiting
[[unsafe.bindings]]
name = "RATE_LIMITER"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 100, period = 60 }

# Secrets (set via wrangler secret put)
# HUB_URL - Tailscale URL to Hub
# JWT_SECRET - For token validation
```

### 1.3 TypeScript Config

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*"]
}
```

## Part 2: Worker Implementation

### 2.1 Main Entry Point

Create `src/index.ts`:

```typescript
import { handleRequest } from "./handler";
import { validateToken } from "./auth";
import { checkRateLimit } from "./ratelimit";

export interface Env {
  HUB_URL: string;
  JWT_SECRET: string;
  RATE_LIMITER: RateLimit;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "healthy" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // CORS preflight
    if (request.method === "OPTIONS") {
      return handleCORS();
    }

    // Rate limiting
    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateLimitResult = await checkRateLimit(env.RATE_LIMITER, clientIP);
    if (!rateLimitResult.allowed) {
      return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(rateLimitResult.retryAfter),
        },
      });
    }

    // Token validation
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice(7);
    const claims = await validateToken(token, env.JWT_SECRET);
    if (!claims) {
      return new Response(JSON.stringify({ error: "INVALID_TOKEN" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Route to handler
    return handleRequest(request, env, claims);
  },
};

function handleCORS(): Response {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
```

### 2.2 Request Handler

Create `src/handler.ts`:

```typescript
import { Env } from "./index";
import { TokenClaims } from "./auth";

export async function handleRequest(
  request: Request,
  env: Env,
  claims: TokenClaims
): Promise<Response> {
  const url = new URL(request.url);

  // Route based on path
  if (url.pathname === "/api/chat" && request.method === "POST") {
    return handleChat(request, env, claims);
  }

  if (url.pathname === "/api/tasks" && request.method === "GET") {
    return handleTasks(request, env, claims);
  }

  return new Response(JSON.stringify({ error: "NOT_FOUND" }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleChat(
  request: Request,
  env: Env,
  claims: TokenClaims
): Promise<Response> {
  try {
    // Validate request size
    const contentLength = request.headers.get("Content-Length");
    if (contentLength && parseInt(contentLength) > 100_000) {
      return new Response(JSON.stringify({ error: "REQUEST_TOO_LARGE" }), {
        status: 413,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Forward to Hub
    const hubResponse = await fetch(`${env.HUB_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": crypto.randomUUID(),
        "X-User-ID": claims.sub,
        "X-Trust-Level": claims.scope,
      },
      body: request.body,
    });

    // Return Hub response with CORS headers
    const response = new Response(hubResponse.body, {
      status: hubResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });

    return response;
  } catch (error) {
    console.error("Chat handler error:", error);
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleTasks(
  request: Request,
  env: Env,
  claims: TokenClaims
): Promise<Response> {
  const hubResponse = await fetch(`${env.HUB_URL}/tasks`, {
    headers: {
      "X-User-ID": claims.sub,
    },
  });

  return new Response(hubResponse.body, {
    status: hubResponse.status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
```

### 2.3 Auth Module

Create `src/auth.ts`:

```typescript
export interface TokenClaims {
  sub: string;      // User ID
  scope: string;    // "user" | "admin"
  exp: number;      // Expiration timestamp
}

export async function validateToken(
  token: string,
  secret: string
): Promise<TokenClaims | null> {
  try {
    // Decode JWT (simplified - use a proper JWT library in production)
    const [headerB64, payloadB64, signatureB64] = token.split(".");

    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureValid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signatureB64),
      encoder.encode(`${headerB64}.${payloadB64}`)
    );

    if (!signatureValid) {
      return null;
    }

    // Decode payload
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    ) as TokenClaims;

    // Check expiration
    if (payload.exp < Date.now() / 1000) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
```

### 2.4 Rate Limiting

Create `src/ratelimit.ts`:

```typescript
interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(
  limiter: RateLimit,
  key: string
): Promise<RateLimitResult> {
  const result = await limiter.limit({ key });

  return {
    allowed: result.success,
    retryAfter: result.success ? undefined : 60,
  };
}
```

## Part 3: Deployment

### 3.1 Set Secrets

```bash
# Set Hub URL (Tailscale address)
wrangler secret put HUB_URL
# Enter: http://100.x.x.x:3000

# Set JWT secret
wrangler secret put JWT_SECRET
# Enter: your-secure-secret
```

### 3.2 Deploy Worker

```bash
# Deploy to Cloudflare
wrangler deploy

# Output will show your Worker URL
# https://mission-control-api.your-subdomain.workers.dev
```

### 3.3 Configure Custom Domain (Optional)

In Cloudflare dashboard:
1. Go to Workers → mission-control-api
2. Triggers → Add Custom Domain
3. Enter: `api.yourdomain.com`

## Part 4: Testing

### 4.1 Health Check

```bash
curl https://mission-control-api.workers.dev/health
# {"status":"healthy"}
```

### 4.2 Test with Token

```bash
# Generate a test token (use your JWT secret)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

curl -X POST https://mission-control-api.workers.dev/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

### 4.3 Test Rate Limiting

```bash
# Rapid requests should eventually get rate limited
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    https://mission-control-api.workers.dev/health
done | sort | uniq -c
```

## Verification Checklist

- [ ] Worker deployed successfully
- [ ] Custom domain configured (if desired)
- [ ] Health endpoint responding
- [ ] Token validation working
- [ ] Rate limiting active
- [ ] Requests forwarding to Hub
- [ ] CORS headers present
- [ ] Error responses structured correctly

## Troubleshooting

### Worker not deploying
```bash
wrangler whoami  # Check authentication
wrangler tail    # Stream logs
```

### Connection to Hub failing
- Verify Tailscale is connected on Hub
- Check Hub firewall allows port 3000
- Test from Worker logs: `wrangler tail`

### Rate limiting not working
- Verify binding in wrangler.toml
- Check rate limit configuration

## Next Steps

Proceed to [Phase 4: Compute Nodes](phase-4-compute.md)
