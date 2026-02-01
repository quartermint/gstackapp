/**
 * Hub middleware module
 *
 * Provides shared middleware utilities for Fastify routes:
 * - Authentication and trust level enforcement
 * - Zod schema validation with error responses
 * - Convex availability checks
 */

// Authentication middleware
export {
  requireTrustLevel,
  requireAuthenticated,
  requireInternal,
  requirePowerUser,
} from './auth.js';

// Validation helpers
export {
  validateOrReply,
  validateBody,
  validateQuery,
  formatZodError,
  type ValidationResult,
} from './validation.js';

// Convex helpers
export {
  requireConvex,
  getConvexOrReply,
  isConvexConfigured,
  getConvexClient,
} from './convex.js';
