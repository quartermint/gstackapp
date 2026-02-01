/**
 * JWT Token Validation
 *
 * Handles Bearer token extraction and JWT verification.
 * Uses the shared JWT module from @mission-control/shared for
 * secure token verification using the jose library.
 */

import {
  ERROR_CODES,
  type ErrorCode,
  verifyJwt,
  extractBearerToken,
} from '@mission-control/shared';

/**
 * Decoded JWT claims
 * Re-export for backward compatibility
 */
export interface TokenClaims {
  /** Subject (user ID) */
  sub: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** Optional: user email */
  email?: string;
  /** Optional: user roles */
  roles?: string[];
}

/**
 * Token validation result - success case
 */
interface TokenValidSuccess {
  valid: true;
  claims: TokenClaims;
}

/**
 * Token validation result - failure case
 */
interface TokenValidFailure {
  valid: false;
  errorCode: ErrorCode;
  errorMessage: string;
}

export type TokenValidationResult = TokenValidSuccess | TokenValidFailure;

/**
 * Map JWT error codes to application error codes
 */
function mapJwtErrorCode(
  code: string
): ErrorCode {
  switch (code) {
    case 'EXPIRED_TOKEN':
      return ERROR_CODES.AUTH_EXPIRED_TOKEN;
    case 'MISSING_CLAIMS':
    case 'INVALID_TOKEN':
    case 'SIGNATURE_ERROR':
    case 'INVALID_TOKEN_TYPE':
    default:
      return ERROR_CODES.AUTH_INVALID_TOKEN;
  }
}

/**
 * Validate a JWT token from the Authorization header
 *
 * @param authHeader - The full Authorization header value
 * @param secret - The JWT signing secret
 * @returns Validation result with claims or error details
 */
export async function validateToken(
  authHeader: string,
  secret: string
): Promise<TokenValidationResult> {
  // Extract bearer token using shared utility
  const token = extractBearerToken(authHeader);
  if (!token) {
    return {
      valid: false,
      errorCode: ERROR_CODES.AUTH_MISSING_TOKEN,
      errorMessage: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    };
  }

  // Verify token using shared JWT module
  const result = await verifyJwt(token, secret);

  if (!result.valid) {
    return {
      valid: false,
      errorCode: mapJwtErrorCode(result.code),
      errorMessage: result.error,
    };
  }

  // Map JwtPayload to TokenClaims for backward compatibility
  const claims: TokenClaims = {
    sub: result.payload.sub,
    iat: result.payload.iat,
    exp: result.payload.exp,
    email: result.payload.email,
    roles: result.payload.roles,
  };

  return {
    valid: true,
    claims,
  };
}

/**
 * Extract user ID from a valid token (for rate limiting)
 * Returns null if token is invalid or missing
 */
export async function extractUserId(
  authHeader: string | undefined,
  secret: string
): Promise<string | null> {
  if (!authHeader) {
    return null;
  }

  const result = await validateToken(authHeader, secret);
  if (!result.valid) {
    return null;
  }

  return result.claims.sub;
}
