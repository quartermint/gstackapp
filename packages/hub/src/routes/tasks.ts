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
} from '@mission-control/shared';
import { sanitize } from '../services/sanitizer.js';
import { classifyTrust } from '../services/trust.js';
import { dispatchTask } from '../services/dispatcher.js';

/**
 * In-memory task store (stub - replace with Convex)
 */
interface StoredTask {
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

const taskStore = new Map<string, StoredTask>();

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
    const parseResult = TaskQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid query parameters',
          details: parseResult.error.errors,
          requestId: request.id,
        },
      });
    }

    const query = parseResult.data;
    let tasks = Array.from(taskStore.values());

    // Apply filters
    if (query.status) {
      tasks = tasks.filter((t) => t.status === query.status);
    }

    if (query.nodeId) {
      tasks = tasks.filter((t) => t.nodeId === query.nodeId);
    }

    // Sort by creation time (newest first)
    tasks.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply limit
    tasks = tasks.slice(0, query.limit);

    return reply.send({
      success: true,
      data: {
        tasks,
        count: tasks.length,
      },
    });
  });

  /**
   * POST /tasks - Dispatch a new task
   */
  server.post('/tasks', async (request, reply) => {
    const requestId = request.id;

    // Validate request
    const parseResult = TaskDispatchSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid task dispatch request',
          details: parseResult.error.errors,
          requestId,
        },
      });
    }

    const taskDispatch = parseResult.data;

    // Sanitize command
    const sanitizeResult = sanitize(taskDispatch.command);

    if (!sanitizeResult.safe) {
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

    // Check trust level (task dispatch requires internal trust)
    const trustContext = classifyTrust(request);

    if (trustContext.level !== 'internal') {
      return reply.status(HTTP_STATUS.FORBIDDEN).send({
        success: false,
        error: {
          code: ERROR_CODES.INSUFFICIENT_TRUST,
          message: 'Task dispatch requires internal trust level',
          requestId,
        },
      });
    }

    // Create task record
    const now = new Date().toISOString();
    const task: StoredTask = {
      taskId: taskDispatch.taskId,
      requestId: taskDispatch.requestId,
      command: taskDispatch.command,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    taskStore.set(task.taskId, task);

    // Dispatch to compute node (stub)
    const dispatchResult = await dispatchTask(taskDispatch);

    // Update task with dispatch result
    task.status = dispatchResult.dispatched ? 'running' : 'failed';
    task.nodeId = dispatchResult.nodeId;
    task.updatedAt = new Date().toISOString();

    if (!dispatchResult.dispatched) {
      task.result = {
        errorMessage: dispatchResult.error,
      };
    }

    return reply.status(HTTP_STATUS.CREATED).send({
      success: true,
      data: {
        task,
        dispatched: dispatchResult.dispatched,
      },
    });
  });

  /**
   * GET /tasks/:id - Get a task by ID
   */
  server.get<{ Params: { id: string } }>('/tasks/:id', async (request, reply) => {
    const { id } = request.params;

    const task = taskStore.get(id);

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
      data: { task },
    });
  });
};
