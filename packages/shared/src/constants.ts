/**
 * Trust levels for request classification
 */
export const TRUST_LEVELS = {
  INTERNAL: 'internal',
  AUTHENTICATED: 'authenticated',
  UNTRUSTED: 'untrusted',
} as const;

/**
 * Agent profile identifiers
 */
export const AGENT_PROFILES = {
  CHAT_READONLY: 'chat-readonly',
  CODE_ASSISTANT: 'code-assistant',
  TASK_ORCHESTRATOR: 'task-orchestrator',
} as const;

/**
 * Error codes for typed errors
 */
export const ERROR_CODES = {
  // Authentication errors (1xxx)
  AUTH_MISSING_TOKEN: 'AUTH_MISSING_TOKEN',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_EXPIRED_TOKEN: 'AUTH_EXPIRED_TOKEN',

  // Rate limiting (2xxx)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Validation errors (3xxx)
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  SANITIZATION_FAILED: 'SANITIZATION_FAILED',
  INPUT_TOO_LONG: 'INPUT_TOO_LONG',
  INJECTION_DETECTED: 'INJECTION_DETECTED',

  // Trust errors (4xxx)
  INSUFFICIENT_TRUST: 'INSUFFICIENT_TRUST',
  TOOL_NOT_ALLOWED: 'TOOL_NOT_ALLOWED',

  // Execution errors (5xxx)
  EXECUTION_FAILED: 'EXECUTION_FAILED',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  SANDBOX_VIOLATION: 'SANDBOX_VIOLATION',
  COMMAND_NOT_ALLOWED: 'COMMAND_NOT_ALLOWED',

  // Node errors (6xxx)
  NODE_UNAVAILABLE: 'NODE_UNAVAILABLE',
  NODE_TIMEOUT: 'NODE_TIMEOUT',

  // Internal errors (9xxx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * System limits
 */
export const LIMITS = {
  /** Maximum input length in characters */
  MAX_INPUT_LENGTH: 10_000,
  /** Maximum output length in characters */
  MAX_OUTPUT_LENGTH: 100_000,
  /** Rate limit: requests per minute per IP */
  RATE_LIMIT_RPM: 100,
  /** Rate limit: requests per minute per authenticated user */
  RATE_LIMIT_USER_RPM: 500,
  /** Default task timeout in milliseconds */
  DEFAULT_TASK_TIMEOUT_MS: 30_000,
  /** Maximum task timeout in milliseconds */
  MAX_TASK_TIMEOUT_MS: 300_000,
  /** Node heartbeat interval in milliseconds */
  NODE_HEARTBEAT_INTERVAL_MS: 30_000,
  /** Node considered offline after this many missed heartbeats */
  NODE_OFFLINE_THRESHOLD: 3,
} as const;

/**
 * HTTP status codes used in the system
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;
