/**
 * Convex middleware
 *
 * Provides utilities for handling Convex availability checks.
 */

import { FastifyReply } from 'fastify';
import { HTTP_STATUS, ERROR_CODES } from '@mission-control/shared';
import { isConvexConfigured, getConvexClient } from '../services/convex.js';

/**
 * Check if Convex is configured and send error response if not
 *
 * Use this at the start of route handlers that require Convex.
 *
 * @example
 * ```typescript
 * if (!requireConvex(reply, requestId, 'Conversation storage')) return;
 * const client = getConvexClient();
 * ```
 *
 * @param reply - Fastify reply object
 * @param requestId - Request ID for error response
 * @param featureName - Name of the feature requiring Convex (for error message)
 * @returns true if Convex is configured, false after sending error response
 */
export function requireConvex(
  reply: FastifyReply,
  requestId: string,
  featureName: string = 'This feature'
): boolean {
  if (!isConvexConfigured()) {
    reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: `${featureName} not configured`,
        requestId,
      },
    });
    return false;
  }
  return true;
}

/**
 * Get Convex client with availability check
 *
 * Combines the availability check with getting the client.
 * Returns null and sends error response if Convex is not configured.
 *
 * @example
 * ```typescript
 * const client = getConvexOrReply(reply, requestId, 'Task storage');
 * if (!client) return;
 * await client.query(...);
 * ```
 *
 * @param reply - Fastify reply object
 * @param requestId - Request ID for error response
 * @param featureName - Name of the feature requiring Convex
 * @returns Convex client if configured, null after sending error response
 */
export function getConvexOrReply(
  reply: FastifyReply,
  requestId: string,
  featureName: string = 'This feature'
): ReturnType<typeof getConvexClient> | null {
  if (!requireConvex(reply, requestId, featureName)) {
    return null;
  }
  return getConvexClient();
}

// Re-export commonly used Convex utilities for convenience
export { isConvexConfigured, getConvexClient };
