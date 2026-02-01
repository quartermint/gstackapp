/**
 * Tests for API Key Management Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateApiKey,
  validateApiKey,
  revokeApiKey,
  deleteApiKey,
  listApiKeysByOwner,
  getApiKeyById,
  rotateApiKey,
  hasScope,
  _clearAllKeys,
} from './apikey.js';

describe('API Key Service', () => {
  beforeEach(() => {
    // Clear all keys before each test
    _clearAllKeys();
  });

  describe('generateApiKey', () => {
    it('should generate a valid API key', () => {
      const { rawKey, keyRecord } = generateApiKey({
        name: 'Test Key',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      expect(rawKey).toMatch(/^mc_development_[a-f0-9]{32}$/);
      expect(keyRecord.id).toBeDefined();
      expect(keyRecord.name).toBe('Test Key');
      expect(keyRecord.ownerId).toBe('user-123');
      expect(keyRecord.ownerType).toBe('user');
      expect(keyRecord.active).toBe(true);
      expect(keyRecord.environment).toBe('development');
    });

    it('should generate key for specified environment', () => {
      const { rawKey } = generateApiKey({
        name: 'Production Key',
        ownerId: 'service-1',
        ownerType: 'service',
        environment: 'production',
      });

      expect(rawKey).toMatch(/^mc_production_[a-f0-9]{32}$/);
    });

    it('should include scopes in key record', () => {
      const { keyRecord } = generateApiKey({
        name: 'Scoped Key',
        ownerId: 'service-1',
        ownerType: 'service',
        scopes: ['read:tasks', 'write:tasks'],
      });

      expect(keyRecord.scopes).toEqual(['read:tasks', 'write:tasks']);
    });

    it('should set expiration when specified', () => {
      const { keyRecord } = generateApiKey({
        name: 'Expiring Key',
        ownerId: 'user-123',
        ownerType: 'user',
        expiresInSeconds: 3600,
      });

      expect(keyRecord.expiresAt).toBeDefined();
      const now = Math.floor(Date.now() / 1000);
      expect(keyRecord.expiresAt! - now).toBeGreaterThan(3500);
      expect(keyRecord.expiresAt! - now).toBeLessThanOrEqual(3600);
    });

    it('should include metadata in key record', () => {
      const { keyRecord } = generateApiKey({
        name: 'Key with Metadata',
        ownerId: 'user-123',
        ownerType: 'user',
        metadata: { purpose: 'testing', version: 1 },
      });

      expect(keyRecord.metadata).toEqual({ purpose: 'testing', version: 1 });
    });
  });

  describe('validateApiKey', () => {
    it('should validate a valid key', () => {
      const { rawKey, keyRecord } = generateApiKey({
        name: 'Valid Key',
        ownerId: 'user-123',
        ownerType: 'user',
        scopes: ['read:tasks'],
      });

      const result = validateApiKey(rawKey);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.keyId).toBe(keyRecord.id);
        expect(result.ownerId).toBe('user-123');
        expect(result.ownerType).toBe('user');
        expect(result.scopes).toEqual(['read:tasks']);
        expect(result.environment).toBe('development');
      }
    });

    it('should reject invalid format', () => {
      const result = validateApiKey('invalid-key');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_FORMAT');
      }
    });

    it('should reject unknown key', () => {
      // Use a valid format key that doesn't exist in the store
      const result = validateApiKey('mc_development_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('KEY_NOT_FOUND');
      }
    });

    it('should reject revoked key', () => {
      const { rawKey, keyRecord } = generateApiKey({
        name: 'Revoked Key',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      revokeApiKey(keyRecord.id);
      const result = validateApiKey(rawKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('KEY_INACTIVE');
      }
    });

    it('should reject expired key', async () => {
      const { rawKey } = generateApiKey({
        name: 'Expired Key',
        ownerId: 'user-123',
        ownerType: 'user',
        expiresInSeconds: -1, // Already expired (negative value makes it expire in the past)
      });

      const result = validateApiKey(rawKey);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('KEY_EXPIRED');
      }
    });

    it('should reject environment mismatch', () => {
      const { rawKey } = generateApiKey({
        name: 'Dev Key',
        ownerId: 'user-123',
        ownerType: 'user',
        environment: 'development',
      });

      const result = validateApiKey(rawKey, 'production');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('ENVIRONMENT_MISMATCH');
      }
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke an existing key', () => {
      const { rawKey, keyRecord } = generateApiKey({
        name: 'Key to Revoke',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      const revoked = revokeApiKey(keyRecord.id);
      expect(revoked).toBe(true);

      const result = validateApiKey(rawKey);
      expect(result.valid).toBe(false);
    });

    it('should return false for unknown key', () => {
      const revoked = revokeApiKey('unknown-id');
      expect(revoked).toBe(false);
    });
  });

  describe('deleteApiKey', () => {
    it('should delete an existing key', () => {
      const { keyRecord } = generateApiKey({
        name: 'Key to Delete',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      const deleted = deleteApiKey(keyRecord.id);
      expect(deleted).toBe(true);

      const retrieved = getApiKeyById(keyRecord.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for unknown key', () => {
      const deleted = deleteApiKey('unknown-id');
      expect(deleted).toBe(false);
    });
  });

  describe('listApiKeysByOwner', () => {
    it('should list keys for an owner', () => {
      generateApiKey({
        name: 'Key 1',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      generateApiKey({
        name: 'Key 2',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      generateApiKey({
        name: 'Other Key',
        ownerId: 'user-456',
        ownerType: 'user',
      });

      const keys = listApiKeysByOwner('user-123');
      expect(keys).toHaveLength(2);
      expect(keys.every((k) => k.ownerId === 'user-123')).toBe(true);
    });

    it('should not include key hash in response', () => {
      generateApiKey({
        name: 'Key',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      const keys = listApiKeysByOwner('user-123');
      expect(keys[0]).not.toHaveProperty('keyHash');
    });
  });

  describe('getApiKeyById', () => {
    it('should get a key by ID', () => {
      const { keyRecord } = generateApiKey({
        name: 'Test Key',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      const retrieved = getApiKeyById(keyRecord.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Test Key');
    });

    it('should not include key hash in response', () => {
      const { keyRecord } = generateApiKey({
        name: 'Test Key',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      const retrieved = getApiKeyById(keyRecord.id);
      expect(retrieved).not.toHaveProperty('keyHash');
    });

    it('should return null for unknown key', () => {
      const retrieved = getApiKeyById('unknown-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('rotateApiKey', () => {
    it('should create new key with same config', () => {
      const { keyRecord: oldKey } = generateApiKey({
        name: 'Original Key',
        ownerId: 'service-1',
        ownerType: 'service',
        scopes: ['read:tasks'],
        environment: 'production',
      });

      const result = rotateApiKey(oldKey.id);

      expect(result).not.toBeNull();
      expect(result?.keyRecord.name).toBe('Original Key');
      expect(result?.keyRecord.ownerId).toBe('service-1');
      expect(result?.keyRecord.scopes).toEqual(['read:tasks']);
      expect(result?.keyRecord.environment).toBe('production');
      expect(result?.keyRecord.id).not.toBe(oldKey.id);
    });

    it('should revoke old key immediately without grace period', () => {
      const { rawKey: oldRawKey, keyRecord: oldKey } = generateApiKey({
        name: 'Key to Rotate',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      rotateApiKey(oldKey.id, 0);

      const result = validateApiKey(oldRawKey);
      expect(result.valid).toBe(false);
    });

    it('should keep old key active during grace period', () => {
      const { rawKey: oldRawKey, keyRecord: oldKey } = generateApiKey({
        name: 'Key with Grace',
        ownerId: 'user-123',
        ownerType: 'user',
      });

      rotateApiKey(oldKey.id, 3600); // 1 hour grace period

      const result = validateApiKey(oldRawKey);
      expect(result.valid).toBe(true);
    });

    it('should return null for unknown key', () => {
      const result = rotateApiKey('unknown-id');
      expect(result).toBeNull();
    });
  });

  describe('hasScope', () => {
    it('should return true for exact scope match', () => {
      const { keyRecord } = generateApiKey({
        name: 'Scoped Key',
        ownerId: 'user-123',
        ownerType: 'user',
        scopes: ['read:tasks', 'write:tasks'],
      });

      expect(hasScope(keyRecord.id, 'read:tasks')).toBe(true);
      expect(hasScope(keyRecord.id, 'write:tasks')).toBe(true);
      expect(hasScope(keyRecord.id, 'delete:tasks')).toBe(false);
    });

    it('should return true for wildcard scope', () => {
      const { keyRecord } = generateApiKey({
        name: 'Admin Key',
        ownerId: 'admin',
        ownerType: 'user',
        scopes: ['*'],
      });

      expect(hasScope(keyRecord.id, 'read:tasks')).toBe(true);
      expect(hasScope(keyRecord.id, 'anything:else')).toBe(true);
    });

    it('should return true for prefix wildcard scope', () => {
      const { keyRecord } = generateApiKey({
        name: 'Read-only Key',
        ownerId: 'user-123',
        ownerType: 'user',
        scopes: ['read:*'],
      });

      expect(hasScope(keyRecord.id, 'read:tasks')).toBe(true);
      expect(hasScope(keyRecord.id, 'read:users')).toBe(true);
      expect(hasScope(keyRecord.id, 'write:tasks')).toBe(false);
    });

    it('should return false for inactive key', () => {
      const { keyRecord } = generateApiKey({
        name: 'Revoked Key',
        ownerId: 'user-123',
        ownerType: 'user',
        scopes: ['read:tasks'],
      });

      revokeApiKey(keyRecord.id);

      expect(hasScope(keyRecord.id, 'read:tasks')).toBe(false);
    });

    it('should return false for unknown key', () => {
      expect(hasScope('unknown-id', 'read:tasks')).toBe(false);
    });
  });
});
