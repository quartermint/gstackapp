/**
 * Integration tests for health routes
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer } from './helpers.js';

describe('Health Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    });

    it('should include version', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.version).toBeDefined();
    });

    it('should include uptime', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      expect(body.uptime).toBeDefined();
      expect(typeof body.uptime).toBe('number');
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return valid ISO timestamp', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const body = JSON.parse(response.body);
      const timestamp = new Date(body.timestamp);
      expect(timestamp.toISOString()).toBe(body.timestamp);
    });
  });

  describe('GET /health/ready', () => {
    it('should return 200 with ready: true', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.ready).toBe(true);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('GET /health/live', () => {
    it('should return 200 with live: true', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.live).toBe(true);
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/unknown-route',
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('should include request ID in error response', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/unknown-route',
        headers: {
          'x-request-id': 'test-request-123',
        },
      });

      const body = JSON.parse(response.body);
      expect(body.error.requestId).toBeDefined();
    });
  });

  describe('CORS', () => {
    it('should include CORS headers in response', async () => {
      const response = await server.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          'origin': 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });

      // CORS preflight should not return 404
      expect(response.statusCode).toBeLessThan(400);
    });
  });
});
