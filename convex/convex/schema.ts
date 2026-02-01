import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    title: v.optional(v.string()),
    userId: v.optional(v.string()),
    trustLevel: v.union(
      v.literal("internal"),
      v.literal("authenticated"),
      v.literal("untrusted")
    ),
    agentProfile: v.union(
      v.literal("chat-readonly"),
      v.literal("code-assistant"),
      v.literal("task-orchestrator")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    timestamp: v.number(),
  }).index("by_conversation", ["conversationId"]),

  tasks: defineTable({
    requestId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("dead-letter")
    ),
    command: v.string(),
    nodeId: v.optional(v.id("nodes")),
    result: v.optional(v.string()),
    priority: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** Required capabilities (tags) for node matching */
    requiredCapabilities: v.optional(v.array(v.string())),
    /** Timeout timestamp for recovery */
    timeoutAt: v.optional(v.number()),
    /** Retry count for dead letter queue processing */
    retryCount: v.optional(v.number()),
    /** Error message for failed/dead-letter tasks */
    errorMessage: v.optional(v.string()),
    /** Workflow instance ID this task belongs to */
    workflowId: v.optional(v.string()),
    /** Step ID within the workflow */
    workflowStepId: v.optional(v.string()),
    /** Task IDs that must complete before this task can run */
    dependencies: v.optional(v.array(v.id("tasks"))),
  })
    .index("by_status", ["status"])
    .index("by_workflowId", ["workflowId"]),

  nodes: defineTable({
    hostname: v.string(),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("busy"),
      v.literal("draining")
    ),
    load: v.number(),
    activeTasks: v.number(),
    capabilities: v.array(v.string()),
    lastHeartbeat: v.number(),
    tailscaleIp: v.optional(v.string()),
  }).index("by_hostname", ["hostname"]),

  auditLog: defineTable({
    requestId: v.string(),
    timestamp: v.number(),
    action: v.string(),
    details: v.optional(v.string()),
    sourceIp: v.optional(v.string()),
    userId: v.optional(v.string()),
  })
    .index("by_requestId", ["requestId"])
    .index("by_timestamp", ["timestamp"]),

  apiKeys: defineTable({
    /** External key ID (UUID) */
    keyId: v.string(),
    /** SHA-256 hash of the API key */
    keyHash: v.string(),
    /** First 11 characters of the key for identification */
    keyPrefix: v.string(),
    /** Display name for the key */
    name: v.string(),
    /** Service or user that owns this key */
    ownerId: v.string(),
    /** Owner type */
    ownerType: v.union(v.literal("service"), v.literal("user")),
    /** Scopes/permissions granted to this key */
    scopes: v.array(v.string()),
    /** Environment the key is valid for */
    environment: v.union(
      v.literal("development"),
      v.literal("staging"),
      v.literal("production")
    ),
    /** Whether the key is currently active */
    active: v.boolean(),
    /** Optional expiration timestamp (epoch seconds) */
    expiresAt: v.optional(v.number()),
    /** Last used timestamp (epoch seconds) */
    lastUsedAt: v.optional(v.number()),
    /** Created timestamp (epoch seconds) */
    createdAt: v.number(),
    /** Optional metadata */
    metadata: v.optional(v.any()),
  })
    .index("by_keyId", ["keyId"])
    .index("by_keyHash", ["keyHash"])
    .index("by_ownerId", ["ownerId"])
    .index("by_active", ["active"]),
});
