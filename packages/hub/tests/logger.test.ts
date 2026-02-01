/**
 * Tests for logger service
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createLogger,
  getLogger,
  withCorrelationId,
  withCorrelationIdAsync,
  getCorrelationId,
  createChildLogger,
  resetLogger,
  LogLevels,
  logStructured,
} from '../src/services/logger.js';

describe('Logger Service', () => {
  beforeEach(() => {
    resetLogger();
    // Reset environment for clean tests
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    resetLogger();
  });

  describe('createLogger', () => {
    it('should create a logger with default config', () => {
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });

    it('should create a logger with custom level', () => {
      const logger = createLogger({ level: 'debug' });
      expect(logger).toBeDefined();
    });

    it('should create a logger with custom service name', () => {
      const logger = createLogger({ serviceName: 'test-service' });
      expect(logger).toBeDefined();
    });

    it('should return singleton when called without config', () => {
      const logger1 = createLogger({ serviceName: 'service1' });
      const logger2 = createLogger();
      expect(logger1).toBe(logger2);
    });
  });

  describe('getLogger', () => {
    it('should return the same instance as createLogger', () => {
      const created = createLogger();
      const retrieved = getLogger();
      expect(created).toBe(retrieved);
    });

    it('should create a default logger if none exists', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
    });
  });

  describe('withCorrelationId', () => {
    it('should make correlation ID available in context', () => {
      let capturedId: string | undefined;

      withCorrelationId('test-correlation-id', () => {
        capturedId = getCorrelationId();
      });

      expect(capturedId).toBe('test-correlation-id');
    });

    it('should return the result of the callback', () => {
      const result = withCorrelationId('test-id', () => {
        return 'test-result';
      });

      expect(result).toBe('test-result');
    });

    it('should not leak correlation ID outside context', () => {
      withCorrelationId('inside-id', () => {
        expect(getCorrelationId()).toBe('inside-id');
      });

      expect(getCorrelationId()).toBeUndefined();
    });

    it('should support additional context', () => {
      const result = withCorrelationId(
        'test-id',
        () => {
          return getCorrelationId();
        },
        { userId: 'user-123' }
      );

      expect(result).toBe('test-id');
    });
  });

  describe('withCorrelationIdAsync', () => {
    it('should work with async functions', async () => {
      let capturedId: string | undefined;

      await withCorrelationIdAsync('async-correlation-id', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        capturedId = getCorrelationId();
      });

      expect(capturedId).toBe('async-correlation-id');
    });

    it('should return async result', async () => {
      const result = await withCorrelationIdAsync('test-id', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should propagate errors', async () => {
      await expect(
        withCorrelationIdAsync('test-id', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });
  });

  describe('getCorrelationId', () => {
    it('should return undefined outside of context', () => {
      expect(getCorrelationId()).toBeUndefined();
    });

    it('should return the current correlation ID in context', () => {
      withCorrelationId('my-id', () => {
        expect(getCorrelationId()).toBe('my-id');
      });
    });
  });

  describe('createChildLogger', () => {
    it('should create a child logger with bindings', () => {
      createLogger(); // Ensure root logger exists
      const child = createChildLogger({ component: 'test-component' });

      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
    });

    it('should inherit from root logger', () => {
      createLogger({ serviceName: 'parent-service' });
      const child = createChildLogger({ requestId: 'req-123' });

      expect(child).toBeDefined();
    });
  });

  describe('LogLevels', () => {
    it('should have all standard log levels', () => {
      expect(LogLevels.TRACE).toBe('trace');
      expect(LogLevels.DEBUG).toBe('debug');
      expect(LogLevels.INFO).toBe('info');
      expect(LogLevels.WARN).toBe('warn');
      expect(LogLevels.ERROR).toBe('error');
      expect(LogLevels.FATAL).toBe('fatal');
    });
  });

  describe('logStructured', () => {
    it('should log structured entries without error', () => {
      createLogger({ level: 'error' }); // Use error level to avoid output

      // This should not throw
      expect(() => {
        logStructured({
          msg: 'Test message',
          level: 'info',
          requestId: 'req-123',
        });
      }).not.toThrow();
    });

    it('should handle errors in structured log', () => {
      createLogger({ level: 'error' });
      const testError = new Error('Test error');

      expect(() => {
        logStructured({
          msg: 'Error occurred',
          level: 'error',
          err: testError,
        });
      }).not.toThrow();
    });

    it('should default to info level', () => {
      createLogger({ level: 'error' });

      expect(() => {
        logStructured({
          msg: 'Default level message',
        });
      }).not.toThrow();
    });
  });

  describe('resetLogger', () => {
    it('should reset the singleton logger', () => {
      const logger1 = createLogger({ serviceName: 'first' });
      resetLogger();
      const logger2 = createLogger({ serviceName: 'second' });

      // After reset, we should get a new logger
      expect(logger1).not.toBe(logger2);
    });
  });
});
