/**
 * Fastify HTTP server setup for the Hub
 */

import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { HTTP_STATUS } from '@mission-control/shared';

import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { taskRoutes } from './routes/tasks.js';
import { nodeRoutes } from './routes/nodes.js';
import { metricsRoutes } from './routes/metrics.js';

export type HubServer = FastifyInstance;

/**
 * Create and configure the Fastify server instance
 */
export async function createServer(): Promise<HubServer> {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] || 'info',
      transport:
        process.env['NODE_ENV'] === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
              },
            }
          : undefined,
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Register CORS
  await server.register(cors, {
    origin: process.env['CORS_ORIGIN'] || true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // Global error handler
  server.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_ERROR;

    request.log.error(
      {
        err: error,
        requestId: request.id,
      },
      'Request error'
    );

    return reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message:
          statusCode >= 500 && process.env['NODE_ENV'] === 'production'
            ? 'Internal server error'
            : error.message,
        requestId: request.id,
      },
    });
  });

  // Not found handler
  server.setNotFoundHandler((request, reply) => {
    return reply.status(HTTP_STATUS.NOT_FOUND).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
  });

  // Register routes
  await server.register(healthRoutes);
  await server.register(chatRoutes);
  await server.register(taskRoutes);
  await server.register(nodeRoutes);
  await server.register(metricsRoutes);

  return server;
}

/**
 * Start the server and listen on the specified port
 */
export async function startServer(port: number): Promise<HubServer> {
  const server = await createServer();

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    server.log.info(`Received ${signal}, shutting down gracefully...`);

    try {
      await server.close();
      server.log.info('Server closed successfully');
      process.exit(0);
    } catch (err) {
      server.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await server.listen({ port, host: '0.0.0.0' });
  server.log.info(`Hub server listening on port ${port}`);

  return server;
}
