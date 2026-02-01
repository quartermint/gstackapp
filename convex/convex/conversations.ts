import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("conversations", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const get = query({
  args: { id: v.id("conversations") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const conversations = await ctx.db
      .query("conversations")
      .order("desc")
      .take(limit ?? 50);
    return conversations;
  },
});

export const update = mutation({
  args: {
    id: v.id("conversations"),
    title: v.optional(v.string()),
    trustLevel: v.optional(
      v.union(
        v.literal("internal"),
        v.literal("authenticated"),
        v.literal("untrusted")
      )
    ),
    agentProfile: v.optional(
      v.union(
        v.literal("chat-readonly"),
        v.literal("code-assistant"),
        v.literal("task-orchestrator")
      )
    ),
  },
  handler: async (ctx, { id, ...updates }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Conversation ${id} not found`);
    }

    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return id;
  },
});
