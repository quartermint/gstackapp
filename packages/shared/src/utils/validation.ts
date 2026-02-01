import { ZodError, ZodSchema } from 'zod';
import { ERROR_CODES } from '../constants.js';

/**
 * Result of validation
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ValidationError };

/**
 * Validation error details
 */
export interface ValidationError {
  code: string;
  message: string;
  issues: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Validate data against a Zod schema
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Validation failed',
          issues: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      };
    }
    return {
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Unknown validation error',
        issues: [],
      },
    };
  }
}

/**
 * Validate data and throw on failure
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

/**
 * Safe parse that returns undefined on failure
 */
export function safeParse<T>(
  schema: ZodSchema<T>,
  data: unknown
): T | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Check if a string is a valid UUID
 */
export function isValidUuid(value: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Check if a string is a valid IP address (v4 or v6)
 */
export function isValidIp(value: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(value)) {
    const parts = value.split('.');
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
  // IPv6 (simplified check)
  const ipv6Regex = /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
  return ipv6Regex.test(value);
}
