/**
 * Task routes - Task management and dispatch
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  TaskQuerySchema,
  TaskDispatchSchema,
  TaskStatus,
  HTTP_STATUS,
  ERROR_CODES,
  TRUST_LEVELS,
  meetsTrustLevel,
} from '@mission-control/shared';
import { sanitize } from '../services/sanitizer.js';
import { classifyTrust } from '../services/trust.js';
import { dispatchTask } from '../services/dispatcher.js';
import { api } from '../services/convex.js';
import { logAuditEvent } from '../services/audit.js';
import {
  validateQuery,
  validateBody,
  requireConvex,
  isConvexConfigured,
  getConvexClient,
} from '../middleware/index.js';

/**
 * Task as stored in Convex
 */
interface ConvexTask {
  _id: string;
  _creationTime: number;
  requestId: string;
  status: TaskStatus;
  command: string;
  nodeId?: string;
  result?: string;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Task response format for API consumers
 */
interface TaskResponse {
  taskId: string;
  requestId: string;
  command: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  nodeId?: string;
  result?: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    errorMessage?: string;
  };
}

/**
 * Convert Convex task to API response format
 */
function toTaskResponse(convexTask: ConvexTask): TaskResponse {
  const response: TaskResponse = {
    taskId: convexTask._id,
    requestId: convexTask.requestId,
    command: convexTask.command,
    status: convexTask.status,
    createdAt: new Date(convexTask.createdAt).toISOString(),
    updatedAt: new Date(convexTask.updatedAt).toISOString(),
  };

  if (convexTask.nodeId) {
    response.nodeId = convexTask.nodeId;
  }

  if (convexTask.result) {
    try {
      response.result = JSON.parse(convexTask.result);
    } catch {
      response.result = { errorMessage: convexTask.result };
    }
  }

  return response;
}

/**
 * Task routes plugin
 */
export const taskRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  /**
   * GET /tasks - List tasks with optional filters
   */
  server.get('/tasks', async (request, reply) => {
    const queryResult = validateQuery(request.query, TaskQuerySchema, reply, request.id);
    if (!queryResult.success) return;

    const query = queryResult.data;

    // Use Convex if configured
    if (isConvexConfigured()) {
      const client = getConvexClient();

      try {
        // If status filter is provided, use the indexed query
        if (query.status) {
          const convexTasks = (await client.query(api.tasks.listByStatus, {
            status: query.status,
            limit: query.limit,
          })) as ConvexTask[];

          // Apply nodeId filter if provided (post-query filtering)
          let tasks = convexTasks.map(toTaskResponse);
          if (query.nodeId) {
            tasks = tasks.filter((t) => t.nodeId === query.nodeId);
          }

          return reply.send({
            success: true,
            data: {
              tasks,
              count: tasks.length,
            },
          });
        }

        // Without status filter, fetch all statuses and combine
        const statuses: TaskStatus[] = [
          'pending',
          'running',
          'completed',
          'failed',
          'cancelled',
        ];

        const allTasks: ConvexTask[] = [];
        for (const status of statuses) {
          const statusTasks = (await client.query(api.tasks.listByStatus, {
            status,
            limit: query.limit,
          })) as ConvexTask[];
          allTasks.push(...statusTasks);
        }

        // Sort by creation time (newest first) and apply limit
        allTasks.sort((a, b) => b.createdAt - a.createdAt);
        let tasks = allTasks.slice(0, query.limit).map(toTaskResponse);

        // Apply nodeId filter if provided
        if (query.nodeId) {
          tasks = tasks.filter((t) => t.nodeId === query.nodeId);
        }

        return reply.send({
          success: true,
          data: {
            tasks,
            count: tasks.length,
          },
        });
      } catch (error) {
        request.log.error({ error }, 'Failed to query tasks from Convex');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to fetch tasks',
            requestId: request.id,
          },
        });
      }
    }

    // Fallback: Convex not configured
    return reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Task storage not configured',
        requestId: request.id,
      },
    });
  });

  /**
   * POST /tasks - Dispatch a new task
   */
  server.post('/tasks', async (request, reply) => {
    const requestId = request.id;

    // Validate request
    const bodyResult = validateBody(request.body, TaskDispatchSchema, reply, requestId);
    if (!bodyResult.success) return;

    // Destructure with defaults (schema defaults are applied during parse, but TypeScript needs explicit types)
    const { timeoutMs = 30000, priority = 50, ...restTask } = bodyResult.data;
    const taskDispatch = { ...restTask, timeoutMs, priority };

    // Sanitize command
    const sanitizeResult = sanitize(taskDispatch.command);

    if (!sanitizeResult.safe) {
      await logAuditEvent({
        requestId,
        action: 'task.sanitization_failed',
        details: JSON.stringify({
          taskId: taskDispatch.taskId,
          issues: sanitizeResult.issues,
        }),
        sourceIp: request.ip,
      });

      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.SANITIZATION_FAILED,
          message: 'Task command contains potentially unsafe content',
          details: sanitizeResult.issues,
          requestId,
        },
      });
    }

    // Check trust level (task dispatch requires power-user or internal trust)
    const trustContext = classifyTrust(request);

    if (!meetsTrustLevel(trustContext.level, TRUST_LEVELS.POWER_USER)) {
      await logAuditEvent({
        requestId,
        action: 'task.insufficient_trust',
        details: JSON.stringify({
          taskId: taskDispatch.taskId,
          trustLevel: trustContext.level,
          requiredLevel: TRUST_LEVELS.POWER_USER,
        }),
        sourceIp: request.ip,
      });

      return reply.status(HTTP_STATUS.FORBIDDEN).send({
        success: false,
        error: {
          code: ERROR_CODES.INSUFFICIENT_TRUST,
          message: 'Task dispatch requires power-user or internal trust level',
          requestId,
        },
      });
    }

    // Use Convex if configured
    if (!requireConvex(reply, requestId, 'Task storage')) return;

    const client = getConvexClient();

    try {
      // Create task record in Convex
      const convexTaskId = await client.mutation(api.tasks.create, {
        requestId: taskDispatch.requestId,
        command: taskDispatch.command,
        priority: taskDispatch.priority,
      });

      // Log task creation
      await logAuditEvent({
        requestId,
        action: 'task.created',
        details: JSON.stringify({
          taskId: convexTaskId,
          command: taskDispatch.command,
        }),
        sourceIp: request.ip,
      });

      // Dispatch to compute node
      const dispatchResult = await dispatchTask(taskDispatch);

      // Update task with dispatch result
      const newStatus: TaskStatus = dispatchResult.dispatched
        ? 'running'
        : 'failed';

      await client.mutation(api.tasks.updateStatus, {
        id: convexTaskId,
        status: newStatus,
        result: dispatchResult.dispatched
          ? undefined
          : JSON.stringify({ errorMessage: dispatchResult.error }),
      });

      // If dispatched successfully and we have a nodeId, assign task to node
      if (dispatchResult.dispatched && dispatchResult.nodeId) {
        try {
          await client.mutation(api.tasks.assignToNode, {
            id: convexTaskId,
            nodeId: dispatchResult.nodeId,
          });
        } catch (error) {
          // Node assignment failed, but task is still dispatched
          request.log.warn(
            { error, nodeId: dispatchResult.nodeId },
            'Failed to assign task to node in Convex'
          );
        }
      }

      // Log dispatch result
      await logAuditEvent({
        requestId,
        action: dispatchResult.dispatched
          ? 'task.dispatched'
          : 'task.dispatch_failed',
        details: JSON.stringify({
          taskId: convexTaskId,
          nodeId: dispatchResult.nodeId,
          error: dispatchResult.error,
        }),
        sourceIp: request.ip,
      });

      // Fetch the updated task for response
      const updatedTask = (await client.query(api.tasks.get, {
        id: convexTaskId,
      })) as ConvexTask | null;

      if (!updatedTask) {
        throw new Error('Task not found after creation');
      }

      return reply.status(HTTP_STATUS.CREATED).send({
        success: true,
        data: {
          task: toTaskResponse(updatedTask),
          dispatched: dispatchResult.dispatched,
        },
      });
    } catch (error) {
      request.log.error({ error }, 'Failed to create/dispatch task');

      await logAuditEvent({
        requestId,
        action: 'task.error',
        details: JSON.stringify({
          taskId: taskDispatch.taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }),
        sourceIp: request.ip,
      });

      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to create task',
          requestId,
        },
      });
    }
  });

  /**
   * GET /tasks/:id - Get a task by ID
   */
  server.get<{ Params: { id: string } }>(
    '/tasks/:id',
    async (request, reply) => {
      const { id } = request.params;

      if (!requireConvex(reply, request.id, 'Task storage')) return;

      const client = getConvexClient();

      try {
        const task = (await client.query(api.tasks.get, {
          id,
        })) as ConvexTask | null;

        if (!task) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            error: {
              code: 'TASK_NOT_FOUND',
              message: `Task with ID ${id} not found`,
              requestId: request.id,
            },
          });
        }

        return reply.send({
          success: true,
          data: { task: toTaskResponse(task) },
        });
      } catch (error) {
        request.log.error({ error, taskId: id }, 'Failed to fetch task');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to fetch task',
            requestId: request.id,
          },
        });
      }
    }
  );
};
