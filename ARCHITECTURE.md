# Architecture

This document describes the complete Mission Control architecture, merging the base multi-node system with security hardening.

## System Overview

Mission Control is a 5-node distributed system that provides secure, cost-effective AI orchestration using Claude Max subscription.

### Node Roles

| Node | Location | Role | Trust Level |
|------|----------|------|-------------|
| CF Worker | Cloudflare Edge | Entry point, initial validation | Untrusted input handler |
| Hetzner Hub | Frankfurt DC | Claude CLI, orchestration | Internal (trusted) |
| Mac mini | Home network | Heavy compute, code execution | Internal (trusted) |
| MacBook | Mobile | On-demand compute | Internal (trusted) |
| Mobile | iOS/watchOS | Monitoring, quick chat | Authenticated |

## Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REQUEST PIPELINE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ENTRY (CF Worker)                                                        │
│     ├─ Rate limiting                                                         │
│     ├─ Token validation                                                      │
│     └─ Forward to Hub via Tailscale                                         │
│                                                                              │
│  2. SECURITY PIPELINE (Hub)                                                  │
│     ├─ Parse: Validate JSON structure                                        │
│     ├─ Sanitize: Detect injection patterns                                   │
│     ├─ Classify: Assign trust level                                          │
│     ├─ Route: Select appropriate agent/node                                  │
│     ├─ Execute: Run with scoped permissions                                  │
│     └─ Validate: Check output structure                                      │
│                                                                              │
│  3. EXECUTION                                                                │
│     ├─ Chat: Handle directly on Hub                                          │
│     ├─ Code: Dispatch to Mac mini sandbox                                    │
│     └─ Task: Orchestrate multi-step workflow                                 │
│                                                                              │
│  4. RESPONSE                                                                 │
│     ├─ Validate output schema                                                │
│     ├─ Log to Convex audit trail                                            │
│     └─ Return structured response                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Security Pipeline

All requests pass through a multi-stage security pipeline on the Hub:

### Stage 1: Parse
```typescript
const parsed = ChatRequestSchema.safeParse(rawInput);
if (!parsed.success) {
  return { error: "INVALID_REQUEST", details: parsed.error };
}
```

### Stage 2: Sanitize
```typescript
const INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /you are now/i,
  /system:\s*override/i,
  /<\/?system>/i,
];

function sanitize(message: string): SanitizeResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(message)) {
      return { blocked: true, reason: "INJECTION_DETECTED" };
    }
  }
  return { blocked: false, sanitized: message.trim() };
}
```

### Stage 3: Classify
```typescript
type TrustLevel = "internal" | "authenticated" | "untrusted";

function classifyRequest(req: ChatRequest, source: Source): TrustLevel {
  if (source.type === "tailscale" && source.verified) return "internal";
  if (req.auth?.valid && req.auth.scope === "user") return "authenticated";
  return "untrusted";
}
```

### Stage 4: Route
```typescript
function selectAgent(req: ChatRequest, trust: TrustLevel): AgentProfile {
  if (trust === "untrusted") return AGENTS.chatReadonly;
  if (req.intent === "code") return AGENTS.codeAssistant;
  if (req.intent === "task") return AGENTS.taskOrchestrator;
  return AGENTS.chatReadonly;
}
```

### Stage 5: Execute
Run the request with the scoped agent, enforcing tool restrictions.

### Stage 6: Validate
```typescript
const response = ChatResponseSchema.safeParse(rawOutput);
if (!response.success) {
  return { error: "INVALID_RESPONSE", details: response.error };
}
```

## Scoped Agents

Each agent has a defined capability set:

| Agent | Tools | Use Case |
|-------|-------|----------|
| chat-readonly | None | Simple Q&A, untrusted users |
| code-assistant | Read, Grep, Glob | Code exploration, authenticated |
| task-orchestrator | All + Dispatch | Multi-step workflows, internal |
| health-processor | Metrics, Alert | System monitoring, internal |

## Data Flow

### Convex Schema

```typescript
// Messages table
messages: defineTable({
  conversationId: v.string(),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  metadata: v.optional(v.object({
    model: v.string(),
    tokens: v.number(),
  })),
  createdAt: v.number(),
});

// Tasks table
tasks: defineTable({
  status: v.union(
    v.literal("pending"),
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed")
  ),
  type: v.string(),
  payload: v.any(),
  assignedNode: v.optional(v.string()),
  result: v.optional(v.any()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

// Audit log
auditLog: defineTable({
  requestId: v.string(),
  source: v.string(),
  trustLevel: v.string(),
  agent: v.string(),
  action: v.string(),
  success: v.boolean(),
  metadata: v.optional(v.any()),
  timestamp: v.number(),
});
```

## Network Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        TAILSCALE MESH                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Internet                     Tailscale Network (100.x.x.x)    │
│   ────────                     ─────────────────────────────    │
│                                                                  │
│   ┌─────────┐                  ┌─────────────┐                  │
│   │ Client  │───HTTPS──────────│ CF Worker   │                  │
│   └─────────┘                  └──────┬──────┘                  │
│                                       │                          │
│                                       │ Tailscale               │
│                                       ▼                          │
│                                ┌─────────────┐                  │
│                                │ Hetzner Hub │                  │
│                                │ 100.x.x.10  │                  │
│                                └──────┬──────┘                  │
│                                       │                          │
│                          ┌────────────┼────────────┐            │
│                          │            │            │            │
│                          ▼            ▼            ▼            │
│                   ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│                   │ Mac mini │ │ MacBook  │ │  iPhone  │       │
│                   │100.x.x.20│ │100.x.x.30│ │100.x.x.40│       │
│                   └──────────┘ └──────────┘ └──────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### CF Worker (packages/worker)
- Entry point for all external requests
- Rate limiting (100 req/min per IP)
- Token validation
- Forwards to Hub via Tailscale

### Hetzner Hub (packages/hub)
- Runs Claude CLI with Max subscription
- Security pipeline implementation
- Task orchestration
- Convex sync

### Compute Nodes (packages/compute)
- Mac mini: Always-on, heavy compute
- MacBook: On-demand, portable
- Sandbox execution for code tasks
- Command allowlist enforcement

### Mobile Apps (apps/ios, apps/watchos)
- Real-time monitoring
- Quick chat interface
- Push notifications for task completion

## Error Handling

All errors are categorized and logged:

```typescript
type ErrorCode =
  | "RATE_LIMITED"
  | "INVALID_TOKEN"
  | "INVALID_REQUEST"
  | "INJECTION_DETECTED"
  | "AGENT_ERROR"
  | "EXECUTION_TIMEOUT"
  | "INVALID_RESPONSE";

interface ErrorResponse {
  error: ErrorCode;
  message: string;
  requestId: string;
}
```

## Deployment

See [infra/README.md](infra/README.md) for deployment configurations including:
- Systemd service for Hub
- Launchd agent for Mac compute nodes
- Wrangler config for CF Worker
