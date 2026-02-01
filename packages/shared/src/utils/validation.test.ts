import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validate,
  validateOrThrow,
  safeParse,
  isValidUuid,
  isValidIp,
} from './validation.js';
import { ERROR_CODES } from '../constants.js';

describe('validate', () => {
  const stringSchema = z.string().min(1).max(10);

  it('should return success for valid data', () => {
    const result = validate(stringSchema, 'hello');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('hello');
    }
  });

  it('should return error for invalid data', () => {
    const result = validate(stringSchema, '');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });

  it('should return error for data exceeding max length', () => {
    const result = validate(stringSchema, 'this is way too long');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
    }
  });

  it('should handle non-Zod errors', () => {
    // Create a schema that throws a non-Zod error
    const throwingSchema = z.string().transform(() => {
      throw new Error('Non-Zod error');
    });

    const result = validate(throwingSchema, 'test');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toBe('Unknown validation error');
      expect(result.error.issues).toEqual([]);
    }
  });

  it('should include path information in issues', () => {
    const objectSchema = z.object({
      name: z.string(),
      nested: z.object({
        value: z.number(),
      }),
    });

    const result = validate(objectSchema, { name: 'test', nested: { value: 'not a number' } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pathIssue = result.error.issues.find((i) => i.path.includes('nested'));
      expect(pathIssue).toBeDefined();
    }
  });
});

describe('validateOrThrow', () => {
  const numberSchema = z.number().positive();

  it('should return parsed data for valid input', () => {
    const result = validateOrThrow(numberSchema, 42);
    expect(result).toBe(42);
  });

  it('should throw for invalid input', () => {
    expect(() => validateOrThrow(numberSchema, -1)).toThrow();
  });

  it('should throw for wrong type', () => {
    expect(() => validateOrThrow(numberSchema, 'not a number')).toThrow();
  });
});

describe('safeParse', () => {
  const booleanSchema = z.boolean();

  it('should return data for valid input', () => {
    const result = safeParse(booleanSchema, true);
    expect(result).toBe(true);
  });

  it('should return undefined for invalid input', () => {
    const result = safeParse(booleanSchema, 'not a boolean');
    expect(result).toBeUndefined();
  });

  it('should return undefined for null', () => {
    const result = safeParse(booleanSchema, null);
    expect(result).toBeUndefined();
  });
});

describe('isValidUuid', () => {
  it('should return true for valid UUID v4', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  it('should return true for uppercase UUID', () => {
    expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('should return false for invalid UUID format', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
    expect(isValidUuid('550e8400e29b41d4a716446655440000')).toBe(false);
    expect(isValidUuid('')).toBe(false);
  });

  it('should return false for UUID with invalid characters', () => {
    expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
    expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000!')).toBe(false);
  });
});

describe('isValidIp', () => {
  describe('IPv4', () => {
    it('should return true for valid IPv4 addresses', () => {
      expect(isValidIp('192.168.1.1')).toBe(true);
      expect(isValidIp('10.0.0.1')).toBe(true);
      expect(isValidIp('172.16.0.1')).toBe(true);
      expect(isValidIp('0.0.0.0')).toBe(true);
      expect(isValidIp('255.255.255.255')).toBe(true);
    });

    it('should return false for IPv4 with invalid octets', () => {
      expect(isValidIp('256.1.1.1')).toBe(false);
      expect(isValidIp('192.168.1.256')).toBe(false);
      expect(isValidIp('192.168.300.1')).toBe(false);
    });

    it('should return false for malformed IPv4', () => {
      expect(isValidIp('192.168.1')).toBe(false);
      expect(isValidIp('192.168.1.1.1')).toBe(false);
      expect(isValidIp('192.168.1.')).toBe(false);
    });
  });

  describe('IPv6', () => {
    it('should return true for valid IPv6 addresses', () => {
      expect(isValidIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(true);
      expect(isValidIp('::1')).toBe(true);
      expect(isValidIp('fe80::1')).toBe(true);
      expect(isValidIp('2001:db8::1')).toBe(true);
    });

    it('should return false for invalid strings', () => {
      expect(isValidIp('not-an-ip')).toBe(false);
      expect(isValidIp('')).toBe(false);
      expect(isValidIp('localhost')).toBe(false);
    });
  });
});
