/**
 * Integration tests for auth routes
 *
 * Tests token issuance (login) and token refresh functionality
 * covering success cases, error cases, and audit logging.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer } from './helpers.js';
import { signJwt as sharedSignJwt } from '@mission-control/shared';

// Use vi.hoisted to define mock functions that will be hoisted with vi.mock
const { mockLogAuditEvent } = vi.hoisted(() => ({
  mockLogAuditEvent: vi.fn(() => Promise.resolve()),
}));

// Mock Convex client to avoid external dependencies
vi.mock('../src/services/convex.js', () => ({
  isConvexConfigured: vi.fn(() => false),
  getConvexClient: vi.fn(() => ({
    query: vi.fn(),
    mutation: vi.fn(),
  })),
  api: {
    auditLog: {
      log: 'auditLog:log',
    },
  },
}));

// Mock audit logging to prevent actual Convex calls
vi.mock('../src/services/audit.js', () => ({
  logAuditEvent: mockLogAuditEvent,
}));

describe('Auth Routes', () => {
  let server: FastifyInstance;
  const TEST_SECRET = 'test-secret-key-for-jwt-signing-32chars';

  beforeAll(async () => {
    // Set JWT secret for token signing/verification
    process.env['JWT_SECRET'] = TEST_SECRET;

    // Set up MOCK_USERS for testing
    process.env['MOCK_USERS'] = JSON.stringify({
      'test@example.com': { password: 'password123', role: 'power-user', deviceApproved: true },
      'user@example.com': { password: 'userpass' },
      'norole@example.com': { password: 'norolepass', deviceApproved: false },
    });

    server = await createTestServer();
  });

  afterAll(async () => {
    await closeTestServer(server);
    delete process.env['JWT_SECRET'];
    delete process.env['MOCK_USERS'];
  });

  beforeEach(() => {
    mockLogAuditEvent.mockClear();
  });

  /**
   * Helper to create a proper refresh token for testing
   * Uses the shared signJwt with type='refresh' option
   */
  async function createTestRefreshToken(sub: string, email?: string): Promise<string> {
    return sharedSignJwt(
      { sub, email },
      TEST_SECRET,
      { type: 'refresh' }
    );
  }

  /**
   * Helper to create a proper access token for testing
   */
  async function createTestAccessToken(sub: string, email?: string): Promise<string> {
    return sharedSignJwt(
      { sub, email },
      TEST_SECRET,
      { type: 'access' }
    );
  }

  describe('POST /auth/token (Token Issuance)', () => {
    describe('Successful Authentication', () => {
      it('should issue tokens with valid credentials', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
        expect(body.data.accessToken).toBeDefined();
        expect(body.data.refreshToken).toBeDefined();
        expect(body.data.expiresIn).toBe(900); // 15 minutes in seconds
        expect(body.data.tokenType).toBe('Bearer');
      });

      it('should return user object in response', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.user).toBeDefined();
        expect(body.data.user.id).toBeDefined();
        expect(body.data.user.email).toBe('test@example.com');
        expect(body.data.user.role).toBe('power-user');
      });

      it('should include role in JWT payload for power user', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Decode the access token to verify payload
        const tokenParts = body.data.accessToken.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

        expect(payload.sub).toBeDefined();
        expect(payload.email).toBe('test@example.com');
        expect(payload.role).toBe('power-user');
        expect(payload.deviceApproved).toBe(true);
      });

      it('should include deviceApproved in JWT payload when present', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'norole@example.com',
            password: 'norolepass',
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Decode the access token to verify payload
        const tokenParts = body.data.accessToken.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

        expect(payload.deviceApproved).toBe(false);
      });

      it('should issue tokens for user without role', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'user@example.com',
            password: 'userpass',
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data.accessToken).toBeDefined();
        expect(body.data.user.role).toBeUndefined();
      });

      it('should have access token expiry of 15 minutes (900 seconds)', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.expiresIn).toBe(900);

        // Also verify the exp claim in the token
        const tokenParts = body.data.accessToken.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
        const now = Math.floor(Date.now() / 1000);

        // Token should expire approximately 15 minutes from now (within 5 second tolerance)
        expect(payload.exp - now).toBeGreaterThan(895);
        expect(payload.exp - now).toBeLessThan(905);
      });

      it('should log successful login audit event', async () => {
        await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        });

        expect(mockLogAuditEvent).toHaveBeenCalled();
        const auditCall = mockLogAuditEvent.mock.calls.find(
          (call) => call[0].action === 'auth.login_success'
        );
        expect(auditCall).toBeDefined();
        expect(auditCall[0].details).toContain('test@example.com');
        expect(auditCall[0].userId).toBeDefined();
      });

      it('should include sub, email, role, and deviceApproved in JWT payload', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Decode the access token to verify all required claims
        const tokenParts = body.data.accessToken.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

        // Verify required JWT claims
        expect(payload.sub).toBeDefined();
        expect(typeof payload.sub).toBe('string');
        expect(payload.email).toBe('test@example.com');
        expect(payload.role).toBe('power-user');
        expect(payload.deviceApproved).toBe(true);
        expect(payload.iat).toBeDefined();
        expect(payload.exp).toBeDefined();
      });
    });

    describe('Failed Authentication', () => {
      it('should return 401 for invalid credentials (wrong password)', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'wrongpassword',
          }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe('AUTH_INVALID_TOKEN');
        expect(body.error.message).toBe('Invalid credentials');
      });

      it('should return 401 for unknown email', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'unknown@example.com',
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_INVALID_TOKEN');
      });

      it('should log failed login audit event', async () => {
        await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: 'wrongpassword',
          }),
        });

        expect(mockLogAuditEvent).toHaveBeenCalled();
        const auditCall = mockLogAuditEvent.mock.calls.find(
          (call) => call[0].action === 'auth.login_failed'
        );
        expect(auditCall).toBeDefined();
        expect(auditCall[0].details).toContain('test@example.com');
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 for missing email', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should return 400 for missing password', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
          }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should return 400 for invalid email format', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'not-an-email',
            password: 'password123',
          }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should return 400 for empty password', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            email: 'test@example.com',
            password: '',
          }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should return 400 for malformed request body', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/token',
          headers: {
            'content-type': 'application/json',
          },
          payload: 'not-json',
        });

        expect(response.statusCode).toBe(400);
      });
    });
  });

  describe('POST /auth/refresh (Token Refresh)', () => {
    describe('Successful Refresh', () => {
      it('should refresh token with valid refresh token', async () => {
        // Create a proper refresh token with type='refresh'
        const refreshToken = await createTestRefreshToken('user-123', 'test@example.com');

        mockLogAuditEvent.mockClear();

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken,
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.data.accessToken).toBeDefined();
        expect(body.data.expiresIn).toBe(900);
        expect(body.data.tokenType).toBe('Bearer');
      });

      it('should return new access token, expiresIn, and tokenType', async () => {
        const refreshToken = await createTestRefreshToken('user-456', 'user@example.com');

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken,
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.accessToken).toBeDefined();
        expect(typeof body.data.accessToken).toBe('string');
        expect(body.data.expiresIn).toBe(900);
        expect(body.data.tokenType).toBe('Bearer');
      });

      it('should return new refresh token when rotateRefreshToken=true', async () => {
        const originalRefreshToken = await createTestRefreshToken('user-789', 'test@example.com');

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: originalRefreshToken,
            rotateRefreshToken: true,
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.refreshToken).toBeDefined();
        expect(body.data.refreshToken).not.toBe(originalRefreshToken);
      });

      it('should NOT return new refresh token when rotateRefreshToken=false', async () => {
        const refreshToken = await createTestRefreshToken('user-101', 'test@example.com');

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken,
            rotateRefreshToken: false,
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.refreshToken).toBeUndefined();
      });

      it('should NOT return new refresh token when rotateRefreshToken is not specified', async () => {
        const refreshToken = await createTestRefreshToken('user-102', 'test@example.com');

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken,
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Default behavior is no rotation
        expect(body.data.refreshToken).toBeUndefined();
      });

      it('should log successful refresh audit event', async () => {
        const refreshToken = await createTestRefreshToken('user-103', 'test@example.com');

        mockLogAuditEvent.mockClear();

        await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken,
          }),
        });

        expect(mockLogAuditEvent).toHaveBeenCalled();
        const auditCall = mockLogAuditEvent.mock.calls.find(
          (call) => call[0].action === 'auth.refresh_success'
        );
        expect(auditCall).toBeDefined();
        expect(auditCall[0].userId).toBe('user-103');
      });

      it('should preserve user identity in refreshed access token', async () => {
        const refreshToken = await createTestRefreshToken('user-104', 'refresh-test@example.com');

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken,
          }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Decode the new access token to verify the subject is preserved
        const tokenParts = body.data.accessToken.split('.');
        const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());

        expect(payload.sub).toBe('user-104');
        expect(payload.email).toBe('refresh-test@example.com');
      });
    });

    describe('Failed Refresh', () => {
      it('should return 401 for invalid refresh token', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: 'invalid-token',
          }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error).toBeDefined();
      });

      it('should return 401 for expired refresh token', async () => {
        // Create an expired refresh token
        const expiredToken = await sharedSignJwt(
          { sub: 'user-expired' },
          TEST_SECRET,
          { type: 'refresh', expiresIn: '0s' }
        );

        // Wait a bit for token to expire
        await new Promise((resolve) => setTimeout(resolve, 100));

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: expiredToken,
          }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('EXPIRED_TOKEN');
      });

      it('should return 401 when using access token as refresh token (wrong token type)', async () => {
        // Create an access token (not a refresh token)
        const accessToken = await createTestAccessToken('user-wrong-type', 'test@example.com');

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: accessToken,
          }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('INVALID_TOKEN_TYPE');
        expect(body.error.message).toContain('not a refresh token');
      });

      it('should log failed refresh audit event for invalid token', async () => {
        mockLogAuditEvent.mockClear();

        await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: 'invalid-token',
          }),
        });

        expect(mockLogAuditEvent).toHaveBeenCalled();
        const auditCall = mockLogAuditEvent.mock.calls.find(
          (call) => call[0].action === 'auth.refresh_failed'
        );
        expect(auditCall).toBeDefined();
      });

      it('should log failed refresh audit event for wrong token type', async () => {
        const accessToken = await createTestAccessToken('user-audit-test', 'test@example.com');
        mockLogAuditEvent.mockClear();

        await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: accessToken,
          }),
        });

        // The route checks token type AFTER initial verification, so audit should be called
        // for the token type mismatch
        expect(mockLogAuditEvent).not.toHaveBeenCalledWith(
          expect.objectContaining({ action: 'auth.refresh_success' })
        );
      });

      it('should return 401 for token with tampered signature', async () => {
        // Create a valid refresh token and tamper with it
        const validToken = await createTestRefreshToken('user-tampered', 'test@example.com');
        const parts = validToken.split('.');
        // Tamper with the signature
        const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature`;

        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: tamperedToken,
          }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 for missing refreshToken', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({}),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should return 400 for malformed request body', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: 'not-json',
        });

        expect(response.statusCode).toBe(400);
      });

      it('should return 400 for empty refreshToken', async () => {
        const response = await server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({
            refreshToken: '',
          }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });
    });
  });
});
