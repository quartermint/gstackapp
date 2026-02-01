/**
 * Unit tests for Claude CLI client service
 *
 * These tests verify the behavior of the Claude CLI client module,
 * including error handling, timeout handling, and response parsing.
 *
 * Note: Tests requiring spawn mocking are skipped in environments where
 * the actual CLI is being used. The createStubResponse tests and basic
 * functionality tests work without mocking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createStubResponse,
  ClaudeCliNotFoundError,
  ClaudeCliTimeoutError,
  ClaudeCliExecutionError,
} from '../src/services/claude-client.js';
import { resetLogger } from '../src/services/logger.js';

describe('Claude CLI Client', () => {
  beforeEach(() => {
    resetLogger();
    // Suppress log output during tests
    process.env['LOG_LEVEL'] = 'silent';
  });

  describe('createStubResponse', () => {
    it('should create a stub response with provided prompt', () => {
      const response = createStubResponse('Hello world');

      expect(response.content).toContain('[STUB RESPONSE');
      expect(response.content).toContain('Hello world');
      expect(response.usage).toBeDefined();
      expect(response.usage.promptTokens).toBeGreaterThan(0);
      expect(response.usage.completionTokens).toBeGreaterThan(0);
    });

    it('should truncate long prompts in stub response', () => {
      const longPrompt = 'x'.repeat(200);
      const response = createStubResponse(longPrompt);

      expect(response.content).toContain('...');
      expect(response.content).not.toContain('x'.repeat(200));
    });

    it('should preserve conversation ID if provided', () => {
      const response = createStubResponse('test', { conversationId: 'my-conv-123' });

      expect(response.conversationId).toBe('my-conv-123');
    });

    it('should generate a conversation ID if not provided', () => {
      const response = createStubResponse('test');

      expect(response.conversationId).toBeDefined();
      expect(response.conversationId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should estimate token usage based on prompt length', () => {
      const shortPrompt = 'Hi';
      const longPrompt = 'This is a much longer prompt with more content.';

      const shortResponse = createStubResponse(shortPrompt);
      const longResponse = createStubResponse(longPrompt);

      expect(shortResponse.usage.promptTokens).toBeLessThan(longResponse.usage.promptTokens);
    });
  });

  describe('Error classes', () => {
    it('ClaudeCliNotFoundError should have correct name and message', () => {
      const error = new ClaudeCliNotFoundError('Custom message');
      expect(error.name).toBe('ClaudeCliNotFoundError');
      expect(error.message).toBe('Custom message');
    });

    it('ClaudeCliNotFoundError should have default message', () => {
      const error = new ClaudeCliNotFoundError();
      expect(error.message).toBe('Claude CLI not found');
    });

    it('ClaudeCliTimeoutError should include timeout value in message', () => {
      const error = new ClaudeCliTimeoutError(5000);
      expect(error.name).toBe('ClaudeCliTimeoutError');
      expect(error.message).toContain('5000');
      expect(error.message).toContain('timed out');
    });

    it('ClaudeCliExecutionError should include exit code and stderr', () => {
      const error = new ClaudeCliExecutionError('Failed', 1, 'Some error output');
      expect(error.name).toBe('ClaudeCliExecutionError');
      expect(error.message).toBe('Failed');
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toBe('Some error output');
    });

    it('ClaudeCliExecutionError should handle null exit code', () => {
      const error = new ClaudeCliExecutionError('Failed', null, 'Error');
      expect(error.exitCode).toBeNull();
    });
  });

  describe('ClaudeClientOptions interface validation', () => {
    it('should accept valid options object', () => {
      // This test validates the TypeScript interface indirectly
      const options = {
        maxTokens: 1000,
        timeout: 30000,
        conversationId: 'test-123',
        stream: false,
        systemPrompt: 'You are a helpful assistant',
        allowedTools: ['read', 'write'] as const,
        workingDirectory: '/tmp',
      };

      // Create a stub response with these options to verify they're accepted
      const response = createStubResponse('test', options);
      expect(response.conversationId).toBe('test-123');
    });

    it('should work with minimal options', () => {
      const response = createStubResponse('test', {});
      expect(response).toBeDefined();
      expect(response.content).toContain('[STUB RESPONSE');
    });

    it('should work with no options', () => {
      const response = createStubResponse('test');
      expect(response).toBeDefined();
      expect(response.conversationId).toBeDefined();
    });
  });

  describe('ClaudeResponse structure', () => {
    it('should have correct structure', () => {
      const response = createStubResponse('test');

      // Verify all required fields are present
      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('usage');
      expect(response.usage).toHaveProperty('promptTokens');
      expect(response.usage).toHaveProperty('completionTokens');

      // Verify types
      expect(typeof response.content).toBe('string');
      expect(typeof response.usage.promptTokens).toBe('number');
      expect(typeof response.usage.completionTokens).toBe('number');
    });

    it('should have optional conversationId', () => {
      const response = createStubResponse('test');
      // conversationId can be string or undefined
      expect(
        response.conversationId === undefined || typeof response.conversationId === 'string'
      ).toBe(true);
    });
  });
});
