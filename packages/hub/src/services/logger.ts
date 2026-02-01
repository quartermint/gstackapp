/**
 * Structured JSON logger wrapper around Pino
 *
 * Provides correlation ID propagation and context enrichment
 * for distributed tracing and forensics.
 *
 * TODO (Phase 3): Integrate this custom logger with Fastify by passing it
 * as the `loggerInstance` option in createServer(). Currently routes use
 * Fastify's built-in request.log. This module provides infrastructure for
 * AsyncLocalStorage-based correlation ID propagation that will be wired up
 * in Phase 3 observability improvements.
 */

import pino, { Logger, LoggerOptions } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Context stored in AsyncLocalStorage for correlation
 */
export interface LogContext {
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Additional context fields */
  [key: string]: unknown;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Log level (default: 'info') */
  level?: string;
  /** Service name for identification */
  serviceName?: string;
  /** Enable pretty printing (development only) */
  pretty?: boolean;
  /** Additional base context fields */
  baseContext?: Record<string, unknown>;
}

/**
 * AsyncLocalStorage for correlation ID propagation
 */
const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: Required<LoggerConfig> = {
  level: 'info',
  serviceName: 'hub',
  pretty: false,
  baseContext: {},
};

/**
 * Singleton logger instance
 */
let rootLogger: Logger | null = null;

/**
 * Current configuration
 */
let currentConfig: Required<LoggerConfig> = { ...DEFAULT_CONFIG };

/**
 * Create or get the root logger instance
 *
 * @param config - Optional logger configuration
 * @returns Configured Pino logger instance
 */
export function createLogger(config?: LoggerConfig): Logger {
  if (rootLogger && !config) {
    return rootLogger;
  }

  currentConfig = { ...DEFAULT_CONFIG, ...config };

  const options: LoggerOptions = {
    level: currentConfig.level,
    base: {
      service: currentConfig.serviceName,
      ...currentConfig.baseContext,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    mixin: () => {
      // Add correlation ID from AsyncLocalStorage if available
      const context = asyncLocalStorage.getStore();
      if (context) {
        const { correlationId, ...rest } = context;
        return {
          correlationId,
          ...rest,
        };
      }
      return {};
    },
  };

  // Add pretty printing for development
  if (currentConfig.pretty || process.env['NODE_ENV'] === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  rootLogger = pino(options);
  return rootLogger;
}

/**
 * Get the current logger instance
 * Creates a new logger with defaults if none exists
 *
 * @returns Current Pino logger instance
 */
export function getLogger(): Logger {
  if (!rootLogger) {
    return createLogger();
  }
  return rootLogger;
}

/**
 * Execute a function with a correlation ID context
 *
 * All log calls within the callback will automatically include
 * the correlation ID in their output.
 *
 * @param correlationId - The correlation ID to propagate
 * @param fn - The function to execute
 * @param additionalContext - Optional additional context fields
 * @returns The result of the function
 */
export function withCorrelationId<T>(
  correlationId: string,
  fn: () => T,
  additionalContext?: Record<string, unknown>
): T {
  const context: LogContext = {
    correlationId,
    ...additionalContext,
  };

  return asyncLocalStorage.run(context, fn);
}

/**
 * Execute an async function with a correlation ID context
 *
 * All log calls within the callback will automatically include
 * the correlation ID in their output.
 *
 * @param correlationId - The correlation ID to propagate
 * @param fn - The async function to execute
 * @param additionalContext - Optional additional context fields
 * @returns Promise resolving to the result of the function
 */
export async function withCorrelationIdAsync<T>(
  correlationId: string,
  fn: () => Promise<T>,
  additionalContext?: Record<string, unknown>
): Promise<T> {
  const context: LogContext = {
    correlationId,
    ...additionalContext,
  };

  return asyncLocalStorage.run(context, fn);
}

/**
 * Get the current correlation ID from context
 *
 * @returns Current correlation ID or undefined if not in a context
 */
export function getCorrelationId(): string | undefined {
  const context = asyncLocalStorage.getStore();
  return context?.correlationId;
}

/**
 * Create a child logger with additional context
 *
 * @param bindings - Additional context to add to all log entries
 * @returns Child logger with merged context
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}

/**
 * Log levels for structured logging
 */
export const LogLevels = {
  TRACE: 'trace',
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  FATAL: 'fatal',
} as const;

export type LogLevel = (typeof LogLevels)[keyof typeof LogLevels];

/**
 * Structured log entry for consistent formatting
 */
export interface StructuredLogEntry {
  /** Log message */
  msg: string;
  /** Log level */
  level?: LogLevel;
  /** Error object if logging an error */
  err?: Error;
  /** Request ID for tracing */
  requestId?: string;
  /** Duration in milliseconds for timing logs */
  durationMs?: number;
  /** Additional context fields */
  [key: string]: unknown;
}

/**
 * Log a structured entry
 *
 * @param entry - Structured log entry
 */
export function logStructured(entry: StructuredLogEntry): void {
  const logger = getLogger();
  const { msg, level = 'info', err, ...context } = entry;

  if (err) {
    logger[level]({ err, ...context }, msg);
  } else {
    logger[level](context, msg);
  }
}

/**
 * Reset the logger (useful for testing)
 */
export function resetLogger(): void {
  rootLogger = null;
  currentConfig = { ...DEFAULT_CONFIG };
}
