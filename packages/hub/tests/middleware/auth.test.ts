/**
 * Comprehensive tests for authentication middleware
 *
 * Tests cover:
 * - requireTrustLevel - base middleware for trust level enforcement
 * - requireAuthenticated - convenience wrapper for authenticated endpoints
 * - requirePowerUser - power user role enforcement
 * - requireInternal - Tailscale-only endpoint protection
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { closeTestServer } from '../helpers.js';
import { createServer } from '../../src/server.js';
import { signJwt } from '../../src/services/trust.js';
import {
  requireTrustLevel,
  requireAuthenticated,
  requirePowerUser,
  requireInternal,
} from '../../src/middleware/auth.js';
import { TRUST_LEVELS, ERROR_CODES } from '@mission-control/shared';

/**
 * Create a test server with custom middleware test routes
 * This registers routes BEFORE calling server.ready()
 */
async function createAuthTestServer(): Promise<FastifyInstance> {
  // Set test environment
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'error';

  const server = await createServer();

  // Register test routes for middleware testing BEFORE calling ready()
  server.get(
    '/test/require-trust-authenticated',
    { preHandler: requireTrustLevel(TRUST_LEVELS.AUTHENTICATED) },
    async () => ({ success: true, level: 'authenticated' })
  );

  server.get(
    '/test/require-trust-internal',
    { preHandler: requireTrustLevel(TRUST_LEVELS.INTERNAL) },
    async () => ({ success: true, level: 'internal' })
  );

  server.get(
    '/test/require-trust-power-user',
    { preHandler: requireTrustLevel(TRUST_LEVELS.POWER_USER) },
    async () => ({ success: true, level: 'power-user' })
  );

  server.get(
    '/test/require-trust-custom-error',
    {
      preHandler: requireTrustLevel(TRUST_LEVELS.AUTHENTICATED, {
        errorMessage: 'Custom error: You need to log in!',
      }),
    },
    async () => ({ success: true })
  );

  server.get(
    '/test/require-trust-custom-audit',
    {
      preHandler: requireTrustLevel(TRUST_LEVELS.AUTHENTICATED, {
        auditAction: 'custom_module.access_blocked',
      }),
    },
    async () => ({ success: true })
  );

  server.get(
    '/test/require-trust-verify-signature',
    {
      preHandler: requireTrustLevel(TRUST_LEVELS.AUTHENTICATED, {
        verifySignature: true,
      }),
    },
    async () => ({ success: true })
  );

  server.get(
    '/test/require-authenticated',
    { preHandler: requireAuthenticated('test_module') },
    async () => ({ success: true, module: 'authenticated' })
  );

  server.get(
    '/test/require-power-user',
    { preHandler: requirePowerUser('power_test') },
    async () => ({ success: true, module: 'power-user' })
  );

  server.get(
    '/test/require-internal',
    { preHandler: requireInternal('internal_test') },
    async () => ({ success: true, module: 'internal' })
  );

  // Wait for server to be ready after registering routes
  await server.ready();

  return server;
}

// Use vi.hoisted to create mock functions that can be referenced in vi.mock
const { mockLogAuditEvent } = vi.hoisted(() => {
  return {
    mockLogAuditEvent: vi.fn(() => Promise.resolve()),
  };
});

// Mock Convex client to avoid external dependencies
vi.mock('../../src/services/convex.js', () => ({
  isConvexConfigured: vi.fn(() => false),
  getConvexClient: vi.fn(() => ({
    query: vi.fn(),
    mutation: vi.fn(),
  })),
  api: {
    tasks: {
      listByStatus: 'tasks:listByStatus',
    },
    nodes: {
      listOnline: 'nodes:listOnline',
    },
    auditLog: {
      search: 'auditLog:search',
    },
  },
}));

// Mock audit logging to track calls
vi.mock('../../src/services/audit.js', () => ({
  logAuditEvent: mockLogAuditEvent,
}));

describe('Auth Middleware', () => {
  let server: FastifyInstance;
  let validToken: string;
  let powerUserToken: string;
  let regularUserToken: string;
  let powerUserNoDeviceApprovalToken: string;

  beforeAll(async () => {
    // Set JWT secret for testing
    process.env['JWT_SECRET'] = 'test-secret-key-for-jwt-signing-minimum-32-chars';

    // Generate test tokens first (before creating server, as token generation is independent)
    validToken = await signJwt({ sub: 'user_123', email: 'test@example.com' });

    powerUserToken = await signJwt({
      sub: 'user_456',
      email: 'power@example.com',
      role: 'power-user',
      deviceApproved: true,
    });

    regularUserToken = await signJwt({
      sub: 'user_789',
      email: 'regular@example.com',
    });

    powerUserNoDeviceApprovalToken = await signJwt({
      sub: 'user_999',
      email: 'power-no-device@example.com',
      role: 'power-user',
      deviceApproved: false,
    });

    // Create the test server with middleware test routes
    server = await createAuthTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  beforeEach(() => {
    mockLogAuditEvent.mockClear();
  });

  // ==================== requireTrustLevel Tests ====================

  describe('requireTrustLevel', () => {
    describe('with AUTHENTICATED level', () => {
      it('should return 401 for untrusted requests', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-authenticated',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe(ERROR_CODES.AUTH_MISSING_TOKEN);
        expect(body.error.message).toContain('authenticated');
      });

      it('should allow requests with valid JWT token', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-authenticated',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.level).toBe('authenticated');
      });

      it('should allow requests with internal trust (Tailscale headers)', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-authenticated',
          headers: {
            'tailscale-user-login': 'admin@example.com',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });
    });

    describe('with INTERNAL level', () => {
      it('should return 401 for untrusted requests', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-internal',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe(ERROR_CODES.AUTH_MISSING_TOKEN);
      });

      it('should return 403 for authenticated requests (not internal)', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-internal',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe(ERROR_CODES.INSUFFICIENT_TRUST);
      });

      it('should allow requests with Tailscale headers', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-internal',
          headers: {
            'tailscale-user-login': 'admin@example.com',
            'tailscale-tailnet-name': 'my-tailnet',
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.level).toBe('internal');
      });
    });

    describe('with POWER_USER level', () => {
      it('should return 401 for untrusted requests', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-power-user',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe(ERROR_CODES.AUTH_MISSING_TOKEN);
      });

      it('should return 403 for authenticated but non-power-user requests', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-power-user',
          headers: {
            authorization: `Bearer ${regularUserToken}`,
          },
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.body);
        expect(body.error.code).toBe(ERROR_CODES.INSUFFICIENT_TRUST);
      });

      it('should allow power user with device approval', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-power-user',
          headers: {
            authorization: `Bearer ${powerUserToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });
    });

    describe('audit logging', () => {
      it('should log access denials to audit', async () => {
        await server.inject({
          method: 'GET',
          url: '/test/require-trust-authenticated',
        });

        expect(mockLogAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'access_denied',
            details: expect.stringContaining('untrusted'),
          })
        );
      });

      it('should include request details in audit log', async () => {
        await server.inject({
          method: 'GET',
          url: '/test/require-trust-authenticated',
        });

        expect(mockLogAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            requestId: expect.any(String),
            action: 'access_denied',
            details: expect.stringContaining('/test/require-trust-authenticated'),
          })
        );
      });
    });

    describe('custom options', () => {
      it('should respect custom errorMessage option', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-custom-error',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.error.message).toBe('Custom error: You need to log in!');
      });

      it('should respect custom auditAction option', async () => {
        await server.inject({
          method: 'GET',
          url: '/test/require-trust-custom-audit',
        });

        expect(mockLogAuditEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'custom_module.access_blocked',
          })
        );
      });

      it('should work with verifySignature=true option', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-verify-signature',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });

      it('should reject invalid tokens when verifySignature=true', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/test/require-trust-verify-signature',
          headers: {
            authorization: 'Bearer invalid.token.here',
          },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
      });
    });
  });

  // ==================== requireAuthenticated Tests ====================

  describe('requireAuthenticated', () => {
    it('should return 401 without Authorization header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ERROR_CODES.AUTH_MISSING_TOKEN);
      expect(body.error.message).toContain('Authentication required');
    });

    it('should return 401 with invalid JWT token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
        headers: {
          authorization: 'Bearer not-a-valid-jwt-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ERROR_CODES.AUTH_MISSING_TOKEN);
    });

    it('should return 401 with expired JWT token (using signature verification)', async () => {
      // Generate a fresh expired token right in the test to avoid timing issues
      const freshExpiredToken = await signJwt(
        { sub: 'user_freshexpired', email: 'freshexpired@example.com' },
        '1s'
      );
      // Wait for the token to expire
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Use the verifySignature route which uses jose's proper expiration checking
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-trust-verify-signature',
        headers: {
          authorization: `Bearer ${freshExpiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ERROR_CODES.AUTH_MISSING_TOKEN);
    }, 10000); // Increase test timeout to 10 seconds

    it('should allow request with valid JWT token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.module).toBe('authenticated');
    });

    it('should use "[auditPrefix].access_denied" as audit action', async () => {
      await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
      });

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'test_module.access_denied',
        })
      );
    });

    it('should allow request with malformed Bearer prefix gracefully', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
        headers: {
          authorization: 'Basic not-bearer-token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  // ==================== requirePowerUser Tests ====================

  describe('requirePowerUser', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-power-user',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ERROR_CODES.AUTH_MISSING_TOKEN);
    });

    it('should return 403 for authenticated but not power-user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-power-user',
        headers: {
          authorization: `Bearer ${regularUserToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ERROR_CODES.INSUFFICIENT_TRUST);
      expect(body.error.message).toContain('power user');
    });

    it('should return 403 if role="power-user" but deviceApproved=false', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-power-user',
        headers: {
          authorization: `Bearer ${powerUserNoDeviceApprovalToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe(ERROR_CODES.INSUFFICIENT_TRUST);
    });

    it('should allow request with role="power-user" AND deviceApproved=true', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-power-user',
        headers: {
          authorization: `Bearer ${powerUserToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.module).toBe('power-user');
    });

    it('should allow internal (Tailscale) requests as they outrank power-user', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-power-user',
        headers: {
          'tailscale-user-login': 'admin@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  // ==================== requireInternal Tests ====================

  describe('requireInternal', () => {
    it('should return 403 without Tailscale headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.message).toContain('internal trust level');
    });

    it('should return 403 with only JWT authentication (not internal)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should return 403 even for power-user tokens (not internal)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
        headers: {
          authorization: `Bearer ${powerUserToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('should allow request with Tailscale headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
        headers: {
          'tailscale-user-login': 'admin@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.module).toBe('internal');
    });

    it('should allow request with tailscale-authenticated header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
        headers: {
          'tailscale-authenticated': 'true',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should use FORBIDDEN error code (not INSUFFICIENT_TRUST)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
      });

      const body = JSON.parse(response.body);
      // requireInternal uses 'FORBIDDEN' directly, not INSUFFICIENT_TRUST
      expect(body.error.code).toBe('FORBIDDEN');
      expect(body.error.code).not.toBe(ERROR_CODES.INSUFFICIENT_TRUST);
    });

    it('should log access denial with correct audit prefix', async () => {
      await server.inject({
        method: 'GET',
        url: '/test/require-internal',
      });

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'internal_test.access_denied',
        })
      );
    });
  });

  // ==================== Edge Cases ====================

  describe('Edge Cases', () => {
    it('should handle empty Authorization header', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
        headers: {
          authorization: '',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle Authorization header with only "Bearer" (no token)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
        headers: {
          authorization: 'Bearer ',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should handle multiple Tailscale headers', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
        headers: {
          'tailscale-user-login': 'admin@example.com',
          'tailscale-tailnet-name': 'my-tailnet',
          'tailscale-user-name': 'Admin User',
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should handle both JWT and Tailscale headers (Tailscale takes precedence)', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-internal',
        headers: {
          authorization: `Bearer ${validToken}`,
          'tailscale-user-login': 'admin@example.com',
        },
      });

      // Tailscale headers should give internal trust level
      expect(response.statusCode).toBe(200);
    });

    it('should include requestId in error responses', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/test/require-authenticated',
      });

      const body = JSON.parse(response.body);
      expect(body.error.requestId).toBeDefined();
      expect(typeof body.error.requestId).toBe('string');
    });
  });
});
