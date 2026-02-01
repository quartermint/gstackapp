import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    requestId: v.string(),
    command: v.string(),
    priority: v.optional(v.number()),
    workflowId: v.optional(v.string()),
    workflowStepId: v.optional(v.string()),
    dependencies: v.optional(v.array(v.id("tasks"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert("tasks", {
      requestId: args.requestId,
      status: "pending",
      command: args.command,
      priority: args.priority ?? 0,
      workflowId: args.workflowId,
      workflowStepId: args.workflowStepId,
      dependencies: args.dependencies,
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
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, { id, nodeId, timeoutMs }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    const node = await ctx.db.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const now = Date.now();
    const timeoutAt = timeoutMs ? now + timeoutMs : undefined;

    await ctx.db.patch(id, {
      nodeId,
      status: "running",
      updatedAt: now,
      timeoutAt,
    });

    // Increment active tasks on the node
    await ctx.db.patch(nodeId, {
      activeTasks: node.activeTasks + 1,
    });

    return id;
  },
});

/**
 * Internal mutation to mark timed-out running tasks
 * Called by the cron job for task timeout recovery
 */
export const markTimedOut = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find all running tasks that have exceeded their timeout
    const runningTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();

    const timedOutTasks = runningTasks.filter(
      (task) => task.timeoutAt && now > task.timeoutAt
    );

    let markedCount = 0;
    for (const task of timedOutTasks) {
      // Decrement active tasks on the assigned node
      if (task.nodeId) {
        const node = await ctx.db.get(task.nodeId);
        if (node && node.activeTasks > 0) {
          await ctx.db.patch(task.nodeId, {
            activeTasks: node.activeTasks - 1,
          });
        }
      }

      // Mark task as failed with timeout error
      await ctx.db.patch(task._id, {
        status: "failed",
        errorMessage: "Task execution timed out",
        updatedAt: now,
        retryCount: (task.retryCount ?? 0) + 1,
      });

      markedCount++;
    }

    return markedCount;
  },
});

/**
 * Move a failed task to the dead letter queue
 * Tasks are moved to DLQ when they have exceeded max retries
 */
export const moveToDeadLetter = mutation({
  args: {
    id: v.id("tasks"),
    reason: v.string(),
  },
  handler: async (ctx, { id, reason }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    await ctx.db.patch(id, {
      status: "dead-letter",
      errorMessage: reason,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Internal mutation to process tasks in the dead letter queue
 * Moves tasks with excessive retries to dead-letter status
 */
export const processDeadLetterQueue = internalMutation({
  args: {
    maxRetries: v.optional(v.number()),
  },
  handler: async (ctx, { maxRetries = 3 }) => {
    // Find failed tasks that have exceeded max retries
    const failedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .collect();

    const tasksToMove = failedTasks.filter(
      (task) => (task.retryCount ?? 0) >= maxRetries
    );

    let movedCount = 0;
    for (const task of tasksToMove) {
      await ctx.db.patch(task._id, {
        status: "dead-letter",
        errorMessage: `Moved to dead letter queue after ${task.retryCount ?? 0} retries. Last error: ${task.errorMessage ?? "Unknown"}`,
        updatedAt: Date.now(),
      });
      movedCount++;
    }

    return movedCount;
  },
});

/**
 * List tasks in the dead letter queue
 */
export const listDeadLetter = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { limit }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "dead-letter"))
      .order("desc")
      .take(limit ?? 50);
    return tasks;
  },
});

/**
 * Retry a task from the dead letter queue
 */
export const retryFromDeadLetter = mutation({
  args: {
    id: v.id("tasks"),
  },
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== "dead-letter") {
      throw new Error(`Task ${id} is not in dead-letter status`);
    }

    await ctx.db.patch(id, {
      status: "pending",
      nodeId: undefined,
      errorMessage: undefined,
      timeoutAt: undefined,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Update task priority
 */
export const updatePriority = mutation({
  args: {
    id: v.id("tasks"),
    priority: v.number(),
  },
  handler: async (ctx, { id, priority }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (task.status !== "pending") {
      throw new Error(`Cannot update priority of task in ${task.status} status`);
    }

    await ctx.db.patch(id, {
      priority,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * List tasks by workflow ID
 */
export const listByWorkflow = query({
  args: {
    workflowId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { workflowId, limit }) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_workflowId", (q) => q.eq("workflowId", workflowId))
      .order("desc")
      .take(limit ?? 100);
    return tasks;
  },
});

/**
 * Update task dependencies
 */
export const updateDependencies = mutation({
  args: {
    id: v.id("tasks"),
    dependencies: v.array(v.id("tasks")),
  },
  handler: async (ctx, { id, dependencies }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    await ctx.db.patch(id, {
      dependencies,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Check if all dependencies of a task are completed
 */
export const checkDependenciesComplete = query({
  args: {
    id: v.id("tasks"),
  },
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task) {
      throw new Error(`Task ${id} not found`);
    }

    if (!task.dependencies || task.dependencies.length === 0) {
      return { complete: true, pending: [], failed: [] };
    }

    const pending: string[] = [];
    const failed: string[] = [];

    for (const depId of task.dependencies) {
      const dep = await ctx.db.get(depId);
      if (!dep) {
        failed.push(depId);
        continue;
      }

      if (dep.status === "completed") {
        continue;
      } else if (dep.status === "failed" || dep.status === "dead-letter" || dep.status === "cancelled") {
        failed.push(depId);
      } else {
        pending.push(depId);
      }
    }

    return {
      complete: pending.length === 0 && failed.length === 0,
      pending,
      failed,
    };
  },
});

/**
 * Get tasks that are ready to run (pending with all dependencies complete)
 */
export const getReadyTasks = query({
  args: {
    workflowId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { workflowId, limit }) => {
    // Get pending tasks, optionally filtered by workflow
    let pendingQuery = ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "pending"));

    const pendingTasks = await pendingQuery.take(limit ?? 100);

    // Filter by workflow if specified
    const filteredTasks = workflowId
      ? pendingTasks.filter((t) => t.workflowId === workflowId)
      : pendingTasks;

    // Check dependencies for each task
    const readyTasks = [];
    for (const task of filteredTasks) {
      if (!task.dependencies || task.dependencies.length === 0) {
        readyTasks.push(task);
        continue;
      }

      let allComplete = true;
      for (const depId of task.dependencies) {
        const dep = await ctx.db.get(depId);
        if (!dep || dep.status !== "completed") {
          allComplete = false;
          break;
        }
      }

      if (allComplete) {
        readyTasks.push(task);
      }
    }

    return readyTasks;
  },
});
