# Phase 1: Network Foundation

This phase establishes the core network infrastructure: Tailscale mesh and Convex database.

## Overview

```
┌─────────────────────────────────────────────────┐
│              Tailscale Network                  │
│                                                 │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│   │ Hetzner │  │Mac mini │  │ iPhone  │       │
│   │ Hub     │  │         │  │         │       │
│   └────┬────┘  └────┬────┘  └────┬────┘       │
│        │            │            │             │
│        └────────────┼────────────┘             │
│                     │                          │
│              ┌──────▼──────┐                   │
│              │   Convex    │                   │
│              │  (Cloud)    │                   │
│              └─────────────┘                   │
└─────────────────────────────────────────────────┘
```

## Prerequisites

- Tailscale account
- Convex account
- SSH access to all nodes

## Part 1: Tailscale Setup

### 1.1 Create Tailscale Account

1. Go to https://tailscale.com
2. Sign up with your preferred auth provider
3. Note your tailnet name (e.g., `yourname.ts.net`)

### 1.2 Generate Auth Keys

```bash
# In Tailscale admin console:
# Settings → Keys → Generate auth key

# Options:
# - Reusable: Yes (for multiple nodes)
# - Ephemeral: No (we want persistent nodes)
# - Tags: tag:mission-control
```

### 1.3 Install on Each Node

**Hetzner (Ubuntu/Debian):**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-xxxxx --hostname=hub
```

**Mac mini:**
```bash
brew install tailscale
sudo tailscale up --authkey=tskey-xxxxx --hostname=macmini
```

**MacBook:**
```bash
brew install tailscale
sudo tailscale up --authkey=tskey-xxxxx --hostname=macbook
```

**iOS:**
- Download Tailscale from App Store
- Sign in with same account
- Device will auto-join the tailnet

### 1.4 Configure ACLs

In Tailscale admin console, set up ACLs:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["tag:mission-control"],
      "dst": ["tag:mission-control:*"]
    }
  ],
  "tagOwners": {
    "tag:mission-control": ["autogroup:admin"]
  }
}
```

### 1.5 Verify Connectivity

```bash
# From Hub
tailscale ping macmini
tailscale ping macbook

# Check status
tailscale status
```

## Part 2: Convex Setup

### 2.1 Create Project

```bash
# Install Convex CLI
npm install -g convex

# Initialize project
cd mission-control
npx convex init
```

### 2.2 Define Schema

Create `convex/schema.ts`:

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Conversations
  conversations: defineTable({
    title: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  // Messages
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
  }).index("by_conversation", ["conversationId"]),

  // Tasks
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
  }).index("by_status", ["status"]),

  // Node registry
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
  }).index("by_hostname", ["hostname"]),

  // Audit log
  auditLog: defineTable({
    requestId: v.string(),
    source: v.string(),
    trustLevel: v.string(),
    agent: v.string(),
    action: v.string(),
    success: v.boolean(),
    errorCode: v.optional(v.string()),
    duration: v.number(),
    metadata: v.optional(v.any()),
    timestamp: v.number(),
  }).index("by_timestamp", ["timestamp"]),
});
```

### 2.3 Deploy Schema

```bash
npx convex deploy
```

### 2.4 Create Basic Functions

Create `convex/nodes.ts`:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const heartbeat = mutation({
  args: {
    hostname: v.string(),
    type: v.union(v.literal("hub"), v.literal("compute"), v.literal("mobile")),
    tailscaleIp: v.string(),
    capabilities: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("nodes")
      .withIndex("by_hostname", (q) => q.eq("hostname", args.hostname))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastSeen: Date.now(),
        status: "online",
        tailscaleIp: args.tailscaleIp,
        capabilities: args.capabilities,
      });
    } else {
      await ctx.db.insert("nodes", {
        ...args,
        lastSeen: Date.now(),
        status: "online",
      });
    }
  },
});

export const list = query({
  handler: async (ctx) => {
    return await ctx.db.query("nodes").collect();
  },
});
```

### 2.5 Get Deployment URL

```bash
npx convex dashboard
# Note your deployment URL: https://your-deployment.convex.cloud
```

## Verification Checklist

- [ ] Tailscale installed on all nodes
- [ ] All nodes visible in `tailscale status`
- [ ] Nodes can ping each other via Tailscale IPs
- [ ] ACLs configured and working
- [ ] Convex project created
- [ ] Schema deployed
- [ ] Deployment URL noted

## Environment Variables

Save these for later phases:

```bash
# .env.local
TAILSCALE_TAILNET=yourname.ts.net
CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod:xxxxx
```

## Troubleshooting

### Tailscale not connecting
```bash
sudo tailscale down
sudo tailscale up --reset
```

### Convex deployment fails
```bash
npx convex logs
# Check for schema errors
```

## Next Steps

Proceed to [Phase 2: Hub Deployment](phase-2-hub.md)
