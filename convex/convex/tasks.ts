import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    requestId: v.string(),
    command: v.string(),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("tasks", {
      requestId: args.requestId,
      status: "pending",
      command: args.command,
      priority: args.priority ?? 0,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  },
});

export const get = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const listByStatus = query({
  args: {
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { status, limit }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(limit ?? 50);
    return tasks;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("tasks"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    result: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, result }) => {
    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error(`Task ${id} not found`);
    }

    await ctx.db.patch(id, {
      status,
      result,
      updatedAt: Date.now(),
    });

    return id;
  },
});

export const assignToNode = mutation({
  args: {
    id: v.id("tasks"),
    nodeId: v.id("nodes"),
  },
  handler: async (ctx, { id, nodeId }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    const node = await ctx.db.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    await ctx.db.patch(id, {
      nodeId,
      status: "running",
      updatedAt: Date.now(),
    });

    // Increment active tasks on the node
    await ctx.db.patch(nodeId, {
      activeTasks: node.activeTasks + 1,
    });

    return id;
  },
});
