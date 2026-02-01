# Convex Database

Mission Control uses Convex as the coordination database for real-time state synchronization.

## Overview

Convex provides:
- Real-time data synchronization
- Serverless functions
- Automatic scaling
- TypeScript-first development

## Setup

### 1. Install Convex CLI

```bash
npm install -g convex
```

### 2. Initialize Project

```bash
cd mission-control
npx convex init
```

### 3. Deploy Schema

```bash
npx convex deploy
```

## Schema

### Tables

#### conversations

```typescript
conversations: defineTable({
  title: v.optional(v.string()),
  userId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

#### messages

```typescript
messages: defineTable({
  conversationId: v.id("conversations"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  metadata: v.optional(v.object({
    model: v.optional(v.string()),
    tokens: v.optional(v.number()),
    agent: v.optional(v.string()),
  })),
  createdAt: v.number(),
}).index("by_conversation", ["conversationId"])
```

#### tasks

```typescript
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
  error: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_status", ["status"])
```

#### nodes

```typescript
nodes: defineTable({
  hostname: v.string(),
  type: v.union(
    v.literal("hub"),
    v.literal("compute"),
    v.literal("mobile")
  ),
  tailscaleIp: v.string(),
  capabilities: v.array(v.string()),
  lastSeen: v.number(),
  status: v.union(
    v.literal("online"),
    v.literal("offline"),
    v.literal("busy")
  ),
}).index("by_hostname", ["hostname"])
```

#### auditLog

```typescript
auditLog: defineTable({
  requestId: v.string(),
  timestamp: v.number(),
  source: v.object({
    ip: v.string(),
    userAgent: v.optional(v.string()),
    nodeHostname: v.optional(v.string()),
  }),
  trustLevel: v.string(),
  agent: v.optional(v.string()),
  eventType: v.string(),
  action: v.string(),
  success: v.boolean(),
  metadata: v.optional(v.any()),
  duration: v.optional(v.number()),
}).index("by_timestamp", ["timestamp"])
  .index("by_requestId", ["requestId"])
```

## Functions

### Queries

```typescript
// convex/messages.ts
export const list = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, { conversationId }) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", q => q.eq("conversationId", conversationId))
      .order("asc")
      .collect();
  },
});
```

### Mutations

```typescript
// convex/messages.ts
export const send = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("messages", {
      ...args,
      createdAt: Date.now(),
    });
    return id;
  },
});
```

### Actions

```typescript
// convex/tasks.ts
export const dispatch = action({
  args: { type: v.string(), payload: v.any() },
  handler: async (ctx, { type, payload }) => {
    // Find available node
    const nodes = await ctx.runQuery(api.nodes.listOnline);
    const node = selectNode(nodes, type);

    // Create task
    const taskId = await ctx.runMutation(api.tasks.create, {
      type,
      payload,
      assignedNode: node.hostname,
    });

    // Dispatch to node (via HTTP)
    await fetch(`http://${node.tailscaleIp}:3001/execute`, {
      method: "POST",
      body: JSON.stringify({ taskId, type, payload }),
    });

    return taskId;
  },
});
```

## Real-time Subscriptions

Clients can subscribe to live updates:

```typescript
// React example
const messages = useQuery(api.messages.list, { conversationId });

// Updates automatically when new messages are added
```

## Scheduled Functions

### Cron Jobs

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";

const crons = cronJobs();

// Mark nodes offline if no heartbeat
crons.interval(
  "check-node-health",
  { minutes: 1 },
  api.nodes.checkHealth,
);

// Clean old audit logs
crons.daily(
  "cleanup-audit-logs",
  { hourUTC: 3, minuteUTC: 0 },
  api.audit.cleanup,
);

export default crons;
```

## Development

### Local Development

```bash
# Start dev server with hot reload
npx convex dev
```

### View Dashboard

```bash
npx convex dashboard
```

### Run Functions

```bash
# Query
npx convex run messages:list '{"conversationId": "..."}'

# Mutation
npx convex run messages:send '{"conversationId": "...", "role": "user", "content": "Hello"}'
```

## Deployment

### Production Deploy

```bash
npx convex deploy
```

### Environment Variables

Set in Convex dashboard or via CLI:

```bash
npx convex env set HUB_URL http://100.x.x.x:3000
```

## Backup

Convex provides automatic backups. For manual export:

```bash
npx convex export --path ./backup
```

## Monitoring

### Logs

```bash
npx convex logs
```

### Metrics

View in Convex dashboard:
- Function invocations
- Database reads/writes
- Error rates

## Pricing

Convex free tier includes:
- 1M function calls/month
- 1GB storage
- Automatic scaling

Sufficient for most Mission Control deployments.

## Security

- All data encrypted at rest
- TLS for all connections
- Access controlled via deploy keys
- Audit logging for compliance
