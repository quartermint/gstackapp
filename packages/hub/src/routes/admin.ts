/**
 * Admin routes - Administrative endpoints for system monitoring and management
 *
 * All routes are prefixed with /admin and require internal trust level.
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  HTTP_STATUS,
  ERROR_CODES,
  TaskStatus,
} from '@mission-control/shared';
import { classifyTrust } from '../services/trust.js';
import {
  getNodes,
  getNodeStats,
  drainNode,
  enableNode,
  forceNodeOffline,
  removeNode,
} from '../services/dispatcher.js';
import { api } from '../services/convex.js';
import { logAuditEvent } from '../services/audit.js';
import {
  requireInternal,
  validateQuery,
  validateBody,
  requireConvex,
  isConvexConfigured,
  getConvexClient,
} from '../middleware/index.js';

/**
 * Zod schemas for request validation
 */
const TaskFilterSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled', 'dead-letter']).optional(),
  nodeId: z.string().optional(),
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
});

const AuditFilterSchema = z.object({
  startTime: z.coerce.number().optional(),
  endTime: z.coerce.number().optional(),
  action: z.string().optional(),
  requestId: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(50),
});

const AuditExportSchema = z.object({
  startTime: z.coerce.number(),
  endTime: z.coerce.number(),
  format: z.enum(['json', 'csv']).default('json'),
  limit: z.coerce.number().min(1).max(10000).default(1000),
});

const PriorityUpdateSchema = z.object({
  priority: z.number().min(-100).max(100),
});

/**
 * Convex task type
 */
interface ConvexTask {
  _id: string;
  _creationTime: number;
  requestId: string;
  status: TaskStatus | 'dead-letter';
  command: string;
  nodeId?: string;
  result?: string;
  priority: number;
  createdAt: number;
  updatedAt: number;
  errorMessage?: string;
  retryCount?: number;
}

/**
 * Convex audit log entry type
 */
interface ConvexAuditLog {
  _id: string;
  _creationTime: number;
  requestId: string;
  timestamp: number;
  action: string;
  details?: string;
  sourceIp?: string;
  userId?: string;
}

/**
 * Convex node type
 */
interface ConvexNode {
  _id: string;
  _creationTime: number;
  hostname: string;
  status: 'online' | 'offline' | 'busy' | 'draining';
  load: number;
  activeTasks: number;
  capabilities: string[];
  lastHeartbeat: number;
  tailscaleIp?: string;
}

/**
 * Admin routes plugin
 */
export const adminRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  // Register preHandler hook for all routes in this plugin
  server.addHook('preHandler', requireInternal('admin'));

  // ============================================
  // System Overview
  // ============================================

  /**
   * GET /admin/overview - System health overview
   */
  server.get('/admin/overview', async (request, reply) => {
    const nodeStats = getNodeStats();
    const nodes = getNodes();

    // Calculate uptime
    const uptimeSeconds = process.uptime();

    // Get recent errors from Convex if configured
    let recentErrors: unknown[] = [];
    let taskQueueDepth = 0;

    if (isConvexConfigured()) {
      try {
        const client = getConvexClient();

        // Get recent errors
        const errorResult = await client.query(api.auditLog.getRecentErrors, {
          limit: 10,
          sinceTimestamp: Date.now() - 3600000, // Last hour
        });
        recentErrors = errorResult.errors;

        // Get pending task count for queue depth
        const pendingTasks = await client.query(api.tasks.listByStatus, {
          status: 'pending',
          limit: 1000,
        }) as ConvexTask[];
        taskQueueDepth = pendingTasks.length;
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch overview data from Convex');
      }
    }

    await logAuditEvent({
      requestId: request.id,
      action: 'admin.overview_accessed',
      sourceIp: classifyTrust(request).sourceIp,
    });

    return reply.send({
      success: true,
      data: {
        system: {
          uptime: uptimeSeconds,
          uptimeFormatted: formatUptime(uptimeSeconds),
          version: process.env['npm_package_version'] || '0.1.0',
          nodeEnv: process.env['NODE_ENV'] || 'development',
        },
        nodes: {
          total: nodeStats.total,
          online: nodeStats.online,
          offline: nodeStats.offline,
          busy: nodeStats.busy,
          draining: nodes.filter((n) => n.status === 'draining').length,
          totalCapacity: nodeStats.totalCapacity,
          usedCapacity: nodeStats.usedCapacity,
          utilizationPercent:
            nodeStats.totalCapacity > 0
              ? Math.round((nodeStats.usedCapacity / nodeStats.totalCapacity) * 100)
              : 0,
        },
        tasks: {
          queueDepth: taskQueueDepth,
        },
        errors: {
          recentCount: recentErrors.length,
          recent: recentErrors.slice(0, 5),
        },
        timestamp: new Date().toISOString(),
      },
    });
  });

  // ============================================
  // Node Management
  // ============================================

  /**
   * GET /admin/nodes - List all nodes with detailed status
   */
  server.get('/admin/nodes', async (request, reply) => {
    const nodes = getNodes();

    // Fetch additional data from Convex if configured
    let convexNodes: ConvexNode[] = [];
    if (isConvexConfigured()) {
      try {
        const client = getConvexClient();
        convexNodes = await client.query(api.nodes.listOnline, {}) as ConvexNode[];
      } catch (error) {
        request.log.warn({ error }, 'Failed to fetch nodes from Convex');
      }
    }

    // Create a map for quick lookup
    const convexNodeMap = new Map(convexNodes.map((n) => [n.hostname, n]));

    const nodeDetails = nodes.map((node) => {
      const convexNode = convexNodeMap.get(node.hostname);
      return {
        id: node.id,
        hostname: node.hostname,
        url: node.url,
        status: node.status,
        load: node.load,
        currentTasks: node.currentTasks,
        maxConcurrentTasks: node.maxConcurrentTasks,
        utilizationPercent: Math.round(
          (node.currentTasks / node.maxConcurrentTasks) * 100
        ),
        capabilities: node.capabilities,
        lastHeartbeat: node.lastHeartbeat.toISOString(),
        lastHeartbeatAgo: formatTimeAgo(node.lastHeartbeat),
        convexId: convexNode?._id,
      };
    });

    await logAuditEvent({
      requestId: request.id,
      action: 'admin.nodes_listed',
      sourceIp: classifyTrust(request).sourceIp,
    });

    return reply.send({
      success: true,
      data: {
        nodes: nodeDetails,
        count: nodeDetails.length,
        timestamp: new Date().toISOString(),
      },
    });
  });

  /**
   * POST /admin/nodes/:nodeId/drain - Start draining a node
   */
  server.post<{ Params: { nodeId: string } }>(
    '/admin/nodes/:nodeId/drain',
    async (request, reply) => {
      const { nodeId } = request.params;

      const result = await drainNode(nodeId);

      if (!result.success) {
        await logAuditEvent({
          requestId: request.id,
          action: 'admin.node_drain_failed',
          details: JSON.stringify({ nodeId, error: result.error }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: {
            code: 'NODE_NOT_FOUND',
            message: result.error || `Node ${nodeId} not found`,
            requestId: request.id,
          },
        });
      }

      await logAuditEvent({
        requestId: request.id,
        action: 'admin.node_drained',
        details: JSON.stringify({ nodeId }),
        sourceIp: classifyTrust(request).sourceIp,
      });

      return reply.send({
        success: true,
        data: {
          nodeId,
          status: 'draining',
          message: 'Node is now draining. No new tasks will be assigned.',
        },
      });
    }
  );

  /**
   * POST /admin/nodes/:nodeId/enable - Re-enable a drained node
   */
  server.post<{ Params: { nodeId: string } }>(
    '/admin/nodes/:nodeId/enable',
    async (request, reply) => {
      const { nodeId } = request.params;

      const result = await enableNode(nodeId);

      if (!result.success) {
        await logAuditEvent({
          requestId: request.id,
          action: 'admin.node_enable_failed',
          details: JSON.stringify({ nodeId, error: result.error }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: {
            code: 'NODE_NOT_FOUND',
            message: result.error || `Node ${nodeId} not found`,
            requestId: request.id,
          },
        });
      }

      await logAuditEvent({
        requestId: request.id,
        action: 'admin.node_enabled',
        details: JSON.stringify({ nodeId }),
        sourceIp: classifyTrust(request).sourceIp,
      });

      return reply.send({
        success: true,
        data: {
          nodeId,
          status: 'online',
          message: 'Node is now enabled and accepting tasks.',
        },
      });
    }
  );

  /**
   * POST /admin/nodes/:nodeId/force-offline - Force a node offline immediately
   */
  server.post<{ Params: { nodeId: string } }>(
    '/admin/nodes/:nodeId/force-offline',
    async (request, reply) => {
      const { nodeId } = request.params;

      const result = await forceNodeOffline(nodeId);

      if (!result.success) {
        await logAuditEvent({
          requestId: request.id,
          action: 'admin.node_force_offline_failed',
          details: JSON.stringify({ nodeId, error: result.error }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: {
            code: 'NODE_NOT_FOUND',
            message: result.error || `Node ${nodeId} not found`,
            requestId: request.id,
          },
        });
      }

      await logAuditEvent({
        requestId: request.id,
        action: 'admin.node_forced_offline',
        details: JSON.stringify({ nodeId }),
        sourceIp: classifyTrust(request).sourceIp,
      });

      return reply.send({
        success: true,
        data: {
          nodeId,
          status: 'offline',
          message: 'Node has been forced offline.',
        },
      });
    }
  );

  /**
   * DELETE /admin/nodes/:nodeId - Remove a node from registry
   */
  server.delete<{ Params: { nodeId: string } }>(
    '/admin/nodes/:nodeId',
    async (request, reply) => {
      const { nodeId } = request.params;

      const result = await removeNode(nodeId);

      if (!result.success) {
        await logAuditEvent({
          requestId: request.id,
          action: 'admin.node_remove_failed',
          details: JSON.stringify({ nodeId, error: result.error }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: {
            code: 'NODE_NOT_FOUND',
            message: result.error || `Node ${nodeId} not found`,
            requestId: request.id,
          },
        });
      }

      await logAuditEvent({
        requestId: request.id,
        action: 'admin.node_removed',
        details: JSON.stringify({ nodeId }),
        sourceIp: classifyTrust(request).sourceIp,
      });

      return reply.send({
        success: true,
        data: {
          nodeId,
          message: 'Node has been removed from the registry.',
        },
      });
    }
  );

  // ============================================
  // Task Management
  // ============================================

  /**
   * GET /admin/tasks - List tasks with filtering
   */
  server.get('/admin/tasks', async (request, reply) => {
    const queryResult = validateQuery(request.query, TaskFilterSchema, reply, request.id);
    if (!queryResult.success) return;

    // Destructure with defaults (schema defaults are applied during parse)
    const { limit = 50, offset = 0, ...restFilters } = queryResult.data;
    const filters = { ...restFilters, limit, offset };

    if (!requireConvex(reply, request.id, 'Task storage')) return;

    try {
      const client = getConvexClient();
      let tasks: ConvexTask[] = [];

      if (filters.status) {
        // Use status-specific query
        const statusTasks = filters.status === 'dead-letter'
          ? await client.query(api.tasks.listDeadLetter, { limit: filters.limit + filters.offset })
          : await client.query(api.tasks.listByStatus, {
              status: filters.status as TaskStatus,
              limit: filters.limit + filters.offset,
            });
        tasks = statusTasks as ConvexTask[];
      } else {
        // Fetch all statuses
        const statuses: Array<TaskStatus | 'dead-letter'> = [
          'pending',
          'running',
          'completed',
          'failed',
          'cancelled',
          'dead-letter',
        ];

        for (const status of statuses) {
          const statusTasks = status === 'dead-letter'
            ? await client.query(api.tasks.listDeadLetter, { limit: filters.limit })
            : await client.query(api.tasks.listByStatus, {
                status: status as TaskStatus,
                limit: filters.limit,
              });
          tasks.push(...(statusTasks as ConvexTask[]));
        }
      }

      // Apply additional filters
      if (filters.nodeId) {
        tasks = tasks.filter((t) => t.nodeId === filters.nodeId);
      }

      if (filters.startTime) {
        tasks = tasks.filter((t) => t.createdAt >= filters.startTime!);
      }

      if (filters.endTime) {
        tasks = tasks.filter((t) => t.createdAt <= filters.endTime!);
      }

      // Sort by creation time (newest first)
      tasks.sort((a, b) => b.createdAt - a.createdAt);

      // Apply offset and limit
      tasks = tasks.slice(filters.offset, filters.offset + filters.limit);

      // Format response
      const formattedTasks = tasks.map((task) => ({
        taskId: task._id,
        requestId: task.requestId,
        command: task.command,
        status: task.status,
        priority: task.priority,
        nodeId: task.nodeId,
        createdAt: new Date(task.createdAt).toISOString(),
        updatedAt: new Date(task.updatedAt).toISOString(),
        errorMessage: task.errorMessage,
        retryCount: task.retryCount,
      }));

      return reply.send({
        success: true,
        data: {
          tasks: formattedTasks,
          count: formattedTasks.length,
          filters,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch tasks');
      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to fetch tasks',
          requestId: request.id,
        },
      });
    }
  });

  /**
   * POST /admin/tasks/:taskId/cancel - Cancel a running task
   */
  server.post<{ Params: { taskId: string } }>(
    '/admin/tasks/:taskId/cancel',
    async (request, reply) => {
      const { taskId } = request.params;

      if (!requireConvex(reply, request.id, 'Task storage')) return;

      try {
        const client = getConvexClient();

        // Get the task first
        const task = await client.query(api.tasks.get, { id: taskId }) as ConvexTask | null;

        if (!task) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: `Task ${taskId} not found`,
              requestId: request.id,
            },
          });
        }

        if (task.status !== 'pending' && task.status !== 'running') {
          return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: {
              code: 'INVALID_TASK_STATE',
              message: `Cannot cancel task in ${task.status} state`,
              requestId: request.id,
            },
          });
        }

        // Update task status to cancelled
        await client.mutation(api.tasks.updateStatus, {
          id: taskId,
          status: 'cancelled',
          result: JSON.stringify({ cancelledBy: 'admin', cancelledAt: Date.now() }),
        });

        await logAuditEvent({
          requestId: request.id,
          action: 'admin.task_cancelled',
          details: JSON.stringify({ taskId, previousStatus: task.status }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.send({
          success: true,
          data: {
            taskId,
            previousStatus: task.status,
            newStatus: 'cancelled',
            message: 'Task has been cancelled.',
          },
        });
      } catch (error) {
        request.log.error({ error, taskId }, 'Failed to cancel task');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to cancel task',
            requestId: request.id,
          },
        });
      }
    }
  );

  /**
   * POST /admin/tasks/:taskId/retry - Retry a failed task
   */
  server.post<{ Params: { taskId: string } }>(
    '/admin/tasks/:taskId/retry',
    async (request, reply) => {
      const { taskId } = request.params;

      if (!requireConvex(reply, request.id, 'Task storage')) return;

      try {
        const client = getConvexClient();

        // Get the task first
        const task = await client.query(api.tasks.get, { id: taskId }) as ConvexTask | null;

        if (!task) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: `Task ${taskId} not found`,
              requestId: request.id,
            },
          });
        }

        if (task.status !== 'failed' && task.status !== 'cancelled') {
          return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: {
              code: 'INVALID_TASK_STATE',
              message: `Cannot retry task in ${task.status} state`,
              requestId: request.id,
            },
          });
        }

        // Update task status to pending for retry
        await client.mutation(api.tasks.updateStatus, {
          id: taskId,
          status: 'pending',
        });

        await logAuditEvent({
          requestId: request.id,
          action: 'admin.task_retried',
          details: JSON.stringify({ taskId, previousStatus: task.status }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.send({
          success: true,
          data: {
            taskId,
            previousStatus: task.status,
            newStatus: 'pending',
            message: 'Task has been queued for retry.',
          },
        });
      } catch (error) {
        request.log.error({ error, taskId }, 'Failed to retry task');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to retry task',
            requestId: request.id,
          },
        });
      }
    }
  );

  /**
   * POST /admin/tasks/:taskId/priority - Boost/lower task priority
   */
  server.post<{ Params: { taskId: string }; Body: { priority: number } }>(
    '/admin/tasks/:taskId/priority',
    async (request, reply) => {
      const { taskId } = request.params;

      const bodyResult = validateBody(request.body, PriorityUpdateSchema, reply, request.id);
      if (!bodyResult.success) return;

      const { priority } = bodyResult.data;

      if (!requireConvex(reply, request.id, 'Task storage')) return;

      try {
        const client = getConvexClient();

        // Get the task first
        const task = await client.query(api.tasks.get, { id: taskId }) as ConvexTask | null;

        if (!task) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: `Task ${taskId} not found`,
              requestId: request.id,
            },
          });
        }

        if (task.status !== 'pending') {
          return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: {
              code: 'INVALID_TASK_STATE',
              message: `Cannot change priority of task in ${task.status} state`,
              requestId: request.id,
            },
          });
        }

        // Update task priority via updatePriority mutation
        await client.mutation(api.tasks.updatePriority, {
          id: taskId,
          priority,
        });

        await logAuditEvent({
          requestId: request.id,
          action: 'admin.task_priority_updated',
          details: JSON.stringify({
            taskId,
            previousPriority: task.priority,
            newPriority: priority,
          }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.send({
          success: true,
          data: {
            taskId,
            previousPriority: task.priority,
            newPriority: priority,
            message: 'Task priority has been updated.',
          },
        });
      } catch (error) {
        request.log.error({ error, taskId }, 'Failed to update task priority');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to update task priority',
            requestId: request.id,
          },
        });
      }
    }
  );

  /**
   * GET /admin/tasks/dead-letter - List dead letter queue
   */
  server.get('/admin/tasks/dead-letter', async (request, reply) => {
    if (!requireConvex(reply, request.id, 'Task storage')) return;

    try {
      const client = getConvexClient();

      const tasks = await client.query(api.tasks.listDeadLetter, {
        limit: 100,
      }) as ConvexTask[];

      const formattedTasks = tasks.map((task) => ({
        taskId: task._id,
        requestId: task.requestId,
        command: task.command,
        status: task.status,
        priority: task.priority,
        nodeId: task.nodeId,
        createdAt: new Date(task.createdAt).toISOString(),
        updatedAt: new Date(task.updatedAt).toISOString(),
        errorMessage: task.errorMessage,
        retryCount: task.retryCount,
      }));

      return reply.send({
        success: true,
        data: {
          tasks: formattedTasks,
          count: formattedTasks.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch dead letter queue');
      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to fetch dead letter queue',
          requestId: request.id,
        },
      });
    }
  });

  /**
   * POST /admin/tasks/:taskId/requeue - Move from DLQ back to pending
   */
  server.post<{ Params: { taskId: string } }>(
    '/admin/tasks/:taskId/requeue',
    async (request, reply) => {
      const { taskId } = request.params;

      if (!requireConvex(reply, request.id, 'Task storage')) return;

      try {
        const client = getConvexClient();

        // Use the retryFromDeadLetter mutation
        await client.mutation(api.tasks.retryFromDeadLetter, { id: taskId });

        await logAuditEvent({
          requestId: request.id,
          action: 'admin.task_requeued',
          details: JSON.stringify({ taskId }),
          sourceIp: classifyTrust(request).sourceIp,
        });

        return reply.send({
          success: true,
          data: {
            taskId,
            newStatus: 'pending',
            message: 'Task has been moved from dead letter queue to pending.',
          },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (errorMessage.includes('not found')) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: `Task ${taskId} not found`,
              requestId: request.id,
            },
          });
        }

        if (errorMessage.includes('not in dead-letter')) {
          return reply.status(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: {
              code: 'INVALID_TASK_STATE',
              message: `Task ${taskId} is not in dead-letter status`,
              requestId: request.id,
            },
          });
        }

        request.log.error({ error, taskId }, 'Failed to requeue task');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to requeue task',
            requestId: request.id,
          },
        });
      }
    }
  );

  // ============================================
  // Audit Log
  // ============================================

  /**
   * GET /admin/audit - Search audit logs with filters
   */
  server.get('/admin/audit', async (request, reply) => {
    const queryResult = validateQuery(request.query, AuditFilterSchema, reply, request.id);
    if (!queryResult.success) return;

    const filters = queryResult.data;

    if (!requireConvex(reply, request.id, 'Audit log storage')) return;

    try {
      const client = getConvexClient();

      // If requestId is specified, use the requestId-specific query
      if (filters.requestId) {
        const result = await client.query(api.auditLog.queryByRequestId, {
          requestId: filters.requestId,
          limit: filters.limit,
        });

        return reply.send({
          success: true,
          data: {
            logs: result.logs,
            count: result.count,
            filters,
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Use search query with time range and action filters
      const startTime = filters.startTime || Date.now() - 86400000; // Default: last 24 hours
      const endTime = filters.endTime || Date.now();

      const result = await client.query(api.auditLog.search, {
        startTime,
        endTime,
        action: filters.action,
        limit: filters.limit,
      });

      return reply.send({
        success: true,
        data: {
          logs: result.logs,
          count: result.count,
          filters: { ...filters, startTime, endTime },
          actionCounts: result.actionCounts,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to search audit logs');
      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to search audit logs',
          requestId: request.id,
        },
      });
    }
  });

  /**
   * GET /admin/audit/export - Export audit logs as JSON/CSV
   */
  server.get('/admin/audit/export', async (request, reply) => {
    const queryResult = validateQuery(request.query, AuditExportSchema, reply, request.id);
    if (!queryResult.success) return;

    const { startTime, endTime, format, limit } = queryResult.data;

    if (!requireConvex(reply, request.id, 'Audit log storage')) return;

    try {
      const client = getConvexClient();

      const result = await client.query(api.auditLog.export_, {
        startTime,
        endTime,
        limit,
      });

      await logAuditEvent({
        requestId: request.id,
        action: 'admin.audit_exported',
        details: JSON.stringify({
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          format,
          count: result.logs.length,
        }),
        sourceIp: classifyTrust(request).sourceIp,
      });

      if (format === 'csv') {
        // Convert to CSV format
        const logs = result.logs as ConvexAuditLog[];
        const headers = ['requestId', 'timestamp', 'action', 'details', 'sourceIp', 'userId'];
        const csvRows = [headers.join(',')];

        for (const log of logs) {
          const row = [
            escapeCSV(log.requestId),
            new Date(log.timestamp).toISOString(),
            escapeCSV(log.action),
            escapeCSV(log.details || ''),
            escapeCSV(log.sourceIp || ''),
            escapeCSV(log.userId || ''),
          ];
          csvRows.push(row.join(','));
        }

        const csvContent = csvRows.join('\n');

        return reply
          .header('Content-Type', 'text/csv')
          .header(
            'Content-Disposition',
            `attachment; filename="audit-log-${startTime}-${endTime}.csv"`
          )
          .send(csvContent);
      }

      // JSON format
      return reply
        .header('Content-Type', 'application/json')
        .header(
          'Content-Disposition',
          `attachment; filename="audit-log-${startTime}-${endTime}.json"`
        )
        .send({
          exportedAt: new Date().toISOString(),
          timeRange: {
            start: new Date(startTime).toISOString(),
            end: new Date(endTime).toISOString(),
          },
          count: result.logs.length,
          logs: result.logs,
        });
    } catch (error) {
      request.log.error({ error }, 'Failed to export audit logs');
      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to export audit logs',
          requestId: request.id,
        },
      });
    }
  });

  /**
   * GET /admin/audit/:requestId - Get all events for a request
   */
  server.get<{ Params: { requestId: string } }>(
    '/admin/audit/:requestId',
    async (request, reply) => {
      const { requestId } = request.params;

      if (!requireConvex(reply, request.id, 'Audit log storage')) return;

      try {
        const client = getConvexClient();

        const result = await client.query(api.auditLog.getByRequestId, {
          requestId,
        });

        if (result.logs.length === 0) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            error: {
              code: 'AUDIT_LOG_NOT_FOUND',
              message: `No audit logs found for request ${requestId}`,
              requestId: request.id,
            },
          });
        }

        return reply.send({
          success: true,
          data: {
            requestId,
            logs: result.logs,
            count: result.count,
            timeline: result.timeline,
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        request.log.error({ error, requestId }, 'Failed to fetch audit logs for request');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to fetch audit logs',
            requestId: request.id,
          },
        });
      }
    }
  );
};

/**
 * Helper function to format uptime
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Helper function to format time ago
 */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ${minutes % 60}m ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

/**
 * Helper function to escape CSV values
 */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
