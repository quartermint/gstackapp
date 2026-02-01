/**
 * Authentication schemas
 *
 * Zod schemas for auth-related types including API keys,
 * refresh tokens, and JWT claims validation.
 */

import { z } from 'zod';

/**
 * API key prefix for identifying Mission Control API keys
 */
export const API_KEY_PREFIX = 'mc_';

/**
 * API key schema
 * Format: mc_{environment}_{random-32-chars}
 * Example: mc_prod_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 */
export const ApiKeySchema = z.object({
  /** Unique identifier for the API key */
  id: z.string().uuid(),
  /** The hashed API key (never store raw keys) */
  keyHash: z.string().min(64), // SHA-256 hash
  /** Key prefix for identification (first 8 chars of the key) */
  keyPrefix: z.string().length(11), // 'mc_prod_' + 3 chars
  /** Display name for the key */
  name: z.string().min(1).max(100),
  /** Service or user that owns this key */
  ownerId: z.string().min(1),
  /** Owner type */
  ownerType: z.enum(['service', 'user']),
  /** Scopes/permissions granted to this key */
  scopes: z.array(z.string()).default([]),
  /** Environment the key is valid for */
  environment: z.enum(['development', 'staging', 'production']),
  /** Whether the key is currently active */
  active: z.boolean().default(true),
  /** Optional expiration timestamp (epoch seconds) */
  expiresAt: z.number().optional(),
  /** Last used timestamp (epoch seconds) */
  lastUsedAt: z.number().optional(),
  /** Created timestamp (epoch seconds) */
  createdAt: z.number(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

/**
 * API key creation input schema
 */
export const CreateApiKeyInputSchema = z.object({
  /** Display name for the key */
  name: z.string().min(1).max(100),
  /** Service or user that owns this key */
  ownerId: z.string().min(1),
  /** Owner type */
  ownerType: z.enum(['service', 'user']),
  /** Scopes/permissions to grant */
  scopes: z.array(z.string()).optional(),
  /** Environment the key is valid for */
  environment: z.enum(['development', 'staging', 'production']).optional(),
  /** Optional expiration in seconds from now */
  expiresInSeconds: z.number().positive().optional(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;

/**
 * API key validation result schema
 */
export const ApiKeyValidationResultSchema = z.discriminatedUnion('valid', [
  z.object({
    valid: z.literal(true),
    keyId: z.string().uuid(),
    ownerId: z.string(),
    ownerType: z.enum(['service', 'user']),
    scopes: z.array(z.string()),
    environment: z.enum(['development', 'staging', 'production']),
  }),
  z.object({
    valid: z.literal(false),
    error: z.string(),
    code: z.enum([
      'INVALID_FORMAT',
      'KEY_NOT_FOUND',
      'KEY_EXPIRED',
      'KEY_INACTIVE',
      'ENVIRONMENT_MISMATCH',
    ]),
  }),
]);

export type ApiKeyValidationResult = z.infer<typeof ApiKeyValidationResultSchema>;

/**
 * Refresh token record schema (for storage)
 */
export const RefreshTokenRecordSchema = z.object({
  /** Unique identifier (jti claim from token) */
  id: z.string().min(1),
  /** User or service ID this token belongs to */
  subjectId: z.string().min(1),
  /** Token family (for rotation tracking) */
  family: z.string().optional(),
  /** Whether the token has been revoked */
  revoked: z.boolean().default(false),
  /** Expiration timestamp (epoch seconds) */
  expiresAt: z.number(),
  /** Created timestamp (epoch seconds) */
  createdAt: z.number(),
  /** IP address that created this token */
  createdFromIp: z.string().optional(),
  /** User agent that created this token */
  createdFromUserAgent: z.string().optional(),
});

export type RefreshTokenRecord = z.infer<typeof RefreshTokenRecordSchema>;

/**
 * JWT claims schema for validation
 */
export const JwtClaimsSchema = z.object({
  /** Subject - user or service ID */
  sub: z.string().min(1),
  /** Issued at timestamp */
  iat: z.number(),
  /** Expiration timestamp */
  exp: z.number(),
  /** Token type */
  type: z.enum(['access', 'refresh']).optional(),
  /** JWT ID (unique identifier) */
  jti: z.string().optional(),
  /** User email */
  email: z.string().email().optional(),
  /** User roles */
  roles: z.array(z.string()).optional(),
});

export type JwtClaims = z.infer<typeof JwtClaimsSchema>;

/**
 * Token refresh request schema
 */
export const TokenRefreshRequestSchema = z.object({
  /** The refresh token */
  refreshToken: z.string().min(1),
  /** Whether to rotate the refresh token */
  rotateRefreshToken: z.boolean().optional(),
});

export type TokenRefreshRequest = z.infer<typeof TokenRefreshRequestSchema>;

/**
 * Token refresh response schema
 */
export const TokenRefreshResponseSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number(),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
    code: z.enum([
      'INVALID_TOKEN',
      'EXPIRED_TOKEN',
      'MISSING_CLAIMS',
      'SIGNATURE_ERROR',
      'INVALID_TOKEN_TYPE',
      'TOKEN_REVOKED',
    ]),
  }),
]);

export type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>;

/**
 * Service authentication header schema
 * Supports both Bearer tokens and API keys
 */
export const AuthHeaderSchema = z.string().refine(
  (value) => {
    return value.startsWith('Bearer ') || value.startsWith('ApiKey ');
  },
  { message: 'Authorization header must start with "Bearer " or "ApiKey "' }
);

/**
 * Parse authorization header to determine auth type
 */
export function parseAuthHeader(
  header: string
): { type: 'bearer'; token: string } | { type: 'apikey'; key: string } | null {
  if (header.startsWith('Bearer ')) {
    const token = header.slice(7);
    return token ? { type: 'bearer', token } : null;
  }

  if (header.startsWith('ApiKey ')) {
    const key = header.slice(7);
    return key ? { type: 'apikey', key } : null;
  }

  return null;
}
