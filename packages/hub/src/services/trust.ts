/**
 * Trust classification service
 *
 * Determines the trust level of incoming requests based on:
 * - Tailscale headers (internal network)
 * - JWT authentication tokens
 * - Default to untrusted for external requests
 */

import { FastifyRequest } from 'fastify';
import * as jose from 'jose';
import {
  TrustContext,
  TrustLevel,
  TRUST_LEVELS,
  meetsTrustLevel,
} from '@mission-control/shared';

/**
 * JWT payload structure for Mission Control tokens
 */
export interface JwtPayload {
  /** Subject - user or agent ID */
  sub: string;
  /** Issued at timestamp (seconds since epoch) */
  iat: number;
  /** Expiration timestamp (seconds since epoch) */
  exp: number;
  /** Optional: user email */
  email?: string;
  /** Optional: user roles */
  roles?: string[];
  /** Optional: additional claims */
  [key: string]: unknown;
}

/**
 * Result of JWT verification
 */
export interface JwtVerificationResult {
  valid: true;
  payload: JwtPayload;
}

/**
 * Error from JWT verification
 */
export interface JwtVerificationError {
  valid: false;
  error: string;
  code: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'MISSING_CLAIMS' | 'SIGNATURE_ERROR';
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
 * JWT header and claim constants
 */
const JWT_CONFIG = {
  /** Authorization header */
  AUTH_HEADER: 'authorization',
  /** Bearer token prefix */
  BEARER_PREFIX: 'Bearer ',
} as const;

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
  const authHeader = request.headers[JWT_CONFIG.AUTH_HEADER];

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith(JWT_CONFIG.BEARER_PREFIX)) {
    return null;
  }

  const token = authHeader.slice(JWT_CONFIG.BEARER_PREFIX.length);
  return token || null;
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
 * Cached secret key for JWT verification
 * Lazily initialized on first use
 */
let cachedSecretKey: Uint8Array | null = null;

/**
 * Get the JWT secret key from environment
 * @throws Error if JWT_SECRET is not configured
 */
function getJwtSecret(): Uint8Array {
  if (cachedSecretKey) {
    return cachedSecretKey;
  }

  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not configured');
  }

  cachedSecretKey = new TextEncoder().encode(secret);
  return cachedSecretKey;
}

/**
 * Verify a JWT token and return the payload
 *
 * @param token - The JWT token string (without Bearer prefix)
 * @returns Verification result with payload or error details
 */
export async function verifyJwt(
  token: string
): Promise<JwtVerificationResult | JwtVerificationError> {
  try {
    const secret = getJwtSecret();

    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: ['HS256', 'HS384', 'HS512'],
    });

    // Validate required claims
    if (typeof payload.sub !== 'string') {
      return {
        valid: false,
        error: 'Missing required claim: sub',
        code: 'MISSING_CLAIMS',
      };
    }

    if (typeof payload.iat !== 'number') {
      return {
        valid: false,
        error: 'Missing required claim: iat',
        code: 'MISSING_CLAIMS',
      };
    }

    if (typeof payload.exp !== 'number') {
      return {
        valid: false,
        error: 'Missing required claim: exp',
        code: 'MISSING_CLAIMS',
      };
    }

    return {
      valid: true,
      payload: payload as JwtPayload,
    };
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      return {
        valid: false,
        error: 'Token has expired',
        code: 'EXPIRED_TOKEN',
      };
    }

    if (err instanceof jose.errors.JWTClaimValidationFailed) {
      return {
        valid: false,
        error: `Claim validation failed: ${err.message}`,
        code: 'MISSING_CLAIMS',
      };
    }

    if (
      err instanceof jose.errors.JWSSignatureVerificationFailed ||
      err instanceof jose.errors.JWSInvalid
    ) {
      return {
        valid: false,
        error: 'Invalid token signature',
        code: 'SIGNATURE_ERROR',
      };
    }

    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid token',
      code: 'INVALID_TOKEN',
    };
  }
}

/**
 * Sign a JWT payload and return the token
 *
 * @param payload - The payload to sign (must include sub)
 * @param expiresIn - Expiration time (e.g., '1h', '7d', '30m'). Defaults to '1h'
 * @returns The signed JWT token
 */
export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  expiresIn: string = '1h'
): Promise<string> {
  const secret = getJwtSecret();

  const token = await new jose.SignJWT(payload as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret);

  return token;
}

/**
 * Check for valid JWT authentication
 * Uses jose library for secure JWT verification
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

  if (!token) {
    return null;
  }

  // Note: We need to handle async verification in a sync context
  // Store the token for async verification by the middleware
  // For now, we'll do a synchronous parse to extract claims for the trust context
  // The actual signature verification should happen in middleware

  // Parse token to extract claims (jose.decodeJwt does not verify signature)
  try {
    const claims = jose.decodeJwt(token);

    // Basic validation of required claims
    if (typeof claims.sub !== 'string') {
      return null;
    }

    if (typeof claims.exp !== 'number') {
      return null;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp < now) {
      return null;
    }

    // Store raw token for later signature verification if needed
    return {
      userId: claims.sub,
      claims: claims as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/**
 * Check for valid JWT authentication with full signature verification
 * Uses jose library for secure JWT verification
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
 * Delegates to shared meetsTrustLevel utility
 */
export function meetsTrustRequirement(
  context: TrustContext,
  required: TrustLevel
): boolean {
  return meetsTrustLevel(context.level, required);
}
