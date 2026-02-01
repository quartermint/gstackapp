# Security Model

This document details the security architecture, threat model, and defense mechanisms for Mission Control.

## Threat Model

### The "Lethal Trifecta"

The primary security concern is preventing the combination of:

1. **Untrusted Input** - External requests that could contain malicious payloads
2. **AI Agent** - Claude with tool access that could be manipulated
3. **Shell Access** - Ability to execute arbitrary commands

**Defense Strategy**: Never allow all three to combine. Each layer adds constraints to break the chain.

### Attack Vectors

| Vector | Risk | Mitigation |
|--------|------|------------|
| Prompt Injection | High | Input sanitization, scoped agents |
| Token Theft | High | Short-lived tokens, Tailscale auth |
| Command Injection | Critical | Allowlist, sandbox execution |
| Data Exfiltration | Medium | Network segmentation, audit logging |
| Denial of Service | Medium | Rate limiting, resource quotas |

## Defense Layers

### Layer 1: Network Boundary (CF Worker)

```
Internet → CF Worker → [VALIDATE] → Tailscale → Hub
```

**Controls:**
- Rate limiting: 100 requests/minute per IP
- Token validation: Bearer token required
- Request size limit: 100KB max
- No direct shell access

```typescript
// Rate limiting
const rateLimiter = new RateLimiter({
  windowMs: 60_000,
  max: 100,
  keyGenerator: (req) => req.headers.get("CF-Connecting-IP"),
});

// Token validation
function validateToken(token: string): TokenClaims | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
}
```

### Layer 2: Trust Classification (Hub)

Every request is classified by trust level:

| Trust Level | Source | Capabilities |
|-------------|--------|--------------|
| `internal` | Tailscale peer, verified | Full access |
| `authenticated` | Valid user token | Limited tools |
| `untrusted` | External, unverified | Read-only chat |

```typescript
function classifyTrust(req: Request, source: Source): TrustLevel {
  // Internal: Direct Tailscale peer communication
  if (source.type === "tailscale" && source.peerVerified) {
    return "internal";
  }

  // Authenticated: Valid JWT from known user
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (token && validateToken(token)?.scope === "user") {
    return "authenticated";
  }

  // Default: Untrusted
  return "untrusted";
}
```

### Layer 3: Input Sanitization (Hub)

All user input is scanned for injection patterns:

```typescript
const INJECTION_PATTERNS = [
  // Direct instruction override attempts
  /ignore (all )?(previous|prior|above) instructions/i,
  /disregard (all )?(previous|prior|above)/i,

  // Role assumption attempts
  /you are now/i,
  /act as if you/i,
  /pretend (that )?you/i,

  // System prompt manipulation
  /system:\s*(new|override|replace)/i,
  /<\/?system>/i,
  /\[SYSTEM\]/i,

  // Tool manipulation
  /execute.*without.*restriction/i,
  /bypass.*security/i,
  /run.*command.*directly/i,
];

function sanitizeInput(message: string): SanitizeResult {
  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return {
        blocked: true,
        reason: "INJECTION_PATTERN_DETECTED",
        pattern: pattern.source,
      };
    }
  }

  // Normalize whitespace, trim
  const sanitized = message.trim().replace(/\s+/g, " ");

  // Length limit
  if (sanitized.length > 10_000) {
    return { blocked: true, reason: "MESSAGE_TOO_LONG" };
  }

  return { blocked: false, sanitized };
}
```

### Layer 4: Scoped Agents (Hub)

Each agent has strictly defined capabilities:

```typescript
interface AgentProfile {
  name: string;
  systemPrompt: string;
  allowedTools: string[];
  maxTokens: number;
  timeout: number;
}

const AGENTS: Record<string, AgentProfile> = {
  "chat-readonly": {
    name: "chat-readonly",
    systemPrompt: "You are a helpful assistant. Answer questions directly.",
    allowedTools: [], // No tools
    maxTokens: 2048,
    timeout: 30_000,
  },

  "code-assistant": {
    name: "code-assistant",
    systemPrompt: "You help with code review and exploration. You cannot modify files.",
    allowedTools: ["Read", "Glob", "Grep"],
    maxTokens: 4096,
    timeout: 60_000,
  },

  "task-orchestrator": {
    name: "task-orchestrator",
    systemPrompt: "You orchestrate multi-step tasks across compute nodes.",
    allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "TaskDispatch"],
    maxTokens: 8192,
    timeout: 300_000,
  },

  "health-processor": {
    name: "health-processor",
    systemPrompt: "You process health metrics and generate alerts.",
    allowedTools: ["ReadMetrics", "WriteAlert"],
    maxTokens: 1024,
    timeout: 10_000,
  },
};
```

### Layer 5: Command Allowlist (Compute Nodes)

Compute nodes only execute pre-approved commands:

```typescript
const COMMAND_ALLOWLIST = new Set([
  // Git operations
  "git status",
  "git diff",
  "git log",
  "git branch",

  // Build tools
  "npm install",
  "npm run build",
  "npm test",
  "pnpm install",
  "pnpm build",
  "pnpm test",

  // File operations (scoped)
  "cat",
  "ls",
  "head",
  "tail",

  // System info
  "uname",
  "whoami",
  "pwd",
]);

function validateCommand(cmd: string): boolean {
  const base = cmd.split(" ")[0];
  return COMMAND_ALLOWLIST.has(base);
}
```

### Layer 6: Sandbox Execution (Compute Nodes)

Code execution runs in isolated sandboxes:

```typescript
interface SandboxConfig {
  workDir: string;
  timeout: number;
  maxMemory: string;
  networkAccess: boolean;
  allowedPaths: string[];
}

async function executeSandboxed(
  command: string,
  config: SandboxConfig
): Promise<ExecutionResult> {
  // Validate command against allowlist
  if (!validateCommand(command)) {
    throw new SecurityError("COMMAND_NOT_ALLOWED");
  }

  // Run in sandbox
  const result = await sandbox.run(command, {
    cwd: config.workDir,
    timeout: config.timeout,
    env: {
      PATH: "/usr/bin:/bin",
      HOME: config.workDir,
    },
    limits: {
      memory: config.maxMemory,
      network: config.networkAccess,
    },
  });

  return result;
}
```

### Layer 7: Audit Logging (Convex)

All actions are logged for forensic analysis:

```typescript
interface AuditEntry {
  requestId: string;
  timestamp: number;
  source: {
    ip: string;
    userAgent: string;
    trustLevel: TrustLevel;
  };
  action: {
    type: string;
    agent: string;
    input: string; // Truncated
    output: string; // Truncated
  };
  result: {
    success: boolean;
    errorCode?: string;
    duration: number;
  };
}

async function logAudit(entry: AuditEntry): Promise<void> {
  await convex.mutation(api.audit.log, entry);
}
```

## Anomaly Detection

WAF-style monitoring detects suspicious patterns:

```typescript
interface AnomalyRule {
  name: string;
  window: number; // ms
  threshold: number;
  action: "warn" | "block" | "alert";
}

const ANOMALY_RULES: AnomalyRule[] = [
  {
    name: "high_error_rate",
    window: 60_000,
    threshold: 10, // 10 errors per minute
    action: "alert",
  },
  {
    name: "injection_attempts",
    window: 300_000,
    threshold: 3, // 3 attempts per 5 minutes
    action: "block",
  },
  {
    name: "unusual_tool_usage",
    window: 60_000,
    threshold: 50, // 50 tool calls per minute
    action: "warn",
  },
];
```

## Security Verification Checklist

Before deploying, verify:

- [ ] All API endpoints require authentication
- [ ] Rate limiting is configured
- [ ] Input sanitization is enabled
- [ ] Scoped agents are properly restricted
- [ ] Command allowlist is enforced
- [ ] Sandbox execution is working
- [ ] Audit logging is capturing events
- [ ] Anomaly detection rules are active
- [ ] Tailscale ACLs are configured
- [ ] Secrets are in environment variables, not code

## Incident Response

If a security event is detected:

1. **Contain**: Block source IP/token immediately
2. **Assess**: Review audit logs for scope
3. **Remediate**: Patch vulnerability, rotate secrets
4. **Report**: Document incident and response
5. **Improve**: Update detection rules

## Security Contacts

For security issues, create a private issue or contact the maintainers directly.
