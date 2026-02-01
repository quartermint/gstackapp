/**
 * Trust classification service
 *
 * Determines the trust level of incoming requests based on:
 * - Tailscale headers (internal network)
 * - JWT authentication tokens
 * - Default to untrusted for external requests
 */

import { FastifyRequest } from 'fastify';
import {
  TrustContext,
  TrustLevel,
  TRUST_LEVELS,
} from '@mission-control/shared';

/**
 * Tailscale headers used for internal trust verification
 */
const TAILSCALE_HEADERS = {
  /** Tailscale user login (email) */
  USER_LOGIN: 'tailscale-user-login',
  /** Tailscale user name */
  USER_NAME: 'tailscale-user-name',
  /** Tailscale node hostname */
  TAILNET_NAME: 'tailscale-tailnet-name',
  /** Custom header from Tailscale serve/funnel */
  AUTHENTICATED: 'tailscale-authenticated',
} as const;

/**
 * JWT header and claim constants
 */
const JWT_CONFIG = {
  /** Authorization header */
  AUTH_HEADER: 'authorization',
  /** Bearer token prefix */
  BEARER_PREFIX: 'Bearer ',
} as const;

/**
 * Classify the trust level of an incoming request
 *
 * Trust hierarchy (highest to lowest):
 * 1. internal - Request comes from Tailscale network (verified peer)
 * 2. authenticated - Request has valid JWT token
 * 3. untrusted - External request without authentication
 *
 * @param request - The Fastify request object
 * @returns TrustContext with classified trust level and metadata
 */
export function classifyTrust(request: FastifyRequest): TrustContext {
  const sourceIp = getSourceIp(request);

  // Check for Tailscale headers (internal trust)
  const tailscaleContext = checkTailscaleHeaders(request);
  if (tailscaleContext) {
    return {
      level: TRUST_LEVELS.INTERNAL,
      sourceIp,
      tailscaleHostname: tailscaleContext.hostname,
      userId: tailscaleContext.userLogin,
    };
  }

  // Check for JWT authentication
  const jwtContext = checkJwtAuth(request);
  if (jwtContext) {
    return {
      level: TRUST_LEVELS.AUTHENTICATED,
      sourceIp,
      userId: jwtContext.userId,
      jwtClaims: jwtContext.claims,
    };
  }

  // Default to untrusted
  return {
    level: TRUST_LEVELS.UNTRUSTED,
    sourceIp,
  };
}

/**
 * Extract source IP from request, considering proxies
 */
function getSourceIp(request: FastifyRequest): string {
  // Check X-Forwarded-For header (from proxies/load balancers)
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    return ips?.trim() || request.ip;
  }

  // Check X-Real-IP header
  const realIp = request.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp;
  }

  return request.ip;
}

/**
 * Check for Tailscale headers indicating internal trust
 */
function checkTailscaleHeaders(
  request: FastifyRequest
): { hostname?: string; userLogin?: string } | null {
  const userLogin = request.headers[TAILSCALE_HEADERS.USER_LOGIN];
  const tailnetName = request.headers[TAILSCALE_HEADERS.TAILNET_NAME];
  const authenticated = request.headers[TAILSCALE_HEADERS.AUTHENTICATED];

  // Require at least one Tailscale header to be present
  if (
    !userLogin &&
    !tailnetName &&
    authenticated !== 'true'
  ) {
    return null;
  }

  return {
    hostname: typeof tailnetName === 'string' ? tailnetName : undefined,
    userLogin: typeof userLogin === 'string' ? userLogin : undefined,
  };
}

/**
 * Check for valid JWT authentication
 * Note: This is a stub - actual JWT verification would be implemented here
 */
function checkJwtAuth(
  request: FastifyRequest
): { userId: string; claims: Record<string, unknown> } | null {
  const authHeader = request.headers[JWT_CONFIG.AUTH_HEADER];

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith(JWT_CONFIG.BEARER_PREFIX)) {
    return null;
  }

  const token = authHeader.slice(JWT_CONFIG.BEARER_PREFIX.length);

  // TODO: Implement actual JWT verification
  // For now, this is a stub that accepts any token
  // In production, this should:
  // 1. Verify token signature using JWT_SECRET
  // 2. Check token expiration
  // 3. Validate required claims

  if (!token) {
    return null;
  }

  // Stub: Parse token as base64 JSON (NOT secure - for development only)
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    if (!payload) {
      return null;
    }

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    ) as Record<string, unknown>;

    const userId = decoded['sub'];
    if (typeof userId !== 'string') {
      return null;
    }

    return {
      userId,
      claims: decoded,
    };
  } catch {
    return null;
  }
}

/**
 * Get the minimum required trust level for an operation
 */
export function getRequiredTrustLevel(
  operation: 'read' | 'write' | 'execute' | 'admin'
): TrustLevel {
  switch (operation) {
    case 'read':
      return TRUST_LEVELS.AUTHENTICATED;
    case 'write':
      return TRUST_LEVELS.AUTHENTICATED;
    case 'execute':
      return TRUST_LEVELS.INTERNAL;
    case 'admin':
      return TRUST_LEVELS.INTERNAL;
    default:
      return TRUST_LEVELS.INTERNAL;
  }
}

/**
 * Check if a trust context meets the required level
 */
export function meetsTrustRequirement(
  context: TrustContext,
  required: TrustLevel
): boolean {
  const hierarchy: Record<TrustLevel, number> = {
    [TRUST_LEVELS.UNTRUSTED]: 0,
    [TRUST_LEVELS.AUTHENTICATED]: 1,
    [TRUST_LEVELS.INTERNAL]: 2,
  };

  return hierarchy[context.level] >= hierarchy[required];
}
