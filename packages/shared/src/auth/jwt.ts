/**
 * Shared JWT authentication module
 *
 * Provides JWT verification, signing, and refresh functionality using the jose library.
 * Designed to work in both Node.js (hub) and Cloudflare Workers (worker) environments.
 *
 * Token lifecycle:
 * - Access tokens: 15 minutes (short-lived for security)
 * - Refresh tokens: 7 days (for session continuity)
 */

import * as jose from 'jose';

/**
 * JWT configuration constants
 */
export const JWT_CONFIG = {
  /** Default access token expiration */
  ACCESS_TOKEN_EXPIRY: '15m',
  /** Refresh token expiration */
  REFRESH_TOKEN_EXPIRY: '7d',
  /** Supported signing algorithms */
  ALGORITHMS: ['HS256', 'HS384', 'HS512'] as const,
  /** Default algorithm for signing */
  DEFAULT_ALGORITHM: 'HS256' as const,
  /** Token type for access tokens */
  TOKEN_TYPE_ACCESS: 'access' as const,
  /** Token type for refresh tokens */
  TOKEN_TYPE_REFRESH: 'refresh' as const,
} as const;

/**
 * JWT payload structure for Mission Control tokens
 */
export interface JwtPayload {
  /** Subject - user or service ID */
  sub: string;
  /** Issued at timestamp (seconds since epoch) */
  iat: number;
  /** Expiration timestamp (seconds since epoch) */
  exp: number;
  /** Token type (access or refresh) */
  type?: typeof JWT_CONFIG.TOKEN_TYPE_ACCESS | typeof JWT_CONFIG.TOKEN_TYPE_REFRESH;
  /** Optional: user email */
  email?: string;
  /** Optional: user roles */
  roles?: string[];
  /** Optional: JWT ID for refresh token tracking */
  jti?: string;
  /** Optional: additional claims */
  [key: string]: unknown;
}

/**
 * Result of successful JWT verification
 */
export interface JwtVerificationSuccess {
  valid: true;
  payload: JwtPayload;
}

/**
 * JWT verification error codes
 */
export type JwtErrorCode =
  | 'INVALID_TOKEN'
  | 'EXPIRED_TOKEN'
  | 'MISSING_CLAIMS'
  | 'SIGNATURE_ERROR'
  | 'INVALID_TOKEN_TYPE';

/**
 * Result of failed JWT verification
 */
export interface JwtVerificationError {
  valid: false;
  error: string;
  code: JwtErrorCode;
}

/**
 * Union type for JWT verification result
 */
export type JwtVerificationResult = JwtVerificationSuccess | JwtVerificationError;

/**
 * Options for signing a JWT
 */
export interface SignJwtOptions {
  /** Expiration time (e.g., '15m', '1h', '7d'). Defaults based on token type */
  expiresIn?: string;
  /** Token type (access or refresh). Defaults to 'access' */
  type?: typeof JWT_CONFIG.TOKEN_TYPE_ACCESS | typeof JWT_CONFIG.TOKEN_TYPE_REFRESH;
  /** Custom JWT ID for tracking */
  jti?: string;
  /** Signing algorithm. Defaults to HS256 */
  algorithm?: (typeof JWT_CONFIG.ALGORITHMS)[number];
}

/**
 * Options for refreshing a token
 */
export interface RefreshTokenOptions {
  /** New expiration time for the access token. Defaults to 15m */
  accessTokenExpiry?: string;
  /** Whether to issue a new refresh token as well */
  rotateRefreshToken?: boolean;
}

/**
 * Result of a successful token refresh
 */
export interface RefreshTokenSuccess {
  success: true;
  accessToken: string;
  /** New refresh token if rotation was requested */
  refreshToken?: string;
  /** Expiration timestamp of the access token */
  expiresAt: number;
}

/**
 * Result of a failed token refresh
 */
export interface RefreshTokenError {
  success: false;
  error: string;
  code: JwtErrorCode;
}

/**
 * Union type for refresh token result
 */
export type RefreshTokenResult = RefreshTokenSuccess | RefreshTokenError;

/**
 * Cached secret key for JWT operations
 * Uses a Map to support multiple secrets (for key rotation)
 */
const secretKeyCache = new Map<string, Uint8Array>();

/**
 * Encode a secret string to Uint8Array for jose library
 */
function encodeSecret(secret: string): Uint8Array {
  const cached = secretKeyCache.get(secret);
  if (cached) {
    return cached;
  }
  const encoded = new TextEncoder().encode(secret);
  secretKeyCache.set(secret, encoded);
  return encoded;
}

/**
 * Generate a random JWT ID
 */
function generateJti(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify a JWT token and return the payload
 *
 * @param token - The JWT token string (without Bearer prefix)
 * @param secret - The secret key used to verify the signature
 * @param expectedType - Optional: expected token type ('access' or 'refresh')
 * @returns Verification result with payload or error details
 *
 * @example
 * ```ts
 * const result = await verifyJwt(token, process.env.JWT_SECRET!);
 * if (result.valid) {
 *   console.log('User ID:', result.payload.sub);
 * } else {
 *   console.error('Verification failed:', result.error);
 * }
 * ```
 */
export async function verifyJwt(
  token: string,
  secret: string,
  expectedType?: typeof JWT_CONFIG.TOKEN_TYPE_ACCESS | typeof JWT_CONFIG.TOKEN_TYPE_REFRESH
): Promise<JwtVerificationResult> {
  try {
    const secretKey = encodeSecret(secret);

    const { payload } = await jose.jwtVerify(token, secretKey, {
      algorithms: JWT_CONFIG.ALGORITHMS as unknown as string[],
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

    // Validate token type if specified
    if (expectedType && payload.type !== expectedType) {
      return {
        valid: false,
        error: `Invalid token type: expected ${expectedType}, got ${payload.type ?? 'undefined'}`,
        code: 'INVALID_TOKEN_TYPE',
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
 * @param secret - The secret key used to sign the token
 * @param options - Optional signing options (expiry, type, algorithm)
 * @returns The signed JWT token
 *
 * @example
 * ```ts
 * // Sign an access token (15 min expiry)
 * const accessToken = await signJwt(
 *   { sub: 'user-123', email: 'user@example.com' },
 *   process.env.JWT_SECRET!
 * );
 *
 * // Sign a refresh token (7 day expiry)
 * const refreshToken = await signJwt(
 *   { sub: 'user-123' },
 *   process.env.JWT_SECRET!,
 *   { type: 'refresh' }
 * );
 * ```
 */
export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  options: SignJwtOptions = {}
): Promise<string> {
  const secretKey = encodeSecret(secret);

  const tokenType = options.type ?? JWT_CONFIG.TOKEN_TYPE_ACCESS;
  const defaultExpiry =
    tokenType === JWT_CONFIG.TOKEN_TYPE_REFRESH
      ? JWT_CONFIG.REFRESH_TOKEN_EXPIRY
      : JWT_CONFIG.ACCESS_TOKEN_EXPIRY;

  const expiresIn = options.expiresIn ?? defaultExpiry;
  const algorithm = options.algorithm ?? JWT_CONFIG.DEFAULT_ALGORITHM;

  // Build the full payload
  const fullPayload: jose.JWTPayload = {
    ...payload,
    type: tokenType,
  };

  // Add jti for refresh tokens (useful for revocation)
  if (tokenType === JWT_CONFIG.TOKEN_TYPE_REFRESH && !options.jti) {
    fullPayload.jti = generateJti();
  } else if (options.jti) {
    fullPayload.jti = options.jti;
  }

  const token = await new jose.SignJWT(fullPayload)
    .setProtectedHeader({ alg: algorithm })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey);

  return token;
}

/**
 * Refresh an access token using a refresh token
 *
 * This function validates the refresh token and issues a new access token.
 * Optionally, it can also rotate the refresh token for added security.
 *
 * @param refreshToken - The refresh token to use
 * @param secret - The secret key used to verify and sign tokens
 * @param options - Optional refresh options
 * @returns Result with new access token (and optionally new refresh token)
 *
 * @example
 * ```ts
 * const result = await refreshToken(
 *   currentRefreshToken,
 *   process.env.JWT_SECRET!,
 *   { rotateRefreshToken: true }
 * );
 *
 * if (result.success) {
 *   // Use result.accessToken for API requests
 *   // Store result.refreshToken for future refreshes
 * }
 * ```
 */
export async function refreshToken(
  refreshTokenValue: string,
  secret: string,
  options: RefreshTokenOptions = {}
): Promise<RefreshTokenResult> {
  // Verify the refresh token
  const verifyResult = await verifyJwt(
    refreshTokenValue,
    secret,
    JWT_CONFIG.TOKEN_TYPE_REFRESH
  );

  if (!verifyResult.valid) {
    return {
      success: false,
      error: verifyResult.error,
      code: verifyResult.code,
    };
  }

  const { payload } = verifyResult;

  // Extract the base claims for the new access token
  const accessTokenPayload: Omit<JwtPayload, 'iat' | 'exp'> = {
    sub: payload.sub,
  };

  // Copy over additional claims (email, roles, etc.)
  if (payload.email) {
    accessTokenPayload.email = payload.email;
  }
  if (payload.roles) {
    accessTokenPayload.roles = payload.roles;
  }

  // Sign new access token
  const accessTokenExpiry = options.accessTokenExpiry ?? JWT_CONFIG.ACCESS_TOKEN_EXPIRY;
  const newAccessToken = await signJwt(accessTokenPayload, secret, {
    type: JWT_CONFIG.TOKEN_TYPE_ACCESS,
    expiresIn: accessTokenExpiry,
  });

  // Calculate expiration timestamp
  const expiresAt = Math.floor(Date.now() / 1000) + parseExpiryToSeconds(accessTokenExpiry);

  // Optionally rotate the refresh token
  let newRefreshToken: string | undefined;
  if (options.rotateRefreshToken) {
    newRefreshToken = await signJwt(
      {
        sub: payload.sub,
        email: payload.email,
        roles: payload.roles,
      },
      secret,
      {
        type: JWT_CONFIG.TOKEN_TYPE_REFRESH,
      }
    );
  }

  return {
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresAt,
  };
}

/**
 * Parse an expiry string (e.g., '15m', '1h', '7d') to seconds
 */
function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) {
    // Default to 15 minutes if invalid
    return 900;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 900;
  }
}

/**
 * Decode a JWT without verification (for extracting claims)
 *
 * WARNING: This does NOT verify the signature. Only use for
 * extracting claims when you need to inspect a token without
 * full verification.
 *
 * @param token - The JWT token string
 * @returns The decoded payload or null if invalid format
 */
export function decodeJwt(token: string): JwtPayload | null {
  try {
    const claims = jose.decodeJwt(token);

    // Basic validation of required claims
    if (typeof claims.sub !== 'string') {
      return null;
    }

    return claims as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Extract Bearer token from an Authorization header
 *
 * @param authHeader - The full Authorization header value
 * @returns The token string or null if not a valid Bearer token
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7); // 'Bearer '.length === 7
  return token || null;
}
