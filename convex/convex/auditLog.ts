import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const log = mutation({
  args: {
    requestId: v.string(),
    action: v.string(),
    details: v.optional(v.string()),
    sourceIp: v.optional(v.string()),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("auditLog", {
      ...args,
      timestamp: Date.now(),
    });
    return id;
  },
});

export const listByRequestId = query({
  args: {
    requestId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { requestId, limit }) => {
    const logs = await ctx.db
      .query("auditLog")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .order("asc")
      .take(limit ?? 100);
    return logs;
  },
});

export const listByTimestamp = query({
  args: {
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { startTime, endTime, limit }) => {
    let queryBuilder = ctx.db
      .query("auditLog")
      .withIndex("by_timestamp");

    const logs = await queryBuilder.order("desc").take(limit ?? 50);

    // Filter by time range if provided
    const filtered = logs.filter((log) => {
      if (startTime && log.timestamp < startTime) return false;
      if (endTime && log.timestamp > endTime) return false;
      return true;
    });

    return {
      logs: filtered,
      nextCursor: filtered.length === (limit ?? 50) ? filtered[filtered.length - 1]?._id : null,
    };
  },
});
