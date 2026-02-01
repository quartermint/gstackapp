/**
 * Node routes - Compute node management and communication
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  NodeHeartbeatSchema,
  TaskResultSchema,
  HTTP_STATUS,
  ERROR_CODES,
  LIMITS,
  generateNodeId,
  type NodeHeartbeat,
  type TaskResult,
  type TaskStatus,
} from '@mission-control/shared';
import {
  registerNode,
  handleHeartbeat,
  handleTaskComplete,
  getNodes,
  getNode,
  getNodeStats,
  getHealthyNodes,
} from '../services/dispatcher.js';
import { getConvexClient, isConvexConfigured, api } from '../services/convex.js';
import { logAuditEvent } from '../services/audit.js';

/**
 * Node routes plugin
 */
export const nodeRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  /**
   * POST /api/nodes/heartbeat - Handle node heartbeat/registration
   *
   * Compute nodes send periodic heartbeats to:
   * 1. Register themselves on first contact
   * 2. Update their status and load information
   * 3. Confirm they are still alive
   */
  server.post('/api/nodes/heartbeat', async (request, reply) => {
    const parseResult = NodeHeartbeatSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid heartbeat payload',
          details: parseResult.error.errors,
          requestId: request.id,
        },
      });
    }

    const heartbeat: NodeHeartbeat = parseResult.data;

    // Check if this node is already registered by hostname
    const existingNodes = getNodes();
    const existingNode = existingNodes.find(
      (n) => n.hostname === heartbeat.hostname
    );

    let nodeId: string;

    if (existingNode) {
      // Update existing node
      nodeId = existingNode.id;
      await handleHeartbeat(nodeId, heartbeat);
      server.log.debug(
        { nodeId, hostname: heartbeat.hostname },
        'Node heartbeat received'
      );
    } else {
      // Register new node
      nodeId = generateNodeId(heartbeat.hostname);

      // Determine URL from request or Tailscale IP
      const sourceIp =
        heartbeat.tailscaleIp ||
        (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        request.ip;

      // Default compute node port
      const nodeUrl = `http://${sourceIp}:3001`;

      // Determine max concurrent tasks from capabilities
      const maxTasks = heartbeat.capabilities?.cpuCores ?? 4;

      await registerNode(
        nodeId,
        heartbeat.hostname,
        nodeUrl,
        heartbeat.capabilities,
        maxTasks
      );

      server.log.info(
        { nodeId, hostname: heartbeat.hostname, url: nodeUrl },
        'New node registered'
      );

      // Log node registration
      await logAuditEvent({
        requestId: request.id,
        action: 'node.registered',
        details: JSON.stringify({
          nodeId,
          hostname: heartbeat.hostname,
          url: nodeUrl,
          capabilities: heartbeat.capabilities,
        }),
        sourceIp: request.ip,
      });

      // Also register in Convex if configured
      if (isConvexConfigured()) {
        try {
          const client = getConvexClient();
          await client.mutation(api.nodes.upsert, {
            hostname: heartbeat.hostname,
            status: heartbeat.status as 'online' | 'offline' | 'busy',
            load: heartbeat.load,
            activeTasks: heartbeat.activeTasks,
            capabilities: heartbeat.capabilities
              ? [
                  `platform:${heartbeat.capabilities.platform}`,
                  `arch:${heartbeat.capabilities.arch}`,
                  `cpuCores:${heartbeat.capabilities.cpuCores}`,
                  `memoryMb:${heartbeat.capabilities.memoryMb}`,
                  heartbeat.capabilities.sandboxEnabled ? 'sandbox:enabled' : 'sandbox:disabled',
                ]
              : [],
            tailscaleIp: heartbeat.tailscaleIp,
          });
        } catch (error) {
          server.log.warn(
            { error, hostname: heartbeat.hostname },
            'Failed to upsert node in Convex'
          );
        }
      }
    }

    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      data: {
        nodeId,
        heartbeatIntervalMs: LIMITS.NODE_HEARTBEAT_INTERVAL_MS,
        acknowledged: true,
      },
    });
  });

  /**
   * POST /api/nodes/tasks/callback - Receive task completion callback
   *
   * Compute nodes call this endpoint when a task completes to report the result.
   * This is used when tasks run asynchronously.
   */
  server.post('/api/nodes/tasks/callback', async (request, reply) => {
    const parseResult = TaskResultSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid task result payload',
          details: parseResult.error.errors,
          requestId: request.id,
        },
      });
    }

    const taskResult: TaskResult = parseResult.data;

    // Verify the node exists in in-memory registry
    const node = getNode(taskResult.nodeId);
    if (!node) {
      server.log.warn(
        { nodeId: taskResult.nodeId, taskId: taskResult.taskId },
        'Task callback received from unknown node'
      );
      // Don't reject - node might have re-registered with new ID
    }

    // Update task in Convex if configured
    if (isConvexConfigured()) {
      try {
        const client = getConvexClient();

        // Update task status and result
        await client.mutation(api.tasks.updateStatus, {
          id: taskResult.taskId,
          status: taskResult.status as TaskStatus,
          result: JSON.stringify({
            exitCode: taskResult.exitCode,
            stdout: taskResult.stdout,
            stderr: taskResult.stderr,
            errorMessage: taskResult.errorMessage,
            executionTimeMs: taskResult.executionTimeMs,
          }),
        });

        server.log.info(
          {
            taskId: taskResult.taskId,
            nodeId: taskResult.nodeId,
            status: taskResult.status,
          },
          'Task result callback received and persisted'
        );
      } catch (error) {
        server.log.error(
          { error, taskId: taskResult.taskId },
          'Failed to update task in Convex'
        );
        // Continue anyway - the callback was received
      }
    } else {
      server.log.info(
        {
          taskId: taskResult.taskId,
          nodeId: taskResult.nodeId,
          status: taskResult.status,
        },
        'Task result callback received (Convex not configured)'
      );
    }

    // Log audit event
    await logAuditEvent({
      requestId: request.id,
      action: 'task.callback_received',
      details: JSON.stringify({
        taskId: taskResult.taskId,
        nodeId: taskResult.nodeId,
        status: taskResult.status,
        exitCode: taskResult.exitCode,
      }),
      sourceIp: request.ip,
    });

    // Update node's task count in dispatcher
    if (node) {
      await handleTaskComplete(taskResult.nodeId, taskResult.taskId);
    }

    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      data: {
        acknowledged: true,
        taskId: taskResult.taskId,
      },
    });
  });

  /**
   * GET /api/nodes - List all registered nodes
   */
  server.get('/api/nodes', async (_request, reply) => {
    const nodes = getNodes();
    const stats = getNodeStats();

    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      data: {
        nodes: nodes.map((node) => ({
          id: node.id,
          hostname: node.hostname,
          url: node.url,
          status: node.status,
          lastHeartbeat: node.lastHeartbeat.toISOString(),
          currentTasks: node.currentTasks,
          maxConcurrentTasks: node.maxConcurrentTasks,
          load: node.load,
          capabilities: node.capabilities,
        })),
        stats,
      },
    });
  });

  /**
   * GET /api/nodes/healthy - List only healthy nodes
   */
  server.get('/api/nodes/healthy', async (_request, reply) => {
    const healthyNodes = getHealthyNodes();

    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      data: {
        nodes: healthyNodes.map((node) => ({
          id: node.id,
          hostname: node.hostname,
          url: node.url,
          status: node.status,
          currentTasks: node.currentTasks,
          maxConcurrentTasks: node.maxConcurrentTasks,
          load: node.load,
        })),
        count: healthyNodes.length,
      },
    });
  });

  /**
   * GET /api/nodes/:id - Get a specific node by ID
   */
  server.get<{ Params: { id: string } }>(
    '/api/nodes/:id',
    async (request, reply) => {
      const { id } = request.params;
      const node = getNode(id);

      if (!node) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: {
            code: 'NODE_NOT_FOUND',
            message: `Node with ID ${id} not found`,
            requestId: request.id,
          },
        });
      }

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: {
          node: {
            id: node.id,
            hostname: node.hostname,
            url: node.url,
            status: node.status,
            lastHeartbeat: node.lastHeartbeat.toISOString(),
            currentTasks: node.currentTasks,
            maxConcurrentTasks: node.maxConcurrentTasks,
            load: node.load,
            capabilities: node.capabilities,
          },
        },
      });
    }
  );

  /**
   * GET /api/nodes/stats - Get cluster statistics
   */
  server.get('/api/nodes/stats', async (_request, reply) => {
    const stats = getNodeStats();

    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      data: { stats },
    });
  });
};
