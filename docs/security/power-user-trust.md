# Power User Trust Level

This document describes the POWER_USER trust level, an intermediate tier between AUTHENTICATED and INTERNAL.

## Overview

### Definition

POWER_USER is an elevated trust level for authenticated users who have been granted additional privileges beyond standard authentication. Power users can perform actions that regular authenticated users cannot, such as creating tasks and executing sandboxed code, while still being restricted from full administrative access.

### Trust Hierarchy

The complete trust hierarchy from lowest to highest:

```
UNTRUSTED < AUTHENTICATED < POWER_USER < INTERNAL
```

| Level | Description |
|-------|-------------|
| UNTRUSTED | No authentication, public access only |
| AUTHENTICATED | Valid JWT token, standard user privileges |
| **POWER_USER** | Valid JWT + role claim + device approval |
| INTERNAL | Tailscale peer, full system access |

### Purpose and Use Cases

Power users are typically:

- **Trusted developers** who need to create and manage tasks without full admin access
- **Automation accounts** running on approved devices
- **CI/CD pipelines** that require elevated permissions for deployment tasks
- **Mobile power users** accessing from approved personal devices

## JWT Claims Required

For a request to be classified as POWER_USER, the JWT token must contain both of the following claims:

### `role` Claim

```json
{
  "sub": "user-123",
  "role": "power-user",
  ...
}
```

The `role` claim must be exactly `'power-user'`. Other role values (e.g., `'admin'`, `'user'`) do not qualify for POWER_USER trust level.

### `deviceApproved` Claim

```json
{
  "sub": "user-123",
  "role": "power-user",
  "deviceApproved": true,
  ...
}
```

The `deviceApproved` claim must be exactly `true` (boolean). This ensures the token was issued for an approved device.

### Complete Token Example

```json
{
  "sub": "user-456",
  "iat": 1704067200,
  "exp": 1704070800,
  "role": "power-user",
  "deviceApproved": true,
  "deviceId": "device-abc123"
}
```

### Verification Logic

From `packages/hub/src/services/trust.ts`:

```typescript
function isPowerUser(claims: Record<string, unknown>): boolean {
  return (
    claims['role'] === 'power-user' &&
    claims['deviceApproved'] === true
  );
}
```

## Capability Matrix

The following table compares capabilities across all trust levels:

| Capability | Untrusted | Authenticated | Power User | Internal |
|------------|-----------|---------------|------------|----------|
| Read public content | Yes | Yes | Yes | Yes |
| User profile access | No | Yes | Yes | Yes |
| Conversation management | No | Yes | Yes | Yes |
| Create tasks | No | No | Yes | Yes |
| Execute sandboxed code | No | No | Yes | Yes |
| Admin endpoints | No | No | No | Yes |
| Node management | No | No | No | Yes |

### Agent Mapping

| Trust Level | Available Agents |
|-------------|------------------|
| Untrusted | chat-readonly (no tools) |
| Authenticated | code-assistant, chat-readonly |
| Power User | task-orchestrator (sandboxed), code-assistant, chat-readonly |
| Internal | task-orchestrator (full), code-assistant, health-processor, chat-readonly |

### Rate Limits

| Trust Level | Requests/min | Max Message Size | Timeout |
|-------------|--------------|------------------|---------|
| Untrusted | 10 | 10KB | 30s |
| Authenticated | 60 | 100KB | 60s |
| Power User | 120 | 250KB | 120s |
| Internal | Unlimited | 1MB | 5min |

## Device Approval Workflow

### Purpose of Device Approval

Device approval adds a second factor to power user authentication. Even if a user has the `power-user` role, they cannot access power user capabilities unless they are on an approved device. This provides:

1. **Defense in depth** - Compromised credentials alone are insufficient
2. **Device binding** - Limits lateral movement if tokens are stolen
3. **Audit trail** - All power user actions are tied to specific devices
4. **Revocation control** - Devices can be disabled without invalidating user credentials

### How Devices Are Approved

Device approval is an administrative action. The typical workflow:

1. **User requests access** - User initiates device enrollment from their app
2. **Device registers** - Device submits its unique identifier and metadata
3. **Admin reviews** - Administrator reviews the device request in the admin dashboard
4. **Approval granted** - Admin approves the device, enabling the `deviceApproved` claim
5. **Token issued** - Next token refresh includes `deviceApproved: true`

```
User Device                    Hub                         Admin
    |                           |                            |
    |-- 1. Register device ---->|                            |
    |                           |-- 2. Pending request ----->|
    |                           |                            |
    |                           |<-- 3. Approve device ------|
    |                           |                            |
    |<-- 4. Confirmation -------|                            |
    |                           |                            |
    |-- 5. Refresh token ------>|                            |
    |<-- 6. Token w/ approval --|                            |
```

### Approval Revocation

When device approval is revoked:

1. **Immediate effect** - The device's `deviceApproved` status is set to `false` in the database
2. **Token expiry** - Existing tokens continue to work until they expire (max 15 minutes for access tokens)
3. **Refresh blocked** - Token refresh will issue tokens without `deviceApproved: true`
4. **Downgrade** - User is downgraded to AUTHENTICATED trust level

For immediate revocation, administrators can also:
- Invalidate all tokens for the device
- Add the device to a blocklist
- Disable the user account entirely

## Security Considerations

### Why Both Claims Are Required

Requiring both `role` and `deviceApproved` provides layered security:

| Attack Scenario | Protection |
|-----------------|------------|
| Stolen token from non-approved device | `deviceApproved` will be `false` |
| User's role downgraded by admin | `role` won't be `'power-user'` |
| Token forged with power-user role | Signature verification fails |
| Replay attack on different device | Device ID mismatch in audit |

### Rate Limiting for Power Users

Power users have higher rate limits (120 req/min vs 60 req/min for authenticated), but are still rate-limited to prevent abuse. Additional safeguards:

- Per-device rate limiting (not just per-user)
- Separate limits for task creation operations
- Burst detection with temporary throttling

### Audit Logging of Power User Actions

All power user actions are logged with enhanced detail:

```typescript
await logAudit({
  requestId,
  action: 'task.create',
  trustLevel: 'power-user',
  userId: claims.sub,
  deviceId: claims.deviceId,
  metadata: {
    taskType: 'code-execution',
    sandboxed: true,
  },
});
```

Key audit fields for power user actions:
- `deviceId` - Which approved device performed the action
- `trustLevel` - Always `'power-user'` for these actions
- `taskType` - What kind of elevated action was performed

### Token Rotation Recommendations

For power user tokens:

| Token Type | Recommended Expiry | Notes |
|------------|-------------------|-------|
| Access Token | 15 minutes | Short-lived to limit exposure |
| Refresh Token | 7 days | Rotate on each use |
| Device Token | 30 days | Used for device re-approval |

Best practices:
- Enable refresh token rotation (`rotateRefreshToken: true`)
- Require re-authentication for device changes
- Implement device activity monitoring
- Set up alerts for unusual power user activity patterns

## Implementation Reference

### Trust Classification

See `packages/hub/src/services/trust.ts`:

- `classifyTrust()` - Synchronous trust classification (decodes JWT without signature verification)
- `classifyTrustAsync()` - Async trust classification with full JWT signature verification
- `isPowerUser()` - Checks if JWT claims qualify for power user status

### Middleware

See `packages/hub/src/middleware/auth.ts`:

- `requirePowerUser(auditPrefix)` - Middleware that requires POWER_USER or higher trust level
- `requireTrustLevel(level, options)` - Generic trust level requirement middleware

### Usage Example

```typescript
import { requirePowerUser } from '../middleware/auth.js';

// Route that requires power user access
app.post('/api/tasks', {
  preHandler: requirePowerUser('tasks'),
  handler: async (request, reply) => {
    // Only power users and internal requests reach here
    const task = await createTask(request.body);
    reply.send({ success: true, task });
  },
});
```

## Related Documentation

- [Trust Levels](./trust-levels.md) - Overview of all trust levels
- [Audit Logging](./audit-logging.md) - Audit log structure and queries
- [Scoped Agents](./scoped-agents.md) - Agent capabilities by trust level
