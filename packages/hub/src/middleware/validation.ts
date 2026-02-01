/**
 * Validation middleware
 *
 * Provides utilities for Zod schema validation with consistent error responses.
 */

import { FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { HTTP_STATUS, ERROR_CODES } from '@mission-control/shared';

/**
 * Result of a validation attempt
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false };

/**
 * Validate data against a Zod schema and send error response if invalid
 *
 * Returns the validated data on success, or sends a 400 response and returns
 * undefined on failure. Use the return value to short-circuit handler execution.
 *
 * @example
 * ```typescript
 * const result = validateOrReply(request.body, MySchema, reply, request.id);
 * if (!result.success) return;
 * const data = result.data; // Typed data
 * ```
 *
 * @param data - The data to validate
 * @param schema - Zod schema to validate against
 * @param reply - Fastify reply object
 * @param requestId - Request ID for error response
 * @param errorMessage - Custom error message (default: 'Validation failed')
 * @returns ValidationResult with typed data on success, or { success: false } after sending error
 */
export function validateOrReply<T>(
  data: unknown,
  schema: ZodSchema<T>,
  reply: FastifyReply,
  requestId: string,
  errorMessage: string = 'Validation failed'
): ValidationResult<T> {
  const parseResult = schema.safeParse(data);

  if (!parseResult.success) {
    reply.status(HTTP_STATUS.BAD_REQUEST).send({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: errorMessage,
        details: parseResult.error.errors,
        requestId,
      },
    });
    return { success: false };
  }

  return { success: true, data: parseResult.data };
}

/**
 * Validate request body and send error if invalid
 *
 * @param body - Request body to validate
 * @param schema - Zod schema to validate against
 * @param reply - Fastify reply object
 * @param requestId - Request ID for error response
 * @returns ValidationResult with typed data on success
 */
export function validateBody<T>(
  body: unknown,
  schema: ZodSchema<T>,
  reply: FastifyReply,
  requestId: string
): ValidationResult<T> {
  return validateOrReply(body, schema, reply, requestId, 'Invalid request body');
}

/**
 * Validate query parameters and send error if invalid
 *
 * @param query - Query parameters to validate
 * @param schema - Zod schema to validate against
 * @param reply - Fastify reply object
 * @param requestId - Request ID for error response
 * @returns ValidationResult with typed data on success
 */
export function validateQuery<T>(
  query: unknown,
  schema: ZodSchema<T>,
  reply: FastifyReply,
  requestId: string
): ValidationResult<T> {
  return validateOrReply(query, schema, reply, requestId, 'Invalid query parameters');
}

/**
 * Format Zod errors into a user-friendly message
 *
 * @param error - Zod error object
 * @returns Formatted error message
 */
export function formatZodError(error: ZodError): string {
  return error.errors
    .map((e) => {
      const path = e.path.length > 0 ? `${e.path.join('.')}: ` : '';
      return `${path}${e.message}`;
    })
    .join('; ');
}
