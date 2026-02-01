import * as os from 'node:os';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { TaskDispatchSchema, type TaskDispatch, type TaskResult } from '@mission-control/shared';
import { executeTask } from './executor.js';
import {
  registerWithHub,
  startHeartbeat,
  stopHeartbeat,
  getNodeId,
  updateActiveTasks,
  getActiveTasks,
  getNodeCapabilities,
  getCurrentLoad,
  type RegistrationConfig,
} from './registration.js';
import { getSandboxConfig, COMMAND_ALLOWLIST } from './sandbox.js';

/**
 * Server configuration
 */
export interface ServerConfig {
  /** Port to listen on */
  port: number;
  /** Hostname for this node */
  hostname: string;
  /** Hub URL for registration */
  hubUrl: string;
  /** Node version */
  version?: string;
  /** Maximum concurrent tasks */
  maxTasks?: number;
}

/**
 * Health check response
 */
interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  nodeId: string | null;
  hostname: string;
  activeTasks: number;
  load: number;
  capabilities: ReturnType<typeof getNodeCapabilities>;
  sandbox: {
    enabled: boolean;
    workDir: string;
    allowedCommands: readonly string[];
  };
  uptime: number;
}

/**
 * Create and configure the Fastify server
 * @param config - Server configuration
 * @returns Configured Fastify instance
 */
export async function createServer(config: ServerConfig): Promise<FastifyInstance> {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // Register CORS
  await server.register(cors, {
    origin: true,
  });

  // Track server start time for uptime
  const startTime = Date.now();

  // Health check endpoint
  server.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    const sandboxConfig = getSandboxConfig();

    const response: HealthResponse = {
      status: 'healthy',
      nodeId: getNodeId(),
      hostname: config.hostname,
      activeTasks: getActiveTasks(),
      load: getCurrentLoad(),
      capabilities: getNodeCapabilities(),
      sandbox: {
        enabled: sandboxConfig.enabled,
        workDir: sandboxConfig.workDir,
        allowedCommands: COMMAND_ALLOWLIST,
      },
      uptime: Date.now() - startTime,
    };

    return reply.status(200).send(response);
  });

  // Task execution endpoint
  server.post(
    '/api/tasks/execute',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Parse and validate the task dispatch
      const parseResult = TaskDispatchSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Invalid task dispatch payload',
            details: parseResult.error.format(),
          },
        });
      }

      const task: TaskDispatch = parseResult.data;
      const nodeId = getNodeId();

      if (!nodeId) {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'NODE_NOT_REGISTERED',
            message: 'Node is not registered with hub',
          },
        });
      }

      // Check if we can accept more tasks
      const maxTasks = config.maxTasks ?? os.cpus().length;
      if (getActiveTasks() >= maxTasks) {
        return reply.status(503).send({
          success: false,
          error: {
            code: 'NODE_BUSY',
            message: `Node is at capacity (${getActiveTasks()}/${maxTasks} tasks)`,
          },
        });
      }

      // Update active task count
      updateActiveTasks(1);

      try {
        // Execute the task
        server.log.info({ taskId: task.taskId }, 'Executing task');

        const result: TaskResult = await executeTask(task, { nodeId });

        server.log.info(
          { taskId: task.taskId, status: result.status, exitCode: result.exitCode },
          'Task completed'
        );

        return reply.status(200).send({
          success: true,
          data: result,
        });
      } finally {
        // Always decrement active tasks
        updateActiveTasks(-1);
      }
    }
  );

  // Status endpoint (similar to health but minimal)
  server.get('/api/status', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      nodeId: getNodeId(),
      status: getNodeId() ? 'registered' : 'unregistered',
      activeTasks: getActiveTasks(),
    });
  });

  return server;
}

/**
 * Start the server and register with hub
 * @param config - Server configuration
 * @returns Running server instance
 */
export async function startServer(config: ServerConfig): Promise<FastifyInstance> {
  const server = await createServer(config);

  // Start listening
  await server.listen({ port: config.port, host: '0.0.0.0' });
  server.log.info(`Compute node listening on port ${config.port}`);

  // Registration configuration
  const registrationConfig: RegistrationConfig = {
    hubUrl: config.hubUrl,
    hostname: config.hostname,
    version: config.version,
    maxTasks: config.maxTasks,
  };

  // Register with hub
  const nodeId = await registerWithHub(registrationConfig);

  if (nodeId) {
    // Start periodic heartbeat
    startHeartbeat(registrationConfig);
  } else {
    server.log.warn('Failed to register with hub, will retry on next heartbeat');
    // Start heartbeat anyway to keep trying
    startHeartbeat(registrationConfig);
  }

  // Graceful shutdown
  const shutdown = async () => {
    server.log.info('Shutting down...');
    stopHeartbeat();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}
