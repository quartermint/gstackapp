/**
 * Tests for metrics routes
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer } from './helpers.js';
import {
  recordRequest,
  recordTaskStatus,
  resetMetrics,
  getRawMetrics,
} from '../src/routes/metrics.js';

describe('Metrics Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  beforeEach(() => {
    resetMetrics();
  });

  describe('GET /metrics', () => {
    it('should return Prometheus format by default', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('# HELP');
      expect(response.body).toContain('# TYPE');
      expect(response.body).toContain('mission_control_requests_total');
    });

    it('should return Prometheus format with Accept: text/plain', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
        headers: {
          accept: 'text/plain',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.body).toContain('mission_control_requests_total');
    });

    it('should return JSON format with Accept: application/json', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
        headers: {
          accept: 'application/json',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/json');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('requests');
      expect(body).toHaveProperty('tasks');
      expect(body).toHaveProperty('nodes');
      expect(body).toHaveProperty('errors');
      expect(body).toHaveProperty('latency');
      expect(body).toHaveProperty('system');
    });

    it('should include latency percentiles in JSON format', async () => {
      // Record some latency samples
      recordRequest('internal', 100, false);
      recordRequest('authenticated', 200, false);
      recordRequest('untrusted', 50, false);

      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
        headers: {
          accept: 'application/json',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.latency).toHaveProperty('p50Ms');
      expect(body.latency).toHaveProperty('p95Ms');
      expect(body.latency).toHaveProperty('p99Ms');
      expect(body.latency).toHaveProperty('meanMs');
      expect(body.latency.sampleCount).toBe(3);
    });

    it('should include system information', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
        headers: {
          accept: 'application/json',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.system).toHaveProperty('uptimeSeconds');
      expect(body.system).toHaveProperty('memoryUsageMb');
      expect(body.system).toHaveProperty('convexConnected');
      expect(typeof body.system.uptimeSeconds).toBe('number');
      expect(typeof body.system.memoryUsageMb).toBe('number');
    });
  });

  describe('recordRequest', () => {
    it('should record requests by trust level', () => {
      recordRequest('internal', 100, false);
      recordRequest('authenticated', 150, false);
      recordRequest('authenticated', 200, false);
      recordRequest('untrusted', 50, false);

      const metrics = getRawMetrics();
      expect(metrics.requestsByTrustLevel.internal).toBe(1);
      expect(metrics.requestsByTrustLevel.authenticated).toBe(2);
      expect(metrics.requestsByTrustLevel.untrusted).toBe(1);
      expect(metrics.totalRequests).toBe(4);
    });

    it('should track errors', () => {
      recordRequest('internal', 100, false);
      recordRequest('authenticated', 150, true, 'VALIDATION_ERROR');
      recordRequest('untrusted', 50, true, 'AUTH_ERROR');
      recordRequest('untrusted', 60, true, 'VALIDATION_ERROR');

      const metrics = getRawMetrics();
      expect(metrics.totalErrors).toBe(3);
      expect(metrics.errorsByType['VALIDATION_ERROR']).toBe(2);
      expect(metrics.errorsByType['AUTH_ERROR']).toBe(1);
    });

    it('should record latency samples', () => {
      recordRequest('internal', 100, false);
      recordRequest('internal', 200, false);
      recordRequest('internal', 150, false);

      const metrics = getRawMetrics();
      expect(metrics.latencySamples).toHaveLength(3);
      expect(metrics.latencySamples).toContain(100);
      expect(metrics.latencySamples).toContain(200);
      expect(metrics.latencySamples).toContain(150);
    });
  });

  describe('recordTaskStatus', () => {
    it('should track task counts by status', () => {
      recordTaskStatus('pending', 1);
      recordTaskStatus('running', 1);
      recordTaskStatus('completed', 1);
      recordTaskStatus('pending', 1);

      const metrics = getRawMetrics();
      expect(metrics.tasksByStatus.pending).toBe(2);
      expect(metrics.tasksByStatus.running).toBe(1);
      expect(metrics.tasksByStatus.completed).toBe(1);
    });

    it('should support negative deltas', () => {
      recordTaskStatus('pending', 3);
      recordTaskStatus('pending', -1);

      const metrics = getRawMetrics();
      expect(metrics.tasksByStatus.pending).toBe(2);
    });
  });

  describe('Prometheus format', () => {
    it('should include all metric types', async () => {
      recordRequest('internal', 100, false);
      recordTaskStatus('running', 1);

      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;

      // Counter metrics
      expect(body).toContain('mission_control_requests_total');
      expect(body).toContain('mission_control_errors_total');

      // Gauge metrics
      expect(body).toContain('mission_control_tasks_total');
      expect(body).toContain('mission_control_nodes_total');
      expect(body).toContain('mission_control_uptime_seconds');
      expect(body).toContain('mission_control_memory_usage_mb');

      // Labeled metrics
      expect(body).toContain('trust_level=');
    });

    it('should include node metrics when nodes are registered', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/metrics',
      });

      const body = response.body;
      expect(body).toContain('mission_control_nodes_online');
      expect(body).toContain('mission_control_nodes_offline');
      expect(body).toContain('mission_control_node_utilization_percent');
    });
  });
});
