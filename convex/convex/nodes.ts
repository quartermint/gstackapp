import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsert = mutation({
  args: {
    hostname: v.string(),
    status: v.union(
      v.literal("online"),
      v.literal("offline"),
      v.literal("busy")
    ),
    load: v.number(),
    activeTasks: v.number(),
    capabilities: v.array(v.string()),
    tailscaleIp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("nodes")
      .withIndex("by_hostname", (q) => q.eq("hostname", args.hostname))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        lastHeartbeat: now,
      });
      return existing._id;
    }

    const id = await ctx.db.insert("nodes", {
      ...args,
      lastHeartbeat: now,
    });
    return id;
  },
});

export const get = query({
  args: { hostname: v.string() },
  handler: async (ctx, { hostname }) => {
    return await ctx.db
      .query("nodes")
      .withIndex("by_hostname", (q) => q.eq("hostname", hostname))
      .first();
  },
});

export const listOnline = query({
  args: {},
  handler: async (ctx) => {
    const nodes = await ctx.db.query("nodes").collect();
    return nodes.filter((node) => node.status === "online" || node.status === "busy");
  },
});

export const markOffline = mutation({
  args: { hostname: v.string() },
  handler: async (ctx, { hostname }) => {
    const node = await ctx.db
      .query("nodes")
      .withIndex("by_hostname", (q) => q.eq("hostname", hostname))
      .first();

    if (!node) {
      throw new Error(`Node ${hostname} not found`);
    }

    await ctx.db.patch(node._id, {
      status: "offline",
    });

    return node._id;
  },
});

export const markStaleOffline = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const staleThreshold = 3 * 60 * 1000; // 3 minutes (3 heartbeat intervals)

    const nodes = await ctx.db.query("nodes").collect();
    const staleNodes = nodes.filter(
      (node) =>
        (node.status === "online" || node.status === "busy") &&
        now - node.lastHeartbeat > staleThreshold
    );

    for (const node of staleNodes) {
      await ctx.db.patch(node._id, {
        status: "offline",
      });
    }

    return staleNodes.length;
  },
});
