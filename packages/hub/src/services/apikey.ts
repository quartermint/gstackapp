/**
 * API Key Management Service
 *
 * Provides secure API key generation, validation, and management
 * for service-to-service authentication within Mission Control.
 *
 * Key format: mc_{environment}_{32-char-random}
 * Example: mc_prod_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
 *
 * Security features:
 * - Keys are hashed using SHA-256 before storage
 * - Only key prefix is stored for identification
 * - Support for key rotation with grace period
 * - Environment-scoped keys (dev/staging/prod)
 *
 * Persistence:
 * - In-memory cache for fast validation
 * - Convex backend for persistence (when configured)
 * - Auto-sync on startup and periodic refresh
 */

import { randomUUID, createHash, randomBytes } from 'crypto';
import {
  API_KEY_PREFIX,
  type ApiKey,
  type CreateApiKeyInput,
  type ApiKeyValidationResult,
} from '@mission-control/shared';
import { getConvexClient, isConvexConfigured } from './convex.js';
import { FunctionReference, anyApi } from 'convex/server';

/**
 * Convex API key functions type definition
 */
const apiKeysApi = anyApi as unknown as {
  apiKeys: {
    create: FunctionReference<
      'mutation',
      'public',
      {
        id: string;
        keyHash: string;
        keyPrefix: string;
        name: string;
        ownerId: string;
        ownerType: 'service' | 'user';
        scopes: string[];
        environment: 'development' | 'staging' | 'production';
        active: boolean;
        expiresAt?: number;
        metadata?: unknown;
      },
      string
    >;
    getByHash: FunctionReference<
      'query',
      'public',
      { keyHash: string },
      ApiKeyConvexRecord | null
    >;
    getById: FunctionReference<
      'query',
      'public',
      { keyId: string },
      ApiKeyConvexRecord | null
    >;
    listByOwner: FunctionReference<
      'query',
      'public',
      { ownerId: string; limit?: number },
      ApiKeyConvexRecord[]
    >;
    updateLastUsed: FunctionReference<
      'mutation',
      'public',
      { keyId: string },
      string
    >;
    revoke: FunctionReference<'mutation', 'public', { keyId: string }, boolean>;
    deleteKey: FunctionReference<
      'mutation',
      'public',
      { keyId: string },
      boolean
    >;
    updateExpiration: FunctionReference<
      'mutation',
      'public',
      { keyId: string; expiresAt: number },
      string
    >;
    listActive: FunctionReference<
      'query',
      'public',
      { limit?: number },
      ApiKeyConvexRecord[]
    >;
  };
};

/**
 * Convex API key record structure
 */
interface ApiKeyConvexRecord {
  _id: string;
  keyId: string;
  keyHash: string;
  keyPrefix: string;
  name: string;
  ownerId: string;
  ownerType: 'service' | 'user';
  scopes: string[];
  environment: 'development' | 'staging' | 'production';
  active: boolean;
  expiresAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  metadata?: unknown;
}

/**
 * In-memory store for API keys (cache)
 * Backed by Convex for persistence when configured
 */
const apiKeyStore = new Map<string, ApiKey>();

/**
 * Index of key hashes to key IDs for fast lookup
 */
const keyHashIndex = new Map<string, string>();

/**
 * Track if cache has been initialized from Convex
 */
let cacheInitialized = false;

/**
 * Default environment for API keys
 */
const DEFAULT_ENVIRONMENT = 'development' as const;

/**
 * Generate a cryptographically secure random string
 *
 * @param length - Length of the string to generate
 * @returns Random hex string
 */
function generateRandomString(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Hash an API key using SHA-256
 *
 * @param key - The raw API key
 * @returns SHA-256 hash of the key
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Extract the prefix from an API key for identification
 *
 * @param key - The raw API key
 * @returns The first 11 characters (prefix) of the key
 */
function extractKeyPrefix(key: string): string {
  // Format: mc_{env}_{first 3 chars of random part}
  // e.g., "mc_prod_a1b" from "mc_prod_a1b2c3..."
  return key.slice(0, 11);
}

/**
 * Validate API key format
 *
 * @param key - The API key to validate
 * @returns True if the key has valid format
 */
function isValidKeyFormat(key: string): boolean {
  // Format: mc_{env}_{32-chars}
  // Regex: mc_(development|staging|production)_[a-f0-9]{32}
  const pattern = /^mc_(development|staging|production)_[a-f0-9]{32}$/;
  return pattern.test(key);
}

/**
 * Extract environment from API key
 *
 * @param key - The API key
 * @returns The environment or null if invalid format
 */
function extractEnvironment(
  key: string
): 'development' | 'staging' | 'production' | null {
  const match = key.match(/^mc_(development|staging|production)_/);
  if (!match || !match[1]) return null;
  return match[1] as 'development' | 'staging' | 'production';
}

/**
 * Convert Convex record to ApiKey
 */
function convexRecordToApiKey(record: ApiKeyConvexRecord): ApiKey {
  return {
    id: record.keyId,
    keyHash: record.keyHash,
    keyPrefix: record.keyPrefix,
    name: record.name,
    ownerId: record.ownerId,
    ownerType: record.ownerType,
    scopes: record.scopes,
    environment: record.environment,
    active: record.active,
    expiresAt: record.expiresAt,
    lastUsedAt: record.lastUsedAt,
    createdAt: record.createdAt,
    metadata: record.metadata as Record<string, unknown> | undefined,
  };
}

/**
 * Initialize the API key cache from Convex
 * Called automatically on first key operation if not already initialized
 */
export async function initializeApiKeyCache(): Promise<void> {
  if (cacheInitialized || !isConvexConfigured()) {
    return;
  }

  try {
    const client = getConvexClient();
    const activeKeys = (await client.query(apiKeysApi.apiKeys.listActive, {
      limit: 1000,
    })) as ApiKeyConvexRecord[];

    for (const record of activeKeys) {
      const apiKey = convexRecordToApiKey(record);
      apiKeyStore.set(apiKey.id, apiKey);
      keyHashIndex.set(apiKey.keyHash, apiKey.id);
    }

    cacheInitialized = true;
    console.log(
      `[apikey] Initialized cache with ${activeKeys.length} active keys from Convex`
    );
  } catch (error) {
    console.error('[apikey] Failed to initialize cache from Convex:', error);
    // Continue with empty cache - keys will be added as they are created
  }
}

/**
 * Persist API key to Convex (fire and forget for non-critical updates)
 */
async function persistToConvex(keyRecord: ApiKey): Promise<void> {
  if (!isConvexConfigured()) {
    return;
  }

  try {
    const client = getConvexClient();
    await client.mutation(apiKeysApi.apiKeys.create, {
      id: keyRecord.id,
      keyHash: keyRecord.keyHash,
      keyPrefix: keyRecord.keyPrefix,
      name: keyRecord.name,
      ownerId: keyRecord.ownerId,
      ownerType: keyRecord.ownerType,
      scopes: keyRecord.scopes,
      environment: keyRecord.environment,
      active: keyRecord.active,
      expiresAt: keyRecord.expiresAt,
      metadata: keyRecord.metadata,
    });
  } catch (error) {
    console.error('[apikey] Failed to persist key to Convex:', error);
  }
}

/**
 * Generate a new API key
 *
 * Creates a new API key with the specified parameters.
 * Returns both the raw key (which should be shown to the user once)
 * and the stored key metadata.
 *
 * @param input - API key creation parameters
 * @returns Object containing the raw key and the stored key record
 *
 * @example
 * ```ts
 * const { rawKey, keyRecord } = generateApiKey({
 *   name: 'Worker Service Key',
 *   ownerId: 'service:worker',
 *   ownerType: 'service',
 *   scopes: ['read:tasks', 'write:tasks'],
 *   environment: 'production',
 * });
 *
 * // Show rawKey to user once, then discard
 * console.log('Your API key:', rawKey);
 * ```
 */
export function generateApiKey(input: CreateApiKeyInput): {
  rawKey: string;
  keyRecord: ApiKey;
} {
  const {
    name,
    ownerId,
    ownerType,
    scopes = [],
    environment = DEFAULT_ENVIRONMENT,
    expiresInSeconds,
    metadata,
  } = input;

  // Generate the raw key
  const randomPart = generateRandomString(32);
  const rawKey = `${API_KEY_PREFIX}${environment}_${randomPart}`;

  // Create the key record
  const now = Math.floor(Date.now() / 1000);
  const keyRecord: ApiKey = {
    id: randomUUID(),
    keyHash: hashApiKey(rawKey),
    keyPrefix: extractKeyPrefix(rawKey),
    name,
    ownerId,
    ownerType,
    scopes,
    environment,
    active: true,
    expiresAt: expiresInSeconds ? now + expiresInSeconds : undefined,
    createdAt: now,
    metadata,
  };

  // Store in cache
  apiKeyStore.set(keyRecord.id, keyRecord);
  keyHashIndex.set(keyRecord.keyHash, keyRecord.id);

  // Persist to Convex (async, non-blocking)
  persistToConvex(keyRecord).catch(() => {});

  return { rawKey, keyRecord };
}

/**
 * Validate an API key
 *
 * Checks if the provided API key is valid, active, and not expired.
 * First checks local cache, then falls back to Convex if not found.
 *
 * @param key - The raw API key to validate
 * @param expectedEnvironment - Optional: require the key to be for a specific environment
 * @returns Validation result with key details or error
 *
 * @example
 * ```ts
 * const result = await validateApiKey(apiKey, 'production');
 * if (result.valid) {
 *   console.log('Authenticated as:', result.ownerId);
 *   console.log('Scopes:', result.scopes);
 * } else {
 *   console.error('Invalid key:', result.error);
 * }
 * ```
 */
export function validateApiKey(
  key: string,
  expectedEnvironment?: 'development' | 'staging' | 'production'
): ApiKeyValidationResult {
  // Check format
  if (!isValidKeyFormat(key)) {
    return {
      valid: false,
      error: 'Invalid API key format',
      code: 'INVALID_FORMAT',
    };
  }

  // Extract and check environment
  const keyEnvironment = extractEnvironment(key);
  if (!keyEnvironment) {
    return {
      valid: false,
      error: 'Invalid API key format',
      code: 'INVALID_FORMAT',
    };
  }

  if (expectedEnvironment && keyEnvironment !== expectedEnvironment) {
    return {
      valid: false,
      error: `API key is for ${keyEnvironment} environment, expected ${expectedEnvironment}`,
      code: 'ENVIRONMENT_MISMATCH',
    };
  }

  // Look up the key by hash
  const keyHash = hashApiKey(key);
  const keyId = keyHashIndex.get(keyHash);

  if (!keyId) {
    return {
      valid: false,
      error: 'API key not found',
      code: 'KEY_NOT_FOUND',
    };
  }

  const keyRecord = apiKeyStore.get(keyId);
  if (!keyRecord) {
    return {
      valid: false,
      error: 'API key not found',
      code: 'KEY_NOT_FOUND',
    };
  }

  // Check if key is active
  if (!keyRecord.active) {
    return {
      valid: false,
      error: 'API key is inactive',
      code: 'KEY_INACTIVE',
    };
  }

  // Check expiration
  if (keyRecord.expiresAt) {
    const now = Math.floor(Date.now() / 1000);
    if (keyRecord.expiresAt < now) {
      return {
        valid: false,
        error: 'API key has expired',
        code: 'KEY_EXPIRED',
      };
    }
  }

  // Update last used timestamp (local cache)
  keyRecord.lastUsedAt = Math.floor(Date.now() / 1000);
  apiKeyStore.set(keyId, keyRecord);

  // Update last used in Convex (async, non-blocking)
  if (isConvexConfigured()) {
    const client = getConvexClient();
    client
      .mutation(apiKeysApi.apiKeys.updateLastUsed, { keyId })
      .catch(() => {});
  }

  return {
    valid: true,
    keyId: keyRecord.id,
    ownerId: keyRecord.ownerId,
    ownerType: keyRecord.ownerType,
    scopes: keyRecord.scopes,
    environment: keyRecord.environment,
  };
}

/**
 * Validate an API key with Convex fallback
 *
 * Similar to validateApiKey but checks Convex if not found in cache.
 * Use this for critical validation paths.
 */
export async function validateApiKeyWithFallback(
  key: string,
  expectedEnvironment?: 'development' | 'staging' | 'production'
): Promise<ApiKeyValidationResult> {
  // First try cache
  const cacheResult = validateApiKey(key, expectedEnvironment);
  if (cacheResult.valid || cacheResult.code !== 'KEY_NOT_FOUND') {
    return cacheResult;
  }

  // Fallback to Convex if key not found in cache
  if (!isConvexConfigured()) {
    return cacheResult;
  }

  try {
    const keyHash = hashApiKey(key);
    const client = getConvexClient();
    const record = (await client.query(apiKeysApi.apiKeys.getByHash, {
      keyHash,
    })) as ApiKeyConvexRecord | null;

    if (!record) {
      return cacheResult;
    }

    // Add to cache
    const apiKey = convexRecordToApiKey(record);
    apiKeyStore.set(apiKey.id, apiKey);
    keyHashIndex.set(apiKey.keyHash, apiKey.id);

    // Re-validate from cache
    return validateApiKey(key, expectedEnvironment);
  } catch (error) {
    console.error('[apikey] Convex fallback failed:', error);
    return cacheResult;
  }
}

/**
 * Revoke an API key
 *
 * Marks an API key as inactive. The key remains in storage
 * for audit purposes but can no longer be used.
 *
 * @param keyId - The ID of the key to revoke
 * @returns True if the key was found and revoked
 */
export function revokeApiKey(keyId: string): boolean {
  const keyRecord = apiKeyStore.get(keyId);
  if (!keyRecord) {
    return false;
  }

  keyRecord.active = false;
  apiKeyStore.set(keyId, keyRecord);

  // Persist to Convex (async, non-blocking)
  if (isConvexConfigured()) {
    const client = getConvexClient();
    client.mutation(apiKeysApi.apiKeys.revoke, { keyId }).catch(() => {});
  }

  return true;
}

/**
 * Delete an API key completely
 *
 * Removes the API key from storage entirely.
 * Use revokeApiKey for soft deletion that preserves audit trail.
 *
 * @param keyId - The ID of the key to delete
 * @returns True if the key was found and deleted
 */
export function deleteApiKey(keyId: string): boolean {
  const keyRecord = apiKeyStore.get(keyId);
  if (!keyRecord) {
    return false;
  }

  // Remove from index
  keyHashIndex.delete(keyRecord.keyHash);
  // Remove from store
  apiKeyStore.delete(keyId);

  // Delete from Convex (async, non-blocking)
  if (isConvexConfigured()) {
    const client = getConvexClient();
    client.mutation(apiKeysApi.apiKeys.deleteKey, { keyId }).catch(() => {});
  }

  return true;
}

/**
 * List API keys for an owner
 *
 * @param ownerId - The owner ID to filter by
 * @returns Array of API key records (without hashes)
 */
export function listApiKeysByOwner(ownerId: string): Omit<ApiKey, 'keyHash'>[] {
  const keys: Omit<ApiKey, 'keyHash'>[] = [];

  for (const keyRecord of apiKeyStore.values()) {
    if (keyRecord.ownerId === ownerId) {
      // Omit the hash from the response
      const { keyHash: _, ...safeRecord } = keyRecord;
      keys.push(safeRecord);
    }
  }

  return keys;
}

/**
 * Get an API key by ID
 *
 * @param keyId - The key ID
 * @returns The key record (without hash) or null if not found
 */
export function getApiKeyById(keyId: string): Omit<ApiKey, 'keyHash'> | null {
  const keyRecord = apiKeyStore.get(keyId);
  if (!keyRecord) {
    return null;
  }

  const { keyHash: _, ...safeRecord } = keyRecord;
  return safeRecord;
}

/**
 * Rotate an API key
 *
 * Creates a new API key with the same configuration as the old one,
 * optionally keeping the old key active for a grace period.
 *
 * @param keyId - The ID of the key to rotate
 * @param gracePeriodSeconds - How long to keep the old key active (0 to revoke immediately)
 * @returns Object containing the new raw key and record, or null if old key not found
 *
 * @example
 * ```ts
 * const result = rotateApiKey(oldKeyId, 3600); // 1 hour grace period
 * if (result) {
 *   console.log('New key:', result.rawKey);
 *   // Old key will still work for 1 hour
 * }
 * ```
 */
export function rotateApiKey(
  keyId: string,
  gracePeriodSeconds: number = 0
): { rawKey: string; keyRecord: ApiKey; oldKeyId: string } | null {
  const oldKeyRecord = apiKeyStore.get(keyId);
  if (!oldKeyRecord) {
    return null;
  }

  // Create a new key with the same configuration
  const { rawKey, keyRecord } = generateApiKey({
    name: oldKeyRecord.name,
    ownerId: oldKeyRecord.ownerId,
    ownerType: oldKeyRecord.ownerType,
    scopes: oldKeyRecord.scopes,
    environment: oldKeyRecord.environment,
    metadata: oldKeyRecord.metadata,
  });

  // Handle the old key
  if (gracePeriodSeconds > 0) {
    // Set expiration on old key for grace period
    const now = Math.floor(Date.now() / 1000);
    oldKeyRecord.expiresAt = now + gracePeriodSeconds;
    apiKeyStore.set(keyId, oldKeyRecord);

    // Update expiration in Convex (async, non-blocking)
    if (isConvexConfigured()) {
      const client = getConvexClient();
      client
        .mutation(apiKeysApi.apiKeys.updateExpiration, {
          keyId,
          expiresAt: oldKeyRecord.expiresAt,
        })
        .catch(() => {});
    }
  } else {
    // Revoke immediately
    revokeApiKey(keyId);
  }

  return { rawKey, keyRecord, oldKeyId: keyId };
}

/**
 * Check if an API key has a specific scope
 *
 * @param keyId - The key ID
 * @param scope - The scope to check
 * @returns True if the key has the scope
 */
export function hasScope(keyId: string, scope: string): boolean {
  const keyRecord = apiKeyStore.get(keyId);
  if (!keyRecord || !keyRecord.active) {
    return false;
  }

  // Check for wildcard scope
  if (keyRecord.scopes.includes('*')) {
    return true;
  }

  // Check for exact scope match
  if (keyRecord.scopes.includes(scope)) {
    return true;
  }

  // Check for prefix wildcard (e.g., 'read:*' matches 'read:tasks')
  const [action, resource] = scope.split(':');
  if (action && resource) {
    if (keyRecord.scopes.includes(`${action}:*`)) {
      return true;
    }
  }

  return false;
}

/**
 * Clear all API keys (for testing purposes only)
 */
export function _clearAllKeys(): void {
  apiKeyStore.clear();
  keyHashIndex.clear();
  cacheInitialized = false;
}

/**
 * Check if cache is initialized
 */
export function isCacheInitialized(): boolean {
  return cacheInitialized;
}

/**
 * Get cache statistics (for monitoring)
 */
export function getCacheStats(): { keyCount: number; initialized: boolean } {
  return {
    keyCount: apiKeyStore.size,
    initialized: cacheInitialized,
  };
}
