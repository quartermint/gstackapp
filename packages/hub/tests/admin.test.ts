/**
 * Integration tests for admin routes
 *
 * Tests trust level enforcement and admin operations
 * for node and task management.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer } from './helpers.js';
import {
  registerNode,
  clearNodes,
  getNodes,
  getNode,
} from '../src/services/dispatcher.js';

// Mock Convex client to avoid external dependencies
vi.mock('../src/services/convex.js', () => ({
  isConvexConfigured: vi.fn(() => false),
  getConvexClient: vi.fn(() => ({
    query: vi.fn(),
    mutation: vi.fn(),
  })),
  api: {
    tasks: {
      listByStatus: 'tasks:listByStatus',
      listDeadLetter: 'tasks:listDeadLetter',
      get: 'tasks:get',
      updateStatus: 'tasks:updateStatus',
      updatePriority: 'tasks:updatePriority',
      retryFromDeadLetter: 'tasks:retryFromDeadLetter',
    },
    nodes: {
      listOnline: 'nodes:listOnline',
    },
    auditLog: {
      getRecentErrors: 'auditLog:getRecentErrors',
      search: 'auditLog:search',
      export: 'auditLog:export',
      getByRequestId: 'auditLog:getByRequestId',
    },
  },
}));

// Mock audit logging to prevent actual Convex calls
vi.mock('../src/services/audit.js', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
}));

describe('Admin Routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  beforeEach(() => {
    clearNodes();
  });

  describe('Trust Level Enforcement', () => {
    it('should reject requests without internal trust level', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/overview',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('internal trust level');
    });

    it('should reject authenticated but not internal requests', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: {
          authorization: 'Bearer some-jwt-token',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should allow requests with internal trust (Tailscale headers)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: {
          'tailscale-user-login': 'admin@example.com',
          'tailscale-tailnet-name': 'my-tailnet',
        },
      });

      // Should succeed (200) since it has internal trust
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /admin/overview', () => {
    it('should return system overview with internal trust', async () => {
      // Register a test node first
      await registerNode(
        'test-node-1',
        'test-hostname-1',
        'http://192.168.1.1:3001'
      );

      const response = await server.inject({
        method: 'GET',
        url: '/admin/overview',
        headers: {
          'tailscale-user-login': 'admin@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.system).toBeDefined();
      expect(body.data.system.uptime).toBeGreaterThanOrEqual(0);
      expect(body.data.system.uptimeFormatted).toBeDefined();
      expect(body.data.nodes).toBeDefined();
      expect(body.data.nodes.total).toBe(1);
      expect(body.data.timestamp).toBeDefined();
    });
  });

  describe('Node Management', () => {
    beforeEach(async () => {
      // Register test nodes
      await registerNode(
        'node-1',
        'compute-node-1',
        'http://192.168.1.10:3001'
      );
      await registerNode(
        'node-2',
        'compute-node-2',
        'http://192.168.1.11:3001'
      );
    });

    describe('GET /admin/nodes', () => {
      it('should list all nodes with internal trust', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/nodes',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data.nodes).toHaveLength(2);
        expect(body.data.count).toBe(2);

        const node1 = body.data.nodes.find(
          (n: { hostname: string }) => n.hostname === 'compute-node-1'
        );
        expect(node1).toBeDefined();
        expect(node1.status).toBe('online');
        expect(node1.url).toBe('http://192.168.1.10:3001');
      });
    });

    describe('POST /admin/nodes/:nodeId/drain', () => {
      it('should drain a node', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/nodes/node-1/drain',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data.nodeId).toBe('node-1');
        expect(body.data.status).toBe('draining');

        // Verify node status in registry
        const node = getNode('node-1');
        expect(node?.status).toBe('draining');
      });

      it('should return 404 for non-existent node', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/nodes/non-existent/drain',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NODE_NOT_FOUND');
      });
    });

    describe('POST /admin/nodes/:nodeId/enable', () => {
      it('should re-enable a drained node', async () => {
        // First drain the node
        await server.inject({
          method: 'POST',
          url: '/admin/nodes/node-1/drain',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        // Then enable it
        const response = await server.inject({
          method: 'POST',
          url: '/admin/nodes/node-1/enable',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data.nodeId).toBe('node-1');
        expect(body.data.status).toBe('online');

        // Verify node status in registry
        const node = getNode('node-1');
        expect(node?.status).toBe('online');
      });
    });

    describe('POST /admin/nodes/:nodeId/force-offline', () => {
      it('should force a node offline', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/nodes/node-1/force-offline',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data.nodeId).toBe('node-1');
        expect(body.data.status).toBe('offline');

        // Verify node status in registry
        const node = getNode('node-1');
        expect(node?.status).toBe('offline');
      });
    });

    describe('DELETE /admin/nodes/:nodeId', () => {
      it('should remove a node from registry', async () => {
        const response = await server.inject({
          method: 'DELETE',
          url: '/admin/nodes/node-1',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data.nodeId).toBe('node-1');

        // Verify node is removed from registry
        const node = getNode('node-1');
        expect(node).toBeUndefined();

        // But node-2 should still exist
        const node2 = getNode('node-2');
        expect(node2).toBeDefined();
      });

      it('should return 404 for non-existent node', async () => {
        const response = await server.inject({
          method: 'DELETE',
          url: '/admin/nodes/non-existent',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('NODE_NOT_FOUND');
      });
    });
  });

  describe('Task Management', () => {
    describe('GET /admin/tasks', () => {
      it('should return 503 when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/tasks',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(503);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.message).toContain('not configured');
      });

      it('should validate query parameters', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/tasks?limit=invalid',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });
    });

    describe('GET /admin/tasks/dead-letter', () => {
      it('should return 503 when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/tasks/dead-letter',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(503);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
      });
    });

    describe('POST /admin/tasks/:taskId/cancel', () => {
      it('should return 503 when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/tasks/some-task-id/cancel',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(503);
      });
    });

    describe('POST /admin/tasks/:taskId/retry', () => {
      it('should return 503 when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/tasks/some-task-id/retry',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(503);
      });
    });

    describe('POST /admin/tasks/:taskId/priority', () => {
      it('should validate priority value', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/tasks/some-task-id/priority',
          headers: {
            'tailscale-user-login': 'admin@example.com',
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ priority: 'invalid' }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should reject priority outside valid range', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/tasks/some-task-id/priority',
          headers: {
            'tailscale-user-login': 'admin@example.com',
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ priority: 1000 }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });
    });

    describe('POST /admin/tasks/:taskId/requeue', () => {
      it('should return 503 when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/admin/tasks/some-task-id/requeue',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(503);
      });
    });
  });

  describe('Audit Log', () => {
    describe('GET /admin/audit', () => {
      it('should return 503 when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/audit',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(503);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
      });

      it('should validate query parameters', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/audit?limit=invalid',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });
    });

    describe('GET /admin/audit/export', () => {
      it('should require startTime and endTime', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/audit/export',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should validate format parameter', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/audit/export?startTime=1000&endTime=2000&format=invalid',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });
    });

    describe('GET /admin/audit/:requestId', () => {
      it('should return 503 when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/admin/audit/some-request-id',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(503);
      });
    });
  });
});
