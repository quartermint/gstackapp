/**
 * Auth routes - Handle authentication endpoints for token management
 *
 * Provides endpoints for:
 * - Token issuance (login)
 * - Token refresh
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HTTP_STATUS, ERROR_CODES } from '@mission-control/shared';
import { signJwt, verifyJwt, refreshToken } from '../services/trust.js';
import { logAuditEvent } from '../services/audit.js';
import { validateBody } from '../middleware/index.js';

/**
 * Request body schema for token issuance
 */
const TokenRequestSchema = z.object({
  /** User email or username */
  email: z.string().email(),
  /** User password */
  password: z.string().min(1),
  /** Device identifier for device approval tracking */
  deviceId: z.string().optional(),
});

/**
 * Request body schema for token refresh
 */
const RefreshTokenRequestSchema = z.object({
  /** Refresh token */
  refreshToken: z.string().min(1),
  /** Whether to rotate the refresh token */
  rotateRefreshToken: z.boolean().optional().default(false),
});

/**
 * Validate user credentials
 *
 * NOTE: This is a placeholder implementation. In production, this should
 * validate against a proper user database with hashed passwords.
 *
 * @param email - User email
 * @param password - User password
 * @returns User info if valid, null otherwise
 */
async function validateCredentials(
  email: string,
  _password: string
): Promise<{
  userId: string;
  email: string;
  role?: string;
  deviceApproved?: boolean;
} | null> {
  // TODO: Implement proper credential validation against user database
  // This is a placeholder that accepts any valid email format
  // In production, this should:
  // 1. Look up user by email in database
  // 2. Verify password hash
  // 3. Check account status (active, locked, etc.)
  // 4. Return user info if valid

  // For development/testing, accept credentials from environment or mock
  const mockUsers = process.env['MOCK_USERS'];
  if (mockUsers) {
    try {
      const users = JSON.parse(mockUsers) as Record<
        string,
        { password: string; role?: string; deviceApproved?: boolean }
      >;
      const user = users[email];
      if (user && user.password === _password) {
        return {
          userId: `user_${Buffer.from(email).toString('base64').slice(0, 12)}`,
          email,
          role: user.role,
          deviceApproved: user.deviceApproved,
        };
      }
    } catch {
      // Invalid MOCK_USERS format, continue to default behavior
    }
  }

  // Default: reject all credentials unless MOCK_USERS is configured
  return null;
}

/**
 * Auth routes plugin
 */
export const authRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  /**
   * POST /auth/token - Issue access and refresh tokens
   *
   * Validates user credentials and issues JWT tokens.
   * Returns access token (short-lived) and refresh token (long-lived).
   */
  server.post('/auth/token', async (request, reply) => {
    const requestId = request.id;

    // Parse and validate request body
    const bodyResult = validateBody(request.body, TokenRequestSchema, reply, requestId);
    if (!bodyResult.success) return;

    const { email, password, deviceId } = bodyResult.data;

    // Validate credentials
    const user = await validateCredentials(email, password);

    if (!user) {
      // Log failed authentication attempt
      await logAuditEvent({
        requestId,
        action: 'auth.login_failed',
        details: JSON.stringify({ email, deviceId }),
        sourceIp: request.ip,
      });

      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_INVALID_TOKEN,
          message: 'Invalid credentials',
          requestId,
        },
      });
    }

    try {
      // Build JWT payload
      const payload: Record<string, unknown> = {
        sub: user.userId,
        email: user.email,
      };

      // Add role if user has one
      if (user.role) {
        payload['role'] = user.role;
      }

      // Add device approval status if applicable
      if (user.deviceApproved !== undefined) {
        payload['deviceApproved'] = user.deviceApproved;
      }

      // Sign access token (15 minutes)
      const accessToken = await signJwt(
        payload as { sub: string; email: string },
        '15m'
      );

      // Sign refresh token (7 days)
      const refreshTokenPayload = {
        sub: user.userId,
        type: 'refresh',
      };
      const refreshTokenValue = await signJwt(
        refreshTokenPayload as { sub: string },
        '7d'
      );

      // Log successful authentication
      await logAuditEvent({
        requestId,
        action: 'auth.login_success',
        details: JSON.stringify({ email, deviceId }),
        sourceIp: request.ip,
        userId: user.userId,
      });

      return reply.send({
        success: true,
        data: {
          accessToken,
          refreshToken: refreshTokenValue,
          expiresIn: 900, // 15 minutes in seconds
          tokenType: 'Bearer',
          user: {
            id: user.userId,
            email: user.email,
            role: user.role,
          },
        },
      });
    } catch (error) {
      request.log.error({ err: error, requestId }, 'Failed to issue tokens');

      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to issue tokens',
          requestId,
        },
      });
    }
  });

  /**
   * POST /auth/refresh - Refresh access token
   *
   * Uses a refresh token to issue a new access token.
   * Optionally rotates the refresh token for enhanced security.
   */
  server.post('/auth/refresh', async (request, reply) => {
    const requestId = request.id;

    // Parse and validate request body
    const bodyResult = validateBody(request.body, RefreshTokenRequestSchema, reply, requestId);
    if (!bodyResult.success) return;

    const { refreshToken: refreshTokenValue, rotateRefreshToken: rotate } =
      bodyResult.data;

    try {
      // First verify the refresh token
      const verifyResult = await verifyJwt(refreshTokenValue);

      if (!verifyResult.valid) {
        await logAuditEvent({
          requestId,
          action: 'auth.refresh_failed',
          details: JSON.stringify({ error: verifyResult.error }),
          sourceIp: request.ip,
        });

        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: {
            code: verifyResult.code,
            message: verifyResult.error,
            requestId,
          },
        });
      }

      // Check that it's a refresh token
      const payload = verifyResult.payload as { type?: string };
      if (payload.type !== 'refresh') {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: {
            code: 'INVALID_TOKEN_TYPE',
            message: 'Token is not a refresh token',
            requestId,
          },
        });
      }

      // Use the shared refresh function
      const result = await refreshToken(refreshTokenValue, rotate);

      if (!result.success) {
        await logAuditEvent({
          requestId,
          action: 'auth.refresh_failed',
          details: JSON.stringify({ error: result.error }),
          sourceIp: request.ip,
        });

        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: {
            code: result.code || ERROR_CODES.AUTH_INVALID_TOKEN,
            message: result.error || 'Failed to refresh token',
            requestId,
          },
        });
      }

      // Log successful refresh
      await logAuditEvent({
        requestId,
        action: 'auth.refresh_success',
        details: JSON.stringify({ rotated: rotate }),
        sourceIp: request.ip,
        userId: verifyResult.payload.sub,
      });

      // Build response
      const response: Record<string, unknown> = {
        success: true,
        data: {
          accessToken: result.accessToken,
          expiresIn: 900, // 15 minutes in seconds
          tokenType: 'Bearer',
        },
      };

      // Include new refresh token if rotated
      if (rotate && result.refreshToken) {
        (response['data'] as Record<string, unknown>)['refreshToken'] =
          result.refreshToken;
      }

      return reply.send(response);
    } catch (error) {
      request.log.error({ err: error, requestId }, 'Failed to refresh token');

      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to refresh token',
          requestId,
        },
      });
    }
  });
};
