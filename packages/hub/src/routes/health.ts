/**
 * Health check routes
 *
 * Provides liveness, readiness, and deep health checks
 * for orchestration and monitoring systems.
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { isConvexConfigured, getConvexClient, api } from '../services/convex.js';
import { getNodeStats, getHealthyNodes } from '../services/dispatcher.js';

interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version?: string;
  uptime?: number;
}

interface ReadinessResponse {
  ready: boolean;
  timestamp: string;
  checks: {
    convex: {
      configured: boolean;
      connected: boolean;
      error?: string;
    };
    nodes: {
      healthy: number;
      total: number;
      hasCapacity: boolean;
    };
  };
}

interface DeepHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    convex: {
      status: 'ok' | 'error' | 'not_configured';
      latencyMs?: number;
      error?: string;
    };
    nodes: {
      status: 'ok' | 'degraded' | 'error';
      total: number;
      online: number;
      offline: number;
      busy: number;
      utilizationPercent: number;
      details: Array<{
        id: string;
        hostname: string;
        status: string;
        load: number;
        lastHeartbeatAgo: string;
      }>;
    };
    memory: {
      status: 'ok' | 'warning' | 'critical';
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
      usagePercent: number;
    };
  };
}

/**
 * Check Convex connectivity with timing
 */
async function checkConvexConnectivity(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  if (!isConvexConfigured()) {
    return { connected: false, error: 'CONVEX_URL not configured' };
  }

  const startTime = Date.now();

  try {
    const client = getConvexClient();
    // Perform a simple query to verify connectivity
    await client.query(api.nodes.listOnline, {});

    return {
      connected: true,
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      connected: false,
      latencyMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get memory usage status
 */
function getMemoryStatus(): {
  status: 'ok' | 'warning' | 'critical';
  heapUsedMb: number;
  heapTotalMb: number;
  rssMb: number;
  usagePercent: number;
} {
  const memoryUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const rssMb = Math.round(memoryUsage.rss / 1024 / 1024);
  const usagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (usagePercent > 90) {
    status = 'critical';
  } else if (usagePercent > 75) {
    status = 'warning';
  }

  return {
    status,
    heapUsedMb,
    heapTotalMb,
    rssMb,
    usagePercent: Math.round(usagePercent * 100) / 100,
  };
}

/**
 * Format time ago string
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
  return `${hours}h ${minutes % 60}m ago`;
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
   *
   * Returns ready: true if the service can handle requests.
   * Checks Convex connectivity and node availability.
   */
  server.get<{ Reply: ReadinessResponse }>(
    '/health/ready',
    async (_request, reply) => {
      // Check Convex connectivity
      const convexCheck = await checkConvexConnectivity();

      // Check node availability
      const nodeStats = getNodeStats();
      const hasCapacity =
        nodeStats.total > 0 &&
        nodeStats.usedCapacity < nodeStats.totalCapacity;

      // Determine overall readiness
      // We're ready if:
      // 1. Convex is either not configured (graceful degradation) or connected
      // 2. We have at least some node capacity OR no nodes are configured (development mode)
      const convexOk = !isConvexConfigured() || convexCheck.connected;
      const nodesOk = nodeStats.total === 0 || hasCapacity;
      const ready = convexOk && nodesOk;

      const response: ReadinessResponse = {
        ready,
        timestamp: new Date().toISOString(),
        checks: {
          convex: {
            configured: isConvexConfigured(),
            connected: convexCheck.connected,
            error: convexCheck.error,
          },
          nodes: {
            healthy: nodeStats.online,
            total: nodeStats.total,
            hasCapacity,
          },
        },
      };

      return reply.status(ready ? 200 : 503).send(response);
    }
  );

  /**
   * GET /health/live - Liveness probe
   *
   * Simple check that the service is running.
   * Should not check external dependencies.
   */
  server.get('/health/live', async (_request, reply) => {
    return reply.send({
      live: true,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /health/deep - Comprehensive health check
   *
   * Performs deep checks on all dependencies and provides
   * detailed status information for debugging and monitoring.
   */
  server.get<{ Reply: DeepHealthResponse }>(
    '/health/deep',
    async (_request, reply) => {
      // Check Convex
      const convexCheck = await checkConvexConnectivity();
      let convexStatus: 'ok' | 'error' | 'not_configured' = 'not_configured';
      if (isConvexConfigured()) {
        convexStatus = convexCheck.connected ? 'ok' : 'error';
      }

      // Check nodes
      const nodeStats = getNodeStats();
      const healthyNodes = getHealthyNodes();
      const utilizationPercent =
        nodeStats.totalCapacity > 0
          ? (nodeStats.usedCapacity / nodeStats.totalCapacity) * 100
          : 0;

      let nodeStatus: 'ok' | 'degraded' | 'error' = 'ok';
      if (nodeStats.total === 0) {
        nodeStatus = 'degraded'; // No nodes registered (might be development mode)
      } else if (nodeStats.online === 0) {
        nodeStatus = 'error'; // All nodes offline
      } else if (nodeStats.online < nodeStats.total / 2) {
        nodeStatus = 'degraded'; // Less than half of nodes online
      } else if (utilizationPercent > 90) {
        nodeStatus = 'degraded'; // Near capacity
      }

      // Check memory
      const memoryStatus = getMemoryStatus();

      // Determine overall status
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (
        convexStatus === 'error' ||
        nodeStatus === 'error' ||
        memoryStatus.status === 'critical'
      ) {
        overallStatus = 'unhealthy';
      } else if (
        convexStatus === 'not_configured' ||
        nodeStatus === 'degraded' ||
        memoryStatus.status === 'warning'
      ) {
        overallStatus = 'degraded';
      }

      const response: DeepHealthResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        version: process.env['npm_package_version'] || '0.1.0',
        uptime: process.uptime(),
        checks: {
          convex: {
            status: convexStatus,
            latencyMs: convexCheck.latencyMs,
            error: convexCheck.error,
          },
          nodes: {
            status: nodeStatus,
            total: nodeStats.total,
            online: nodeStats.online,
            offline: nodeStats.offline,
            busy: nodeStats.busy,
            utilizationPercent: Math.round(utilizationPercent * 100) / 100,
            details: healthyNodes.map((node) => ({
              id: node.id,
              hostname: node.hostname,
              status: node.status,
              load: node.load,
              lastHeartbeatAgo: formatTimeAgo(node.lastHeartbeat),
            })),
          },
          memory: memoryStatus,
        },
      };

      // Return appropriate HTTP status
      const httpStatus =
        overallStatus === 'unhealthy'
          ? 503
          : overallStatus === 'degraded'
            ? 200
            : 200;

      return reply.status(httpStatus).send(response);
    }
  );
};
