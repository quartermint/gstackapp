/**
 * JWT Token Validation
 *
 * Handles Bearer token extraction and JWT verification.
 * Note: This is a basic implementation. In production, use a proper
 * JWT library compatible with Cloudflare Workers (e.g., jose).
 */

import { ERROR_CODES, type ErrorCode } from '@mission-control/shared';

/**
 * Decoded JWT claims
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
 * Extract bearer token from Authorization header
 */
function extractBearerToken(authHeader: string): string | null {
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return null;
  }
  return parts[1] || null;
}

/**
 * Decode base64url string
 */
function base64UrlDecode(str: string): string {
  // Convert base64url to base64
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' if needed
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

/**
 * Parse JWT without verification (for extracting claims)
 * WARNING: This does NOT verify the signature
 */
function parseJwtPayload(token: string): TokenClaims | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    if (!payload) {
      return null;
    }

    const decoded = base64UrlDecode(payload);
    const claims = JSON.parse(decoded) as TokenClaims;

    // Basic structure validation
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

/**
 * Verify JWT signature using HMAC-SHA256
 * Note: This is a simplified implementation. For production,
 * consider using the 'jose' library which is Workers-compatible.
 */
async function verifyJwtSignature(
  token: string,
  secret: string
): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    const [header, payload, signature] = parts;
    if (!header || !payload || !signature) {
      return false;
    }

    // Import the secret key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify']
    );

    // Create the signature input
    const signatureInput = `${header}.${payload}`;

    // Decode the provided signature from base64url
    const providedSignature = Uint8Array.from(
      base64UrlDecode(signature),
      (c) => c.charCodeAt(0)
    );

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      providedSignature,
      encoder.encode(signatureInput)
    );

    return isValid;
  } catch {
    return false;
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
  // Extract bearer token
  const token = extractBearerToken(authHeader);
  if (!token) {
    return {
      valid: false,
      errorCode: ERROR_CODES.AUTH_MISSING_TOKEN,
      errorMessage: 'Missing or malformed Authorization header. Expected: Bearer <token>',
    };
  }

  // Parse claims (without verification first, to get expiry)
  const claims = parseJwtPayload(token);
  if (!claims) {
    return {
      valid: false,
      errorCode: ERROR_CODES.AUTH_INVALID_TOKEN,
      errorMessage: 'Invalid token format',
    };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp < now) {
    return {
      valid: false,
      errorCode: ERROR_CODES.AUTH_EXPIRED_TOKEN,
      errorMessage: 'Token has expired',
    };
  }

  // Verify signature
  const isValid = await verifyJwtSignature(token, secret);
  if (!isValid) {
    return {
      valid: false,
      errorCode: ERROR_CODES.AUTH_INVALID_TOKEN,
      errorMessage: 'Invalid token signature',
    };
  }

  return {
    valid: true,
    claims,
  };
}
