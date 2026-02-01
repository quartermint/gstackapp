/**
 * User routes - Handle user profile and preferences endpoints
 *
 * Provides endpoints for:
 * - Getting user profile
 * - Updating user preferences
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  HTTP_STATUS,
  ERROR_CODES,
  UserPreferencesUpdateRequestSchema,
  UserPreferencesSchema,
} from '@mission-control/shared';
import { classifyTrust } from '../services/trust.js';
import { api } from '../services/convex.js';
import { logAuditEvent } from '../services/audit.js';
import {
  requireAuthenticated,
  validateBody,
  isConvexConfigured,
  getConvexClient,
} from '../middleware/index.js';

/**
 * Convex user type
 */
interface ConvexUser {
  _id: string;
  _creationTime: number;
  email: string;
  name?: string;
  avatarUrl?: string;
  preferences: {
    theme: 'light' | 'dark' | 'system';
    notifications: {
      email: boolean;
      push: boolean;
      inApp: boolean;
    };
    defaultAgentProfile?: 'chat-readonly' | 'code-assistant' | 'task-orchestrator';
    language: string;
    timezone: string;
  };
  isPowerUser: boolean;
  deviceApproved: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Default user preferences
 */
const DEFAULT_PREFERENCES = {
  theme: 'system' as const,
  notifications: {
    email: true,
    push: true,
    inApp: true,
  },
  language: 'en',
  timezone: 'UTC',
};

/**
 * User routes plugin
 */
export const userRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  // Register preHandler hook for all routes in this plugin
  server.addHook('preHandler', requireAuthenticated('user'));

  /**
   * GET /user/profile - Get current user profile
   *
   * Returns the profile for the authenticated user.
   */
  server.get('/user/profile', async (request, reply) => {
    const requestId = request.id;
    const trust = classifyTrust(request);

    if (!trust.userId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_MISSING_TOKEN,
          message: 'User ID not found in token',
          requestId,
        },
      });
    }

    if (!isConvexConfigured()) {
      // Return profile from JWT claims when Convex is not configured
      const jwtClaims = trust.jwtClaims || {};

      return reply.send({
        success: true,
        data: {
          profile: {
            id: trust.userId,
            email: (jwtClaims['email'] as string) || 'unknown@example.com',
            name: jwtClaims['name'] as string | undefined,
            preferences: DEFAULT_PREFERENCES,
            isPowerUser: jwtClaims['role'] === 'power-user',
            deviceApproved: (jwtClaims['deviceApproved'] as boolean) || false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });
    }

    try {
      const client = getConvexClient();

      // Fetch user from database
      const user = (await client.query(api.users.get, {
        id: trust.userId,
      })) as ConvexUser | null;

      if (!user) {
        // User not found in database, create from JWT claims
        const jwtClaims = trust.jwtClaims || {};
        const email = (jwtClaims['email'] as string) || 'unknown@example.com';

        // Upsert user record
        await client.mutation(api.users.upsert, {
          id: trust.userId,
          email,
          name: jwtClaims['name'] as string | undefined,
          preferences: DEFAULT_PREFERENCES,
          isPowerUser: jwtClaims['role'] === 'power-user',
          deviceApproved: (jwtClaims['deviceApproved'] as boolean) || false,
        });

        // Fetch the newly created user
        const newUser = (await client.query(api.users.get, {
          id: trust.userId,
        })) as ConvexUser;

        return reply.send({
          success: true,
          data: {
            profile: {
              id: newUser._id,
              email: newUser.email,
              name: newUser.name,
              avatarUrl: newUser.avatarUrl,
              preferences: newUser.preferences,
              isPowerUser: newUser.isPowerUser,
              deviceApproved: newUser.deviceApproved,
              createdAt: new Date(newUser.createdAt).toISOString(),
              updatedAt: new Date(newUser.updatedAt).toISOString(),
            },
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          profile: {
            id: user._id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            preferences: user.preferences,
            isPowerUser: user.isPowerUser,
            deviceApproved: user.deviceApproved,
            createdAt: new Date(user.createdAt).toISOString(),
            updatedAt: new Date(user.updatedAt).toISOString(),
          },
        },
      });
    } catch (error) {
      request.log.error({ error, requestId }, 'Failed to get user profile');

      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to get user profile',
          requestId,
        },
      });
    }
  });

  /**
   * PUT /user/preferences - Update user preferences
   *
   * Updates preferences for the authenticated user.
   * Supports partial updates - only provided fields are updated.
   */
  server.put('/user/preferences', async (request, reply) => {
    const requestId = request.id;
    const trust = classifyTrust(request);

    if (!trust.userId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: ERROR_CODES.AUTH_MISSING_TOKEN,
          message: 'User ID not found in token',
          requestId,
        },
      });
    }

    // Parse request body
    const bodyResult = validateBody(request.body, UserPreferencesUpdateRequestSchema, reply, requestId);
    if (!bodyResult.success) return;

    const updates = bodyResult.data;

    if (!isConvexConfigured()) {
      // Without Convex, we can't persist preferences
      // Return the updates as if they were applied
      const preferences = {
        ...DEFAULT_PREFERENCES,
        ...updates,
        notifications: {
          ...DEFAULT_PREFERENCES.notifications,
          ...(updates.notifications || {}),
        },
      };

      // Validate merged preferences
      const validationResult = UserPreferencesSchema.safeParse(preferences);
      if (!validationResult.success) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_FAILED,
            message: 'Invalid preferences',
            details: validationResult.error.errors,
            requestId,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          preferences: validationResult.data,
        },
      });
    }

    try {
      const client = getConvexClient();

      // Fetch current user to get existing preferences
      let user = (await client.query(api.users.get, {
        id: trust.userId,
      })) as ConvexUser | null;

      // If user doesn't exist, create them first
      if (!user) {
        const jwtClaims = trust.jwtClaims || {};
        const email = (jwtClaims['email'] as string) || 'unknown@example.com';

        await client.mutation(api.users.upsert, {
          id: trust.userId,
          email,
          preferences: DEFAULT_PREFERENCES,
          isPowerUser: jwtClaims['role'] === 'power-user',
          deviceApproved: (jwtClaims['deviceApproved'] as boolean) || false,
        });

        user = (await client.query(api.users.get, {
          id: trust.userId,
        })) as ConvexUser;
      }

      // Merge preferences
      const currentPreferences = user.preferences || DEFAULT_PREFERENCES;
      const mergedPreferences = {
        theme: updates.theme || currentPreferences.theme,
        notifications: {
          email:
            updates.notifications?.email !== undefined
              ? updates.notifications.email
              : currentPreferences.notifications.email,
          push:
            updates.notifications?.push !== undefined
              ? updates.notifications.push
              : currentPreferences.notifications.push,
          inApp:
            updates.notifications?.inApp !== undefined
              ? updates.notifications.inApp
              : currentPreferences.notifications.inApp,
        },
        defaultAgentProfile:
          updates.defaultAgentProfile !== undefined
            ? updates.defaultAgentProfile
            : currentPreferences.defaultAgentProfile,
        language: updates.language || currentPreferences.language,
        timezone: updates.timezone || currentPreferences.timezone,
      };

      // Validate merged preferences
      const validationResult = UserPreferencesSchema.safeParse(mergedPreferences);
      if (!validationResult.success) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_FAILED,
            message: 'Invalid preferences',
            details: validationResult.error.errors,
            requestId,
          },
        });
      }

      // Update preferences in database
      await client.mutation(api.users.updatePreferences, {
        id: trust.userId,
        preferences: validationResult.data,
      });

      await logAuditEvent({
        requestId,
        action: 'user.preferences_updated',
        details: JSON.stringify({
          updatedFields: Object.keys(updates),
        }),
        sourceIp: trust.sourceIp,
        userId: trust.userId,
      });

      return reply.send({
        success: true,
        data: {
          preferences: validationResult.data,
        },
      });
    } catch (error) {
      request.log.error({ error, requestId }, 'Failed to update user preferences');

      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to update user preferences',
          requestId,
        },
      });
    }
  });
};
