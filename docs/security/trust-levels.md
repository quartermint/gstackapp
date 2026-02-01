# Trust Levels

This document defines the trust classification system used throughout Mission Control.

## Overview

Every request is classified into one of four trust levels, which determines what capabilities are available.

## Trust Level Definitions

### Internal (`internal`)

**Description**: Requests originating from within the Tailscale mesh, from verified peer nodes.

**Identification**:
- Source IP in Tailscale range (100.x.x.x)
- Tailscale peer verification successful
- Node registered in Convex nodes table

**Capabilities**:
- Full tool access
- Code execution
- Task orchestration
- File write access
- System commands

**Use Cases**:
- Hub-to-compute communication
- Inter-node task dispatch
- System automation

```typescript
function isInternal(source: Source): boolean {
  return (
    source.type === "tailscale" &&
    source.peerVerified === true &&
    isRegisteredNode(source.hostname)
  );
}
```

### Authenticated (`authenticated`)

**Description**: Requests from users who have provided valid authentication credentials.

**Identification**:
- Valid JWT token in Authorization header
- Token not expired
- Token scope is "user" or higher

**Capabilities**:
- Read tools (Read, Glob, Grep)
- Chat with context
- View task status
- Limited code exploration

**Restrictions**:
- No file writes
- No command execution
- No task creation

**Use Cases**:
- Mobile app access
- Web dashboard
- Personal chat sessions

```typescript
function isAuthenticated(request: Request): boolean {
  const token = extractToken(request);
  if (!token) return false;

  const claims = validateToken(token);
  return claims !== null && claims.exp > Date.now() / 1000;
}
```

### Power User (`power_user`)

**Description**: Authenticated users with elevated privileges via role claim and device approval.

**Identification**:
- Valid JWT token with `role: 'power-user'`
- Token includes `deviceApproved: true` claim
- Device registered and approved

**Capabilities**:
- All authenticated capabilities
- Create and manage tasks
- Execute sandboxed code
- Access task-orchestrator (sandboxed)

**Restrictions**:
- No system admin access
- Sandboxed execution only
- Rate limited (120 req/min)

**Use Cases**:
- Trusted developers needing task creation
- CI/CD pipelines
- Approved mobile power users

See [power-user-trust.md](./power-user-trust.md) for full documentation.

### Untrusted (`untrusted`)

**Description**: Requests from unknown sources or those that fail authentication.

**Identification**:
- No valid token
- External IP address
- Failed validation

**Capabilities**:
- Read-only chat (no tools)
- Public information only
- Rate limited heavily

**Restrictions**:
- No tool access
- No code access
- No task visibility
- Strict rate limits

**Use Cases**:
- Public API consumers
- Unauthenticated users
- Fallback for failed auth

```typescript
function classifyTrust(request: Request, source: Source): TrustLevel {
  if (isInternal(source)) return "internal";
  if (isAuthenticated(request)) return "authenticated";
  return "untrusted";
}
```

## Capability Matrix

| Capability | Internal | Power User | Authenticated | Untrusted |
|------------|----------|------------|---------------|-----------|
| Chat | ✅ | ✅ | ✅ | ✅ (limited) |
| Read files | ✅ | ✅ | ✅ | ❌ |
| Search code | ✅ | ✅ | ✅ | ❌ |
| Write files | ✅ | ❌ | ❌ | ❌ |
| Execute commands | ✅ | ✅ (sandboxed) | ❌ | ❌ |
| Create tasks | ✅ | ✅ | ❌ | ❌ |
| View tasks | ✅ | ✅ | ✅ | ❌ |
| System admin | ✅ | ❌ | ❌ | ❌ |

## Agent Mapping

Each trust level maps to specific agent profiles:

| Trust Level | Available Agents |
|-------------|------------------|
| Internal | task-orchestrator, code-assistant, health-processor, chat-readonly |
| Power User | task-orchestrator (sandboxed), code-assistant, chat-readonly |
| Authenticated | code-assistant, chat-readonly |
| Untrusted | chat-readonly (no tools) |

## Rate Limits

| Trust Level | Requests/min | Max Message Size | Timeout |
|-------------|--------------|------------------|---------|
| Internal | Unlimited | 1MB | 5min |
| Power User | 120 | 500KB | 2min |
| Authenticated | 60 | 100KB | 60s |
| Untrusted | 10 | 10KB | 30s |

## Trust Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    TRUST VERIFICATION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Request arrives                                               │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────────────┐                                          │
│   │ Check source IP │                                          │
│   └────────┬────────┘                                          │
│            │                                                    │
│            ▼                                                    │
│   ┌────────────────────┐    Yes    ┌─────────────────┐        │
│   │ Is Tailscale peer? │──────────▶│ Verify peer     │        │
│   └────────┬───────────┘           └────────┬────────┘        │
│            │ No                             │                  │
│            ▼                                ▼                  │
│   ┌────────────────────┐           ┌────────────────┐         │
│   │ Has Bearer token?  │           │ Peer verified? │         │
│   └────────┬───────────┘           └────────┬───────┘         │
│            │                                │                  │
│      Yes   │   No                    Yes    │    No           │
│            ▼                                ▼                  │
│   ┌────────────────┐              ┌─────────────────┐         │
│   │ Validate token │              │ Return INTERNAL │         │
│   └────────┬───────┘              └─────────────────┘         │
│            │                                                   │
│     Valid  │  Invalid                                         │
│            ▼                                                   │
│   ┌─────────────────────────┐    ┌───────────────────┐        │
│   │ Has power-user role &   │    │    UNTRUSTED      │        │
│   │ deviceApproved=true?    │    └───────────────────┘        │
│   └────────┬────────────────┘                                 │
│            │                                                   │
│      Yes   │   No                                             │
│            ▼                                                   │
│   ┌─────────────────┐    ┌───────────────────┐               │
│   │   POWER_USER    │    │   AUTHENTICATED   │               │
│   └─────────────────┘    └───────────────────┘               │
│                                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Notes

### Caching

Trust classification is cached per request to avoid repeated validation:

```typescript
const trustCache = new WeakMap<Request, TrustLevel>();

function getTrustLevel(request: Request, source: Source): TrustLevel {
  if (trustCache.has(request)) {
    return trustCache.get(request)!;
  }
  const level = classifyTrust(request, source);
  trustCache.set(request, level);
  return level;
}
```

### Logging

All trust decisions are logged for audit:

```typescript
await logAudit({
  requestId,
  action: "TRUST_CLASSIFIED",
  trustLevel: level,
  source: source.type,
  metadata: {
    ip: source.ip,
    hasToken: !!extractToken(request),
  },
});
```

### Upgrade Path

Trust levels cannot be upgraded within a request. A new request with proper credentials is required.

## Security Considerations

1. **Never trust headers alone** - Validate at network layer when possible
2. **Fail closed** - Unknown sources default to untrusted
3. **Log all decisions** - Enable forensic analysis
4. **Rate limit by level** - Prevent abuse at each tier
5. **Review regularly** - Audit trust assignments periodically
