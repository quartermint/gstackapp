import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Log an audit event
 */
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

/**
 * Query audit logs by request ID (for forensics)
 *
 * Returns all audit log entries associated with a specific request ID,
 * useful for tracing the complete lifecycle of a request.
 */
export const queryByRequestId = query({
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

    return {
      logs,
      count: logs.length,
      requestId,
    };
  },
});

/**
 * Query audit logs by timestamp range (for dashboards)
 *
 * Returns paginated audit logs within a time range,
 * useful for building monitoring dashboards.
 */
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

/**
 * Query audit logs by time range (for dashboards)
 *
 * Enhanced version with additional metadata for dashboard display.
 */
export const queryByTimeRange = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
    action: v.optional(v.string()),
  },
  handler: async (ctx, { startTime, endTime, limit, offset, action }) => {
    // Query all logs in time range (up to a reasonable limit)
    const queryLimit = (limit ?? 100) + (offset ?? 0);

    const allLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(queryLimit * 2); // Fetch extra to account for filtering

    // Filter by time range and optionally by action
    let filtered = allLogs.filter((log) => {
      if (log.timestamp < startTime || log.timestamp > endTime) return false;
      if (action && log.action !== action) return false;
      return true;
    });

    // Apply offset
    if (offset && offset > 0) {
      filtered = filtered.slice(offset);
    }

    // Apply limit
    filtered = filtered.slice(0, limit ?? 100);

    // Calculate summary stats
    const actionCounts: Record<string, number> = {};
    for (const log of filtered) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    }

    return {
      logs: filtered,
      count: filtered.length,
      timeRange: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
      actionCounts,
      hasMore: filtered.length === (limit ?? 100),
    };
  },
});

/**
 * Get recent errors from audit logs (for alerting)
 *
 * Returns recent audit log entries that indicate errors,
 * useful for building alerting systems.
 */
export const getRecentErrors = query({
  args: {
    limit: v.optional(v.number()),
    sinceTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, { limit, sinceTimestamp }) => {
    // Define error-related action patterns
    const errorPatterns = [
      'error',
      'failed',
      'failure',
      'rejected',
      'timeout',
      'unauthorized',
      'forbidden',
      'violation',
    ];

    // Query recent logs
    const since = sinceTimestamp ?? Date.now() - 3600000; // Default: last hour

    const recentLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(1000); // Fetch a batch to filter

    // Filter for errors
    const errorLogs = recentLogs.filter((log) => {
      // Check timestamp
      if (log.timestamp < since) return false;

      // Check if action contains error patterns
      const actionLower = log.action.toLowerCase();
      for (const pattern of errorPatterns) {
        if (actionLower.includes(pattern)) return true;
      }

      // Check details for error indicators
      if (log.details) {
        try {
          const details = JSON.parse(log.details);
          if (
            details.error ||
            details.errorMessage ||
            details.status === 'failed' ||
            details.status === 'error'
          ) {
            return true;
          }
        } catch {
          // Not JSON, check string content
          const detailsLower = log.details.toLowerCase();
          for (const pattern of errorPatterns) {
            if (detailsLower.includes(pattern)) return true;
          }
        }
      }

      return false;
    });

    // Apply limit
    const limitedLogs = errorLogs.slice(0, limit ?? 50);

    // Group errors by action type
    const errorsByAction: Record<string, number> = {};
    for (const log of limitedLogs) {
      errorsByAction[log.action] = (errorsByAction[log.action] || 0) + 1;
    }

    return {
      errors: limitedLogs,
      count: limitedLogs.length,
      totalInPeriod: errorLogs.length,
      byAction: errorsByAction,
      since: new Date(since).toISOString(),
    };
  },
});

/**
 * Search audit logs with filters (for admin dashboard)
 *
 * Supports filtering by time range and action type.
 * Used by the admin API for audit log browsing.
 */
export const search = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
    action: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { startTime, endTime, action, limit }) => {
    const queryLimit = limit ?? 100;

    // Fetch logs ordered by timestamp (newest first)
    const allLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(queryLimit * 3); // Fetch extra to account for filtering

    // Filter by time range and optionally by action
    let filtered = allLogs.filter((log) => {
      if (log.timestamp < startTime || log.timestamp > endTime) return false;
      if (action && !log.action.includes(action)) return false;
      return true;
    });

    // Apply limit
    filtered = filtered.slice(0, queryLimit);

    // Calculate action counts
    const actionCounts: Record<string, number> = {};
    for (const log of filtered) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    }

    return {
      logs: filtered,
      count: filtered.length,
      timeRange: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
      actionCounts,
    };
  },
});

/**
 * Export audit logs for bulk retrieval (for admin dashboard export)
 *
 * Returns all logs in a time range for export to JSON/CSV.
 * Limit is higher than search to support full exports.
 */
export const export_ = query({
  args: {
    startTime: v.number(),
    endTime: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { startTime, endTime, limit }) => {
    const queryLimit = limit ?? 1000;

    // Fetch logs ordered by timestamp (oldest first for export)
    const allLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_timestamp")
      .order("asc")
      .take(queryLimit * 2); // Fetch extra to account for filtering

    // Filter by time range
    const filtered = allLogs.filter((log) => {
      return log.timestamp >= startTime && log.timestamp <= endTime;
    });

    // Apply limit
    const limitedLogs = filtered.slice(0, queryLimit);

    return {
      logs: limitedLogs,
      count: limitedLogs.length,
      timeRange: {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
      },
      exportedAt: new Date().toISOString(),
    };
  },
});

/**
 * Get all audit log events for a specific request ID (for forensics)
 *
 * Returns all events with a timeline showing the request lifecycle.
 * Enhanced version of queryByRequestId with timeline generation.
 */
export const getByRequestId = query({
  args: {
    requestId: v.string(),
  },
  handler: async (ctx, { requestId }) => {
    const logs = await ctx.db
      .query("auditLog")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .order("asc")
      .collect();

    if (logs.length === 0) {
      return {
        logs: [],
        count: 0,
        requestId,
        timeline: null,
      };
    }

    // Generate timeline summary
    const firstLog = logs[0];
    const lastLog = logs[logs.length - 1];
    const durationMs = lastLog!.timestamp - firstLog!.timestamp;

    const timeline = {
      start: new Date(firstLog!.timestamp).toISOString(),
      end: new Date(lastLog!.timestamp).toISOString(),
      durationMs,
      eventCount: logs.length,
      actions: logs.map((log) => ({
        action: log.action,
        timestamp: new Date(log.timestamp).toISOString(),
        relativeMs: log.timestamp - firstLog!.timestamp,
      })),
    };

    return {
      logs,
      count: logs.length,
      requestId,
      timeline,
    };
  },
});

/**
 * Get audit log statistics (for monitoring dashboards)
 *
 * Note: Convex doesn't support timestamp range queries on indexes, so we
 * fetch recent logs and filter client-side. This is a known limitation -
 * for high-volume production, consider pre-aggregating stats or using a
 * time-series database.
 */
export const getStats = query({
  args: {
    periodMs: v.optional(v.number()),
  },
  handler: async (ctx, { periodMs }) => {
    const period = periodMs ?? 3600000; // Default: 1 hour
    const since = Date.now() - period;

    // Capped to prevent excessive reads
    const recentLogs = await ctx.db
      .query("auditLog")
      .withIndex("by_timestamp")
      .order("desc")
      .take(1000);

    const logsInPeriod = recentLogs.filter((log) => log.timestamp >= since);

    // Count by action
    const actionCounts: Record<string, number> = {};
    const userCounts: Record<string, number> = {};
    const ipCounts: Record<string, number> = {};

    for (const log of logsInPeriod) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;

      if (log.userId) {
        userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
      }

      if (log.sourceIp) {
        ipCounts[log.sourceIp] = (ipCounts[log.sourceIp] || 0) + 1;
      }
    }

    // Calculate rate (events per minute)
    const periodMinutes = period / 60000;
    const ratePerMinute = logsInPeriod.length / periodMinutes;

    return {
      total: logsInPeriod.length,
      period: {
        ms: period,
        since: new Date(since).toISOString(),
      },
      ratePerMinute: Math.round(ratePerMinute * 100) / 100,
      byAction: actionCounts,
      uniqueUsers: Object.keys(userCounts).length,
      uniqueIps: Object.keys(ipCounts).length,
      topUsers: Object.entries(userCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count })),
      topIps: Object.entries(ipCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([ip, count]) => ({ ip, count })),
    };
  },
});
