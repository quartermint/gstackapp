/**
 * Authentication middleware
 *
 * Provides Fastify preHandler hooks for trust level enforcement.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  HTTP_STATUS,
  ERROR_CODES,
  TRUST_LEVELS,
  meetsTrustLevel,
  type TrustLevel,
} from '@mission-control/shared';
import { classifyTrust, classifyTrustAsync } from '../services/trust.js';
import { logAuditEvent } from '../services/audit.js';

/**
 * Options for trust level requirement
 */
interface TrustLevelOptions {
  /** The action name for audit logging */
  auditAction?: string;
  /** Custom error message */
  errorMessage?: string;
  /** Use async trust classification (verifies JWT signature) */
  verifySignature?: boolean;
}

/**
 * Create a preHandler hook that requires a minimum trust level
 *
 * @param requiredLevel - Minimum trust level required
 * @param options - Configuration options
 * @returns Fastify preHandler hook
 */
export function requireTrustLevel(
  requiredLevel: TrustLevel,
  options: TrustLevelOptions = {}
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const {
    auditAction = 'access_denied',
    errorMessage = `This endpoint requires ${requiredLevel} trust level`,
    verifySignature = false,
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const trust = verifySignature
      ? await classifyTrustAsync(request)
      : classifyTrust(request);

    if (!meetsTrustLevel(trust.level, requiredLevel)) {
      await logAuditEvent({
        requestId: request.id,
        action: auditAction,
        details: JSON.stringify({
          trustLevel: trust.level,
          requiredLevel,
          path: request.url,
        }),
        sourceIp: trust.sourceIp,
        userId: trust.userId,
      });

      // Use appropriate status code based on whether user is authenticated
      const statusCode =
        trust.level === TRUST_LEVELS.UNTRUSTED
          ? HTTP_STATUS.UNAUTHORIZED
          : HTTP_STATUS.FORBIDDEN;

      const errorCode =
        trust.level === TRUST_LEVELS.UNTRUSTED
          ? ERROR_CODES.AUTH_MISSING_TOKEN
          : ERROR_CODES.INSUFFICIENT_TRUST;

      reply.status(statusCode).send({
        success: false,
        error: {
          code: errorCode,
          message: errorMessage,
          requestId: request.id,
        },
      });
    }
  };
}

/**
 * Require authenticated trust level (AUTHENTICATED or higher)
 *
 * Convenience wrapper for common authentication check.
 *
 * @param auditPrefix - Prefix for audit action (e.g., 'conversations', 'user')
 * @returns Fastify preHandler hook
 */
export function requireAuthenticated(
  auditPrefix: string
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return requireTrustLevel(TRUST_LEVELS.AUTHENTICATED, {
    auditAction: `${auditPrefix}.access_denied`,
    errorMessage: 'Authentication required to access this endpoint',
  });
}

/**
 * Require internal trust level (Tailscale peer only)
 *
 * Always returns 403 Forbidden for non-internal requests, regardless of
 * whether they are authenticated. This is for endpoints that are only
 * accessible from the internal network.
 *
 * @param auditPrefix - Prefix for audit action (e.g., 'admin')
 * @returns Fastify preHandler hook
 */
export function requireInternal(
  auditPrefix: string
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const trust = classifyTrust(request);

    if (trust.level !== TRUST_LEVELS.INTERNAL) {
      await logAuditEvent({
        requestId: request.id,
        action: `${auditPrefix}.access_denied`,
        details: JSON.stringify({
          trustLevel: trust.level,
          requiredLevel: TRUST_LEVELS.INTERNAL,
          path: request.url,
        }),
        sourceIp: trust.sourceIp,
        userId: trust.userId,
      });

      reply.status(HTTP_STATUS.FORBIDDEN).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin endpoints require internal trust level',
          requestId: request.id,
        },
      });
    }
  };
}

/**
 * Require power user or higher trust level
 *
 * @param auditPrefix - Prefix for audit action
 * @returns Fastify preHandler hook
 */
export function requirePowerUser(
  auditPrefix: string
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return requireTrustLevel(TRUST_LEVELS.POWER_USER, {
    auditAction: `${auditPrefix}.access_denied`,
    errorMessage: 'This endpoint requires power user privileges',
  });
}
