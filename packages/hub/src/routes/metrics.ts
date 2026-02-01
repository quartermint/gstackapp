/**
 * Metrics endpoint supporting Prometheus text and JSON formats
 *
 * Provides observability data including:
 * - Request counts by trust level
 * - Task counts by status
 * - Node utilization metrics
 * - Error rates
 * - Latency histograms (p50, p95, p99)
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { getNodeStats, getNodes } from '../services/dispatcher.js';
import { isConvexConfigured, getConvexClient, api } from '../services/convex.js';

/**
 * Metrics data structure for internal tracking
 */
interface MetricsData {
  /** Request counts by trust level */
  requestsByTrustLevel: {
    internal: number;
    'power-user': number;
    authenticated: number;
    untrusted: number;
  };
  /** Task counts by status */
  tasksByStatus: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  /** Error counts by type */
  errorsByType: Record<string, number>;
  /** Latency samples for histogram calculation */
  latencySamples: number[];
  /** Total request count */
  totalRequests: number;
  /** Total error count */
  totalErrors: number;
  /** Start time for uptime calculation */
  startTime: number;
}

/**
 * In-memory metrics storage
 */
const metrics: MetricsData = {
  requestsByTrustLevel: {
    internal: 0,
    'power-user': 0,
    authenticated: 0,
    untrusted: 0,
  },
  tasksByStatus: {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  },
  errorsByType: {},
  latencySamples: [],
  totalRequests: 0,
  totalErrors: 0,
  startTime: Date.now(),
};

/**
 * Maximum latency samples to keep (for percentile calculations)
 */
const MAX_LATENCY_SAMPLES = 10000;

/**
 * Record a request for metrics
 *
 * @param trustLevel - The trust level of the request
 * @param durationMs - Request duration in milliseconds
 * @param isError - Whether the request resulted in an error
 * @param errorType - Optional error type for categorization
 */
export function recordRequest(
  trustLevel: 'internal' | 'power-user' | 'authenticated' | 'untrusted',
  durationMs: number,
  isError: boolean = false,
  errorType?: string
): void {
  metrics.totalRequests++;
  metrics.requestsByTrustLevel[trustLevel]++;

  // Record latency sample
  metrics.latencySamples.push(durationMs);

  // Keep samples bounded
  if (metrics.latencySamples.length > MAX_LATENCY_SAMPLES) {
    metrics.latencySamples.shift();
  }

  if (isError) {
    metrics.totalErrors++;
    if (errorType) {
      metrics.errorsByType[errorType] = (metrics.errorsByType[errorType] || 0) + 1;
    }
  }
}

/**
 * Record a task status change
 *
 * @param status - The task status
 * @param delta - Amount to change (default: 1)
 */
export function recordTaskStatus(
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
  delta: number = 1
): void {
  metrics.tasksByStatus[status] += delta;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;

  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)] ?? 0;
}

/**
 * Calculate latency histogram percentiles
 */
function calculateLatencyPercentiles(): {
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  count: number;
} {
  if (metrics.latencySamples.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0, count: 0 };
  }

  const sorted = [...metrics.latencySamples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    mean: sum / sorted.length,
    count: sorted.length,
  };
}

/**
 * Get collected metrics in structured format
 */
async function getMetrics(): Promise<{
  requests: {
    total: number;
    byTrustLevel: Record<string, number>;
    errorRate: number;
  };
  tasks: {
    byStatus: Record<string, number>;
    total: number;
  };
  nodes: {
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
      currentTasks: number;
      maxConcurrentTasks: number;
    }>;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  latency: {
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    meanMs: number;
    sampleCount: number;
  };
  system: {
    uptimeSeconds: number;
    memoryUsageMb: number;
    convexConnected: boolean;
  };
}> {
  const nodeStats = getNodeStats();
  const nodes = getNodes();
  const latencyStats = calculateLatencyPercentiles();

  // Check Convex connectivity
  let convexConnected = false;
  if (isConvexConfigured()) {
    try {
      const client = getConvexClient();
      // Simple connectivity check
      await client.query(api.nodes.listOnline, {});
      convexConnected = true;
    } catch {
      convexConnected = false;
    }
  }

  const uptimeSeconds = Math.floor((Date.now() - metrics.startTime) / 1000);
  const memoryUsage = process.memoryUsage();

  return {
    requests: {
      total: metrics.totalRequests,
      byTrustLevel: { ...metrics.requestsByTrustLevel },
      errorRate:
        metrics.totalRequests > 0
          ? metrics.totalErrors / metrics.totalRequests
          : 0,
    },
    tasks: {
      byStatus: { ...metrics.tasksByStatus },
      total: Object.values(metrics.tasksByStatus).reduce((a, b) => a + b, 0),
    },
    nodes: {
      total: nodeStats.total,
      online: nodeStats.online,
      offline: nodeStats.offline,
      busy: nodeStats.busy,
      utilizationPercent:
        nodeStats.totalCapacity > 0
          ? (nodeStats.usedCapacity / nodeStats.totalCapacity) * 100
          : 0,
      details: nodes.map((node) => ({
        id: node.id,
        hostname: node.hostname,
        status: node.status,
        load: node.load,
        currentTasks: node.currentTasks,
        maxConcurrentTasks: node.maxConcurrentTasks,
      })),
    },
    errors: {
      total: metrics.totalErrors,
      byType: { ...metrics.errorsByType },
    },
    latency: {
      p50Ms: latencyStats.p50,
      p95Ms: latencyStats.p95,
      p99Ms: latencyStats.p99,
      meanMs: latencyStats.mean,
      sampleCount: latencyStats.count,
    },
    system: {
      uptimeSeconds,
      memoryUsageMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      convexConnected,
    },
  };
}

/**
 * Format metrics as Prometheus text exposition format
 */
async function formatPrometheus(): Promise<string> {
  const data = await getMetrics();
  const lines: string[] = [];

  // Helper to add metric
  const addMetric = (
    name: string,
    type: 'counter' | 'gauge' | 'histogram',
    help: string,
    values: Array<{ labels?: Record<string, string>; value: number }>
  ) => {
    lines.push(`# HELP ${name} ${help}`);
    lines.push(`# TYPE ${name} ${type}`);
    for (const { labels, value } of values) {
      if (labels && Object.keys(labels).length > 0) {
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        lines.push(`${name}{${labelStr}} ${value}`);
      } else {
        lines.push(`${name} ${value}`);
      }
    }
  };

  // Request metrics
  addMetric(
    'mission_control_requests_total',
    'counter',
    'Total number of requests',
    [{ value: data.requests.total }]
  );

  addMetric(
    'mission_control_requests_by_trust_level',
    'counter',
    'Requests by trust level',
    Object.entries(data.requests.byTrustLevel).map(([level, count]) => ({
      labels: { trust_level: level },
      value: count,
    }))
  );

  addMetric(
    'mission_control_request_error_rate',
    'gauge',
    'Request error rate (0-1)',
    [{ value: data.requests.errorRate }]
  );

  // Task metrics
  addMetric(
    'mission_control_tasks_total',
    'gauge',
    'Total number of tasks',
    [{ value: data.tasks.total }]
  );

  addMetric(
    'mission_control_tasks_by_status',
    'gauge',
    'Tasks by status',
    Object.entries(data.tasks.byStatus).map(([status, count]) => ({
      labels: { status },
      value: count,
    }))
  );

  // Node metrics
  addMetric(
    'mission_control_nodes_total',
    'gauge',
    'Total number of compute nodes',
    [{ value: data.nodes.total }]
  );

  addMetric(
    'mission_control_nodes_online',
    'gauge',
    'Number of online nodes',
    [{ value: data.nodes.online }]
  );

  addMetric(
    'mission_control_nodes_offline',
    'gauge',
    'Number of offline nodes',
    [{ value: data.nodes.offline }]
  );

  addMetric(
    'mission_control_nodes_busy',
    'gauge',
    'Number of busy nodes',
    [{ value: data.nodes.busy }]
  );

  addMetric(
    'mission_control_node_utilization_percent',
    'gauge',
    'Overall node utilization percentage',
    [{ value: data.nodes.utilizationPercent }]
  );

  // Per-node metrics
  for (const node of data.nodes.details) {
    addMetric(
      'mission_control_node_load',
      'gauge',
      'Node CPU load',
      [{ labels: { node_id: node.id, hostname: node.hostname }, value: node.load }]
    );

    addMetric(
      'mission_control_node_current_tasks',
      'gauge',
      'Current tasks on node',
      [{ labels: { node_id: node.id, hostname: node.hostname }, value: node.currentTasks }]
    );
  }

  // Error metrics
  addMetric(
    'mission_control_errors_total',
    'counter',
    'Total number of errors',
    [{ value: data.errors.total }]
  );

  if (Object.keys(data.errors.byType).length > 0) {
    addMetric(
      'mission_control_errors_by_type',
      'counter',
      'Errors by type',
      Object.entries(data.errors.byType).map(([type, count]) => ({
        labels: { error_type: type },
        value: count,
      }))
    );
  }

  // Latency metrics (histogram summary)
  addMetric(
    'mission_control_request_duration_ms',
    'gauge',
    'Request duration percentiles in milliseconds',
    [
      { labels: { quantile: '0.5' }, value: data.latency.p50Ms },
      { labels: { quantile: '0.95' }, value: data.latency.p95Ms },
      { labels: { quantile: '0.99' }, value: data.latency.p99Ms },
    ]
  );

  addMetric(
    'mission_control_request_duration_mean_ms',
    'gauge',
    'Mean request duration in milliseconds',
    [{ value: data.latency.meanMs }]
  );

  addMetric(
    'mission_control_request_duration_count',
    'counter',
    'Number of request duration samples',
    [{ value: data.latency.sampleCount }]
  );

  // System metrics
  addMetric(
    'mission_control_uptime_seconds',
    'counter',
    'Service uptime in seconds',
    [{ value: data.system.uptimeSeconds }]
  );

  addMetric(
    'mission_control_memory_usage_mb',
    'gauge',
    'Heap memory usage in megabytes',
    [{ value: data.system.memoryUsageMb }]
  );

  addMetric(
    'mission_control_convex_connected',
    'gauge',
    'Convex database connection status (1=connected, 0=disconnected)',
    [{ value: data.system.convexConnected ? 1 : 0 }]
  );

  return lines.join('\n') + '\n';
}

/**
 * Metrics routes plugin
 */
export const metricsRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  /**
   * GET /metrics - Metrics endpoint
   *
   * Supports content negotiation:
   * - Accept: text/plain (default) -> Prometheus format
   * - Accept: application/json -> JSON format
   */
  server.get(
    '/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const accept = request.headers.accept || 'text/plain';

      if (accept.includes('application/json')) {
        // JSON format
        const data = await getMetrics();
        return reply
          .header('Content-Type', 'application/json')
          .send(data);
      }

      // Default: Prometheus text format
      const prometheusText = await formatPrometheus();
      return reply
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(prometheusText);
    }
  );
};

/**
 * Reset metrics (useful for testing)
 */
export function resetMetrics(): void {
  metrics.requestsByTrustLevel = {
    internal: 0,
    'power-user': 0,
    authenticated: 0,
    untrusted: 0,
  };
  metrics.tasksByStatus = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  metrics.errorsByType = {};
  metrics.latencySamples = [];
  metrics.totalRequests = 0;
  metrics.totalErrors = 0;
  metrics.startTime = Date.now();
}

/**
 * Get raw metrics data (for testing)
 */
export function getRawMetrics(): MetricsData {
  return { ...metrics };
}
