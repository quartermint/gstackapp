/**
 * Trust classification service
 *
 * Determines the trust level of incoming requests based on:
 * - Tailscale headers (internal network)
 * - JWT authentication tokens
 * - Default to untrusted for external requests
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  TrustContext,
  TRUST_LEVELS,
  verifyJwt as sharedVerifyJwt,
  signJwt as sharedSignJwt,
  refreshToken as sharedRefreshToken,
  decodeJwt,
  extractBearerToken,
  type JwtPayload,
  type RefreshTokenResult,
  JWT_CONFIG,
} from '@mission-control/shared';

/**
 * Re-export types for backward compatibility
 */
export type { JwtPayload };

/**
 * Result of JWT verification (re-export for backward compatibility)
 */
export interface JwtVerificationSuccess {
  valid: true;
  payload: JwtPayload;
}

/**
 * Error from JWT verification
 */
export interface JwtVerificationError {
  valid: false;
  error: string;
  code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_CLAIMS' | 'SIGNATURE_ERROR' | 'INVALID_TOKEN_TYPE';
}

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
 * JWT header constants
 */
const AUTH_HEADER = 'authorization';

/**
 * Get the JWT secret from environment
 * @throws Error if JWT_SECRET is not configured
 */
function getJwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }
  return secret;
}

/**
 * Classify the trust level of an incoming request (synchronous version)
 *
 * Trust hierarchy (highest to lowest):
 * 1. internal - Request comes from Tailscale network (verified peer)
 * 2. authenticated - Request has valid JWT token
 * 3. untrusted - External request without authentication
 *
 * Note: This synchronous version only decodes JWT claims without verifying
 * the signature. For full security, use classifyTrustAsync which verifies
 * the JWT signature.
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
 * Classify the trust level of an incoming request with full JWT verification
 *
 * This async version verifies JWT signatures for authenticated requests.
 * Use this in middleware or routes where security is critical.
 *
 * Trust hierarchy (highest to lowest):
 * 1. internal - Request comes from Tailscale network (verified peer)
 * 2. authenticated - Request has valid JWT token (signature verified)
 * 3. untrusted - External request without authentication
 *
 * @param request - The Fastify request object
 * @returns TrustContext with classified trust level and metadata
 */
export async function classifyTrustAsync(request: FastifyRequest): Promise<TrustContext> {
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

  // Check for JWT authentication with full verification
  const jwtContext = await checkJwtAuthAsync(request);
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
 * Extract the raw JWT token from a request's Authorization header
 *
 * @param request - The Fastify request object
 * @returns The JWT token string or null if not present
 */
export function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers[AUTH_HEADER];

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  return extractBearerToken(authHeader);
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
 * Verify a JWT token and return the payload
 *
 * Uses the shared JWT module for verification.
 *
 * @param token - The JWT token string (without Bearer prefix)
 * @returns Verification result with payload or error details
 */
export async function verifyJwt(
  token: string
): Promise<JwtVerificationSuccess | JwtVerificationError> {
  const secret = getJwtSecret();
  const result = await sharedVerifyJwt(token, secret);

  if (result.valid) {
    return {
      valid: true,
      payload: result.payload,
    };
  }

  return {
    valid: false,
    error: result.error,
    code: result.code,
  };
}

/**
 * Sign a JWT payload and return the token
 *
 * Uses the shared JWT module for signing.
 * Defaults to 15 minute expiry for access tokens.
 *
 * @param payload - The payload to sign (must include sub)
 * @param expiresIn - Expiration time (e.g., '15m', '1h', '7d'). Defaults to '15m'
 * @returns The signed JWT token
 */
export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresIn: string = JWT_CONFIG.ACCESS_TOKEN_EXPIRY
): Promise<string> {
  const secret = getJwtSecret();
  return sharedSignJwt(payload, secret, { expiresIn });
}

/**
 * Refresh an access token using a refresh token
 *
 * Uses the shared JWT module for token refresh.
 *
 * @param refreshTokenValue - The refresh token
 * @param rotateRefreshToken - Whether to issue a new refresh token
 * @returns New access token (and optionally new refresh token)
 */
export async function refreshToken(
  refreshTokenValue: string,
  rotateRefreshToken: boolean = false
): Promise<RefreshTokenResult> {
  const secret = getJwtSecret();
  return sharedRefreshToken(refreshTokenValue, secret, { rotateRefreshToken });
}

/**
 * Handle token refresh request
 *
 * This is a route handler helper for the /auth/refresh endpoint.
 *
 * @param request - The Fastify request with refreshToken in body
 * @param reply - The Fastify reply
 */
export async function handleTokenRefresh(
  request: FastifyRequest<{ Body: { refreshToken: string; rotateRefreshToken?: boolean } }>,
  reply: FastifyReply
): Promise<void> {
  const { refreshToken: refreshTokenValue, rotateRefreshToken: rotate } = request.body;

  if (!refreshTokenValue) {
    reply.status(400).send({
      success: false,
      error: 'Missing refreshToken in request body',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  const result = await refreshToken(refreshTokenValue, rotate);

  if (!result.success) {
    reply.status(401).send(result);
    return;
  }

  reply.send(result);
}

/**
 * Check for valid JWT authentication
 * Uses jose decodeJwt for synchronous parsing (does not verify signature)
 */
function checkJwtAuth(
  request: FastifyRequest
): { userId: string; claims: Record<string, unknown> } | null {
  const token = extractToken(request);

  if (!token) {
    return null;
  }

  // Parse token to extract claims (decodeJwt does not verify signature)
  const claims = decodeJwt(token);

  if (!claims) {
    return null;
  }

  // Check expiration
  if (typeof claims.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp < now) {
      return null;
    }
  }

  return {
    userId: claims.sub,
    claims: claims as Record<string, unknown>,
  };
}

/**
 * Check for valid JWT authentication with full signature verification
 * Uses the shared JWT module for verification
 */
async function checkJwtAuthAsync(
  request: FastifyRequest
): Promise<{ userId: string; claims: Record<string, unknown> } | null> {
  const token = extractToken(request);

  if (!token) {
    return null;
  }

  const result = await verifyJwt(token);

  if (!result.valid) {
    return null;
  }

  return {
    userId: result.payload.sub,
    claims: result.payload as Record<string, unknown>,
  };
}
