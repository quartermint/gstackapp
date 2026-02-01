import { z } from 'zod';
import { ERROR_CODES } from '../constants.js';

/**
 * Error code enum schema
 */
export const ErrorCodeSchema = z.enum([
  ERROR_CODES.AUTH_MISSING_TOKEN,
  ERROR_CODES.AUTH_INVALID_TOKEN,
  ERROR_CODES.AUTH_EXPIRED_TOKEN,
  ERROR_CODES.RATE_LIMIT_EXCEEDED,
  ERROR_CODES.VALIDATION_FAILED,
  ERROR_CODES.SANITIZATION_FAILED,
  ERROR_CODES.INPUT_TOO_LONG,
  ERROR_CODES.INJECTION_DETECTED,
  ERROR_CODES.INSUFFICIENT_TRUST,
  ERROR_CODES.TOOL_NOT_ALLOWED,
  ERROR_CODES.EXECUTION_FAILED,
  ERROR_CODES.EXECUTION_TIMEOUT,
  ERROR_CODES.SANDBOX_VIOLATION,
  ERROR_CODES.COMMAND_NOT_ALLOWED,
  ERROR_CODES.NODE_UNAVAILABLE,
  ERROR_CODES.NODE_TIMEOUT,
  ERROR_CODES.INTERNAL_ERROR,
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * Standard error response schema
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    requestId: z.string().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Create a typed error response
 */
export function createErrorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string
): ErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      ...(requestId && { requestId }),
    },
  };
}
