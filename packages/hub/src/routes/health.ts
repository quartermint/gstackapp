/**
 * Health check routes
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version?: string;
  uptime?: number;
}

/**
 * Health check routes plugin
 */
export const healthRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  /**
   * GET /health - Basic health check
   */
  server.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    const response: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env['npm_package_version'] || '0.1.0',
      uptime: process.uptime(),
    };

    return reply.send(response);
  });

  /**
   * GET /health/ready - Readiness probe (for Kubernetes/orchestrators)
   */
  server.get('/health/ready', async (_request, reply) => {
    // TODO: Check database connectivity, external services, etc.
    return reply.send({
      ready: true,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/live - Liveness probe
   */
  server.get('/health/live', async (_request, reply) => {
    return reply.send({
      live: true,
      timestamp: new Date().toISOString(),
    });
  });
};
