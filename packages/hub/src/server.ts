/**
 * Fastify HTTP server setup for the Hub
 *
 * Integrates pino structured logging with correlation ID support.
 * The logger configuration mirrors services/logger.ts for consistency
 * across Fastify request handling and standalone services.
 */

import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { HTTP_STATUS } from '@mission-control/shared';

import { healthRoutes } from './routes/health.js';
import { chatRoutes } from './routes/chat.js';
import { taskRoutes } from './routes/tasks.js';
import { nodeRoutes } from './routes/nodes.js';
import { metricsRoutes, recordRequest } from './routes/metrics.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { conversationRoutes } from './routes/conversations.js';
import { userRoutes } from './routes/user.js';
import { classifyTrust } from './services/trust.js';
import { createLogger } from './services/logger.js';

export type HubServer = FastifyInstance;

/**
 * Create and configure the Fastify server instance
 *
 * Uses Pino for structured JSON logging with the following features:
 * - Service name and environment in all log entries
 * - Request correlation ID (via x-request-id header or auto-generated)
 * - Pretty printing in development mode
 *
 * Note: For non-request context logging (background tasks, services),
 * use getLogger() from services/logger.js with withCorrelationIdAsync
 * for correlation ID propagation via AsyncLocalStorage.
 */
export async function createServer(): Promise<HubServer> {
  // Initialize the standalone logger for use outside request context
  // This ensures the logger is configured before any services use it
  createLogger({
    level: process.env['LOG_LEVEL'] || 'info',
    serviceName: 'hub',
    pretty: process.env['NODE_ENV'] === 'development',
    baseContext: {
      env: process.env['NODE_ENV'] || 'development',
    },
  });

  const server = Fastify({
    // Configure Pino logger directly for Fastify
    // This creates a logger compatible with Fastify's expected types
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

  // Note: Fastify's built-in request.log already includes requestId from the logger.
  // The custom logger's AsyncLocalStorage-based correlation ID propagation can be
  // used for non-request contexts (background tasks, services) by wrapping with
  // withCorrelationIdAsync from services/logger.js

  // Record request metrics on every response
  server.addHook('onResponse', (request, reply, done) => {
    const durationMs = reply.elapsedTime;
    const trustContext = classifyTrust(request);
    const isError = reply.statusCode >= 400;
    recordRequest(trustContext.level, durationMs, isError);
    done();
  });

  // Register routes
  await server.register(healthRoutes);
  await server.register(chatRoutes);
  await server.register(taskRoutes);
  await server.register(nodeRoutes);
  await server.register(metricsRoutes);
  await server.register(adminRoutes);
  await server.register(authRoutes);
  await server.register(conversationRoutes);
  await server.register(userRoutes);

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
