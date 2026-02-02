/**
 * Tests for Gemini API client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isGeminiConfigured,
  resetGeminiCache,
  executeGemini,
  executeGeminiWithRetry,
  executeGeminiWithFallback,
  createStubResponse,
  convertToGeminiHistory,
  extractSystemInstruction,
  GeminiNotConfiguredError,
  GeminiTimeoutError,
  GeminiApiError,
  GeminiRateLimitError,
  __testing,
} from '../src/services/gemini-client.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Gemini Client', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetGeminiCache();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetGeminiCache();
  });

  describe('isGeminiConfigured', () => {
    it('should return false when GEMINI_API_KEY is not set', () => {
      expect(isGeminiConfigured()).toBe(false);
    });

    it('should return true when GEMINI_API_KEY is set', () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();
      expect(isGeminiConfigured()).toBe(true);
    });

    it('should cache the result', () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();
      expect(isGeminiConfigured()).toBe(true);

      // Remove the key - should still return cached value
      vi.unstubAllEnvs();
      expect(isGeminiConfigured()).toBe(true);
    });
  });

  describe('__testing.buildContents', () => {
    it('should build contents with just a prompt', () => {
      const contents = __testing.buildContents('Hello, world!');
      expect(contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello, world!' }] },
      ]);
    });

    it('should include history before the prompt', () => {
      const history = [
        { role: 'user' as const, parts: [{ text: 'Hi' }] },
        { role: 'model' as const, parts: [{ text: 'Hello!' }] },
      ];
      const contents = __testing.buildContents('How are you?', history);
      expect(contents).toEqual([
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello!' }] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
      ]);
    });
  });

  describe('__testing.buildRequestBody', () => {
    it('should build basic request body', () => {
      const body = __testing.buildRequestBody('Test prompt', {});
      expect(body).toHaveProperty('contents');
      expect(body).toHaveProperty('generationConfig');
      expect(body['generationConfig']).toHaveProperty('maxOutputTokens');
      expect(body['generationConfig']).toHaveProperty('temperature');
    });

    it('should include system instruction when provided', () => {
      const body = __testing.buildRequestBody('Test', {
        systemInstruction: 'You are a helpful assistant',
      });
      expect(body).toHaveProperty('systemInstruction');
      expect(body['systemInstruction']).toEqual({
        parts: [{ text: 'You are a helpful assistant' }],
      });
    });

    it('should use provided options', () => {
      const body = __testing.buildRequestBody('Test', {
        maxOutputTokens: 1000,
        temperature: 0.5,
      });
      expect((body['generationConfig'] as Record<string, unknown>)['maxOutputTokens']).toBe(1000);
      expect((body['generationConfig'] as Record<string, unknown>)['temperature']).toBe(0.5);
    });
  });

  describe('__testing.parseResponse', () => {
    it('should parse a valid response', () => {
      const data = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello!' }],
            },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      };

      const result = __testing.parseResponse(data, 'gemini-2.0-flash', 100);

      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(5);
      expect(result.usage.totalTokens).toBe(15);
      expect(result.latencyMs).toBe(100);
      expect(result.finishReason).toBe('STOP');
    });

    it('should handle missing fields gracefully', () => {
      const data = {};
      const result = __testing.parseResponse(data, 'gemini-2.0-flash', 50);

      expect(result.content).toBe('');
      expect(result.usage.promptTokens).toBe(0);
      expect(result.usage.completionTokens).toBe(0);
    });

    it('should concatenate multiple parts', () => {
      const data = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello, ' }, { text: 'world!' }],
            },
          },
        ],
      };

      const result = __testing.parseResponse(data, 'gemini-2.0-flash', 100);
      expect(result.content).toBe('Hello, world!');
    });
  });

  describe('__testing.buildApiUrl', () => {
    it('should build non-streaming URL', () => {
      const url = __testing.buildApiUrl('gemini-2.0-flash', false);
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
      );
    });

    it('should build streaming URL', () => {
      const url = __testing.buildApiUrl('gemini-2.0-flash', true);
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent'
      );
    });
  });

  describe('executeGemini', () => {
    it('should throw GeminiNotConfiguredError when API key not set', async () => {
      await expect(executeGemini('Test')).rejects.toThrow(GeminiNotConfiguredError);
    });

    it('should make API request with correct parameters', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Response' }] } }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
        }),
      });

      const result = await executeGemini('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('gemini-2.0-flash:generateContent');
      expect(url).toContain('key=test-key');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.contents).toBeDefined();
      expect(body.generationConfig).toBeDefined();

      expect(result.content).toBe('Response');
      expect(result.model).toBe('gemini-2.0-flash');
    });

    it('should use custom model from options', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        }),
      });

      await executeGemini('Test', { model: 'gemini-1.5-pro' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('gemini-1.5-pro:generateContent');
    });

    it('should default to gemini-2.0-flash model', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        }),
      });

      const result = await executeGemini('Test');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('gemini-2.0-flash:generateContent');
      expect(result.model).toBe('gemini-2.0-flash');
    });

    it('should throw GeminiApiError on non-OK response', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(executeGemini('Test')).rejects.toThrow(GeminiApiError);
    });

    it('should throw GeminiRateLimitError on 429', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'Retry-After': '5' }),
        text: async () => 'Rate limited',
      });

      try {
        await executeGemini('Test');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GeminiRateLimitError);
        expect((err as GeminiRateLimitError).retryAfterMs).toBe(5000);
      }
    });

    it('should include system instruction in request', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'OK' }] } }],
        }),
      });

      await executeGemini('Test', {
        systemInstruction: 'Be helpful',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.systemInstruction).toEqual({
        parts: [{ text: 'Be helpful' }],
      });
    });
  });

  describe('executeGeminiWithRetry', () => {
    it('should retry on transient failures', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      // First call fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: 'Success' }] } }],
          }),
        });

      const result = await executeGeminiWithRetry('Test', {}, 3);
      expect(result.content).toBe('Success');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on configuration error', async () => {
      await expect(executeGeminiWithRetry('Test')).rejects.toThrow(
        GeminiNotConfiguredError
      );
    });

    it('should not retry on client errors (except 429)', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request',
      });

      await expect(executeGeminiWithRetry('Test', {}, 3)).rejects.toThrow(
        GeminiApiError
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeGeminiWithFallback', () => {
    it('should return stub when not configured', async () => {
      const result = await executeGeminiWithFallback('Hello');

      expect(result.content).toContain('STUB RESPONSE');
      expect(result.finishReason).toBe('STUB');
    });

    it('should return real response when configured', async () => {
      vi.stubEnv('GEMINI_API_KEY', 'test-key');
      resetGeminiCache();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'Real response' }] } }],
        }),
      });

      const result = await executeGeminiWithFallback('Hello');
      expect(result.content).toBe('Real response');
    });
  });

  describe('createStubResponse', () => {
    it('should create a stub response', () => {
      const result = createStubResponse('Test prompt');

      expect(result.content).toContain('STUB RESPONSE');
      expect(result.content).toContain('Test prompt');
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.finishReason).toBe('STUB');
      expect(result.latencyMs).toBe(0);
    });

    it('should truncate long prompts', () => {
      const longPrompt = 'x'.repeat(200);
      const result = createStubResponse(longPrompt);

      expect(result.content).toContain('...');
      expect(result.content).not.toContain(longPrompt);
    });

    it('should use custom model', () => {
      const result = createStubResponse('Test', { model: 'gemini-1.5-pro' });
      expect(result.model).toBe('gemini-1.5-pro');
    });
  });

  describe('convertToGeminiHistory', () => {
    it('should convert Claude-style messages to Gemini format', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' },
      ];

      const result = convertToGeminiHistory(messages);

      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there!' }] },
        { role: 'user', parts: [{ text: 'How are you?' }] },
      ]);
    });

    it('should filter out system messages', () => {
      const messages = [
        { role: 'system' as const, content: 'Be helpful' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = convertToGeminiHistory(messages);

      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
      ]);
    });
  });

  describe('extractSystemInstruction', () => {
    it('should extract system messages', () => {
      const messages = [
        { role: 'system' as const, content: 'Be helpful' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = extractSystemInstruction(messages);
      expect(result).toBe('Be helpful');
    });

    it('should concatenate multiple system messages', () => {
      const messages = [
        { role: 'system' as const, content: 'Be helpful' },
        { role: 'system' as const, content: 'Be concise' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = extractSystemInstruction(messages);
      expect(result).toBe('Be helpful\n\nBe concise');
    });

    it('should return undefined when no system messages', () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];

      const result = extractSystemInstruction(messages);
      expect(result).toBeUndefined();
    });
  });

  describe('Error classes', () => {
    it('GeminiNotConfiguredError should have correct name', () => {
      const error = new GeminiNotConfiguredError();
      expect(error.name).toBe('GeminiNotConfiguredError');
      expect(error.message).toContain('not configured');
    });

    it('GeminiTimeoutError should have correct name and message', () => {
      const error = new GeminiTimeoutError(5000);
      expect(error.name).toBe('GeminiTimeoutError');
      expect(error.message).toContain('5000ms');
    });

    it('GeminiApiError should include status code', () => {
      const error = new GeminiApiError('Error', 500, { detail: 'test' });
      expect(error.name).toBe('GeminiApiError');
      expect(error.statusCode).toBe(500);
      expect(error.details).toEqual({ detail: 'test' });
    });

    it('GeminiRateLimitError should include retry info', () => {
      const error = new GeminiRateLimitError('Rate limited', 10000);
      expect(error.name).toBe('GeminiRateLimitError');
      expect(error.statusCode).toBe(429);
      expect(error.retryAfterMs).toBe(10000);
    });
  });
});
