/**
 * Integration tests for user routes
 *
 * Tests GET /user/profile and PUT /user/preferences endpoints
 * with comprehensive coverage of authentication, validation,
 * and business logic scenarios.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, createValidToken, createPowerUserToken, createExpiredToken } from './helpers.js';

// Mock Convex client to avoid external dependencies
vi.mock('../src/services/convex.js', () => ({
  isConvexConfigured: vi.fn(() => false),
  getConvexClient: vi.fn(() => ({
    query: vi.fn(),
    mutation: vi.fn(),
  })),
  api: {
    users: {
      get: 'users:get',
      upsert: 'users:upsert',
      updatePreferences: 'users:updatePreferences',
    },
  },
}));

// Mock audit logging to prevent actual Convex calls
vi.mock('../src/services/audit.js', () => ({
  logAuditEvent: vi.fn(() => Promise.resolve()),
}));

describe('User Routes', () => {
  let server: FastifyInstance;
  let validToken: string;
  let powerUserToken: string;
  let expiredToken: string;

  beforeAll(async () => {
    // Set required environment variables
    process.env['JWT_SECRET'] = 'test-secret-key-for-jwt-signing-minimum-32-chars';
    process.env['NODE_ENV'] = 'test';

    server = await createTestServer();

    // Create valid test tokens using shared helpers
    validToken = await createValidToken('user_123', 'test@example.com');
    powerUserToken = await createPowerUserToken('user_456', 'power@example.com');
    expiredToken = await createExpiredToken('user_expired');
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /user/profile', () => {
    describe('Authentication', () => {
      it('should return 401 without authentication', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
        expect(body.error.message).toContain('Authentication required');
      });

      it('should return 401 with invalid JWT token', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: 'Bearer invalid-token-format',
          },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
      });

      it('should return 401 with expired JWT token', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${expiredToken}`,
          },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
      });

      it('should return 401 with malformed authorization header', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: 'Basic dXNlcjpwYXNz', // Basic auth instead of Bearer
          },
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
      });

      it('should return 200 with valid JWT token', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data).toBeDefined();
        expect(body.data.profile).toBeDefined();
      });
    });

    describe('Profile Retrieval', () => {
      it('should return profile with id, email, preferences, isPowerUser, deviceApproved', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        const profile = body.data.profile;
        expect(profile.id).toBe('user_123');
        expect(profile.email).toBe('test@example.com');
        expect(profile.preferences).toBeDefined();
        expect(typeof profile.isPowerUser).toBe('boolean');
        expect(typeof profile.deviceApproved).toBe('boolean');
      });

      it('should apply default preferences when Convex is not configured', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        const preferences = body.data.profile.preferences;
        expect(preferences.theme).toBe('system');
        expect(preferences.notifications.email).toBe(true);
        expect(preferences.notifications.push).toBe(true);
        expect(preferences.notifications.inApp).toBe(true);
        expect(preferences.language).toBe('en');
        expect(preferences.timezone).toBe('UTC');
      });

      it('should return default preferences with theme=system, notifications enabled, language=en, timezone=UTC', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        const preferences = body.data.profile.preferences;
        expect(preferences).toEqual({
          theme: 'system',
          notifications: {
            email: true,
            push: true,
            inApp: true,
          },
          language: 'en',
          timezone: 'UTC',
        });
      });

      it('should reflect power user status from JWT claims', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${powerUserToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.profile.isPowerUser).toBe(true);
      });

      it('should reflect device approval status from JWT claims', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${powerUserToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.profile.deviceApproved).toBe(true);
      });

      it('should return isPowerUser=false for regular users', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.profile.isPowerUser).toBe(false);
      });

      it('should return deviceApproved=false for regular users', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.profile.deviceApproved).toBe(false);
      });

      it('should include createdAt and updatedAt timestamps', async () => {
        const response = await server.inject({
          method: 'GET',
          url: '/user/profile',
          headers: {
            authorization: `Bearer ${validToken}`,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.profile.createdAt).toBeDefined();
        expect(body.data.profile.updatedAt).toBeDefined();
        // Validate ISO date format
        expect(() => new Date(body.data.profile.createdAt)).not.toThrow();
        expect(() => new Date(body.data.profile.updatedAt)).not.toThrow();
      });
    });
  });

  describe('PUT /user/preferences', () => {
    describe('Authentication', () => {
      it('should return 401 without authentication', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ theme: 'dark' }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
      });

      it('should return 401 with invalid JWT token', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: 'Bearer invalid-jwt-token',
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ theme: 'dark' }),
        });

        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
      });

      it('should return 200 with valid JWT token and valid preferences', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ theme: 'dark' }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
        expect(body.data.preferences).toBeDefined();
      });
    });

    describe('Partial Updates', () => {
      it('should allow partial updates with only theme provided', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ theme: 'dark' }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.preferences.theme).toBe('dark');
        // Other defaults should be preserved
        expect(body.data.preferences.notifications.email).toBe(true);
        expect(body.data.preferences.language).toBe('en');
      });

      it('should allow partial updates with only notifications provided', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ notifications: { email: false } }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.preferences.notifications.email).toBe(false);
        // Other notification settings should be preserved
        expect(body.data.preferences.notifications.push).toBe(true);
        expect(body.data.preferences.notifications.inApp).toBe(true);
      });

      it('should allow partial updates with only language provided', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ language: 'es' }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.preferences.language).toBe('es');
        // Theme default should be preserved
        expect(body.data.preferences.theme).toBe('system');
      });

      it('should allow partial updates with only timezone provided', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ timezone: 'America/New_York' }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.preferences.timezone).toBe('America/New_York');
      });
    });

    describe('Full Updates', () => {
      it('should allow full updates with all fields provided', async () => {
        const fullPreferences = {
          theme: 'light',
          notifications: {
            email: false,
            push: false,
            inApp: true,
          },
          language: 'fr',
          timezone: 'Europe/Paris',
        };

        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify(fullPreferences),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.data.preferences.theme).toBe('light');
        expect(body.data.preferences.notifications.email).toBe(false);
        expect(body.data.preferences.notifications.push).toBe(false);
        expect(body.data.preferences.notifications.inApp).toBe(true);
        expect(body.data.preferences.language).toBe('fr');
        expect(body.data.preferences.timezone).toBe('Europe/Paris');
      });
    });

    describe('Validation', () => {
      it('should return 400 for invalid theme value', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ theme: 'invalid' }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should return 400 for invalid notification email setting (non-boolean)', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ notifications: { email: 'yes' } }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should return 400 for invalid language format (not 2 characters)', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ language: 'english' }),
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VALIDATION_FAILED');
      });

      it('should accept valid theme values: light, dark, system', async () => {
        for (const theme of ['light', 'dark', 'system']) {
          const response = await server.inject({
            method: 'PUT',
            url: '/user/preferences',
            headers: {
              authorization: `Bearer ${validToken}`,
              'content-type': 'application/json',
            },
            payload: JSON.stringify({ theme }),
          });

          expect(response.statusCode).toBe(200);
          const body = JSON.parse(response.body);
          expect(body.data.preferences.theme).toBe(theme);
        }
      });
    });

    describe('Response Format', () => {
      it('should return merged preferences in response', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ theme: 'dark' }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Should have all preference fields, not just the updated one
        expect(body.data.preferences).toHaveProperty('theme');
        expect(body.data.preferences).toHaveProperty('notifications');
        expect(body.data.preferences).toHaveProperty('language');
        expect(body.data.preferences).toHaveProperty('timezone');
      });

      it('should merge default preferences when only partial update provided', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({ theme: 'light' }),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Updated field
        expect(body.data.preferences.theme).toBe('light');
        // Default values preserved
        expect(body.data.preferences.notifications.email).toBe(true);
        expect(body.data.preferences.notifications.push).toBe(true);
        expect(body.data.preferences.notifications.inApp).toBe(true);
        expect(body.data.preferences.language).toBe('en');
        expect(body.data.preferences.timezone).toBe('UTC');
      });
    });

    describe('Empty Body', () => {
      it('should handle empty update object (no changes)', async () => {
        const response = await server.inject({
          method: 'PUT',
          url: '/user/preferences',
          headers: {
            authorization: `Bearer ${validToken}`,
            'content-type': 'application/json',
          },
          payload: JSON.stringify({}),
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Should return all default preferences
        expect(body.data.preferences.theme).toBe('system');
        expect(body.data.preferences.language).toBe('en');
      });
    });
  });
});
