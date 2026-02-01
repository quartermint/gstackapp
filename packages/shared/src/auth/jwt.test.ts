/**
 * Tests for shared JWT authentication module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  verifyJwt,
  signJwt,
  refreshToken,
  decodeJwt,
  extractBearerToken,
  JWT_CONFIG,
} from './jwt.js';

const TEST_SECRET = 'test-secret-key-for-jwt-signing-32chars';

describe('JWT Module', () => {
  describe('signJwt', () => {
    it('should sign an access token with default expiry', async () => {
      const token = await signJwt({ sub: 'user-123' }, TEST_SECRET);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should include custom claims in the token', async () => {
      const token = await signJwt(
        { sub: 'user-123', email: 'user@example.com', roles: ['admin'] },
        TEST_SECRET
      );

      const decoded = decodeJwt(token);
      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe('user-123');
      expect(decoded?.email).toBe('user@example.com');
      expect(decoded?.roles).toEqual(['admin']);
    });

    it('should sign a refresh token with longer expiry', async () => {
      const token = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { type: 'refresh' }
      );

      const decoded = decodeJwt(token);
      expect(decoded?.type).toBe('refresh');
      expect(decoded?.jti).toBeDefined(); // Refresh tokens get a jti
    });

    it('should use custom expiry when provided', async () => {
      const token = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { expiresIn: '30m' }
      );

      const decoded = decodeJwt(token);
      expect(decoded?.exp).toBeDefined();
      // Verify expiry is approximately 30 minutes from now
      const now = Math.floor(Date.now() / 1000);
      expect(decoded!.exp - now).toBeGreaterThan(29 * 60);
      expect(decoded!.exp - now).toBeLessThan(31 * 60);
    });
  });

  describe('verifyJwt', () => {
    it('should verify a valid access token', async () => {
      const token = await signJwt({ sub: 'user-123' }, TEST_SECRET);
      const result = await verifyJwt(token, TEST_SECRET);

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.sub).toBe('user-123');
        expect(result.payload.type).toBe('access');
      }
    });

    it('should verify a valid refresh token', async () => {
      const token = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { type: 'refresh' }
      );
      const result = await verifyJwt(token, TEST_SECRET, 'refresh');

      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.sub).toBe('user-123');
        expect(result.payload.type).toBe('refresh');
      }
    });

    it('should reject token with wrong secret', async () => {
      const token = await signJwt({ sub: 'user-123' }, TEST_SECRET);
      const result = await verifyJwt(token, 'wrong-secret');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('SIGNATURE_ERROR');
      }
    });

    it('should reject expired token', async () => {
      const token = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { expiresIn: '0s' }
      );

      // Wait a tiny bit to ensure expiry
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await verifyJwt(token, TEST_SECRET);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('EXPIRED_TOKEN');
      }
    });

    it('should reject token with wrong type', async () => {
      const token = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { type: 'access' }
      );
      const result = await verifyJwt(token, TEST_SECRET, 'refresh');

      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_TOKEN_TYPE');
      }
    });

    it('should reject malformed token', async () => {
      const result = await verifyJwt('not-a-valid-token', TEST_SECRET);

      expect(result.valid).toBe(false);
      if (!result.valid) {
        // Malformed tokens may throw different errors depending on the library
        expect(['INVALID_TOKEN', 'SIGNATURE_ERROR']).toContain(result.code);
      }
    });
  });

  describe('refreshToken', () => {
    it('should issue new access token from valid refresh token', async () => {
      const refreshTokenValue = await signJwt(
        { sub: 'user-123', email: 'user@example.com' },
        TEST_SECRET,
        { type: 'refresh' }
      );

      const result = await refreshToken(refreshTokenValue, TEST_SECRET);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.accessToken).toBeDefined();
        expect(result.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));

        // Verify the new access token
        const verified = await verifyJwt(result.accessToken, TEST_SECRET);
        expect(verified.valid).toBe(true);
        if (verified.valid) {
          expect(verified.payload.sub).toBe('user-123');
          expect(verified.payload.email).toBe('user@example.com');
          expect(verified.payload.type).toBe('access');
        }
      }
    });

    it('should rotate refresh token when requested', async () => {
      const refreshTokenValue = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { type: 'refresh' }
      );

      const result = await refreshToken(refreshTokenValue, TEST_SECRET, {
        rotateRefreshToken: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.refreshToken).toBeDefined();

        // Verify the new refresh token is different
        expect(result.refreshToken).not.toBe(refreshTokenValue);

        // Verify the new refresh token is valid
        const verified = await verifyJwt(result.refreshToken!, TEST_SECRET, 'refresh');
        expect(verified.valid).toBe(true);
      }
    });

    it('should reject access token used as refresh token', async () => {
      const accessToken = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { type: 'access' }
      );

      const result = await refreshToken(accessToken, TEST_SECRET);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('INVALID_TOKEN_TYPE');
      }
    });

    it('should reject expired refresh token', async () => {
      const refreshTokenValue = await signJwt(
        { sub: 'user-123' },
        TEST_SECRET,
        { type: 'refresh', expiresIn: '0s' }
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await refreshToken(refreshTokenValue, TEST_SECRET);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('EXPIRED_TOKEN');
      }
    });
  });

  describe('decodeJwt', () => {
    it('should decode a valid token without verification', async () => {
      const token = await signJwt(
        { sub: 'user-123', email: 'user@example.com' },
        TEST_SECRET
      );

      const decoded = decodeJwt(token);

      expect(decoded).not.toBeNull();
      expect(decoded?.sub).toBe('user-123');
      expect(decoded?.email).toBe('user@example.com');
    });

    it('should return null for invalid token', () => {
      const decoded = decodeJwt('not-a-token');
      expect(decoded).toBeNull();
    });

    it('should return null for token without sub claim', () => {
      // Manually create a token without sub (this is malformed)
      const decoded = decodeJwt('eyJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3MDAwMDAwMDB9.signature');
      expect(decoded).toBeNull();
    });
  });

  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = extractBearerToken('Bearer my-token-123');
      expect(token).toBe('my-token-123');
    });

    it('should return null for non-Bearer header', () => {
      const token = extractBearerToken('Basic credentials');
      expect(token).toBeNull();
    });

    it('should return null for empty header', () => {
      const token = extractBearerToken('');
      expect(token).toBeNull();
    });

    it('should return null for undefined header', () => {
      const token = extractBearerToken(undefined);
      expect(token).toBeNull();
    });

    it('should return null for Bearer without token', () => {
      const token = extractBearerToken('Bearer ');
      expect(token).toBeNull();
    });
  });

  describe('JWT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(JWT_CONFIG.ACCESS_TOKEN_EXPIRY).toBe('15m');
      expect(JWT_CONFIG.REFRESH_TOKEN_EXPIRY).toBe('7d');
      expect(JWT_CONFIG.DEFAULT_ALGORITHM).toBe('HS256');
      expect(JWT_CONFIG.ALGORITHMS).toContain('HS256');
      expect(JWT_CONFIG.ALGORITHMS).toContain('HS384');
      expect(JWT_CONFIG.ALGORITHMS).toContain('HS512');
    });
  });
});
