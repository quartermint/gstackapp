/**
 * Gemini API Client Service
 *
 * Provides direct API integration with Google's Gemini models.
 * Used as an alternative to Claude CLI for A/B testing and failover.
 *
 * Features:
 * - Direct HTTPS API calls (no CLI dependency)
 * - Streaming support via Server-Sent Events
 * - Token counting and usage tracking
 * - Automatic retry with exponential backoff
 * - Graceful degradation when API is unavailable
 *
 * Model: gemini-2.0-flash (fast, cost-effective for simple requests)
 */

import { getLogger } from './logger.js';

/**
 * Gemini API configuration
 */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL = 'gemini-2.0-flash';

/**
 * Options for Gemini API execution
 */
export interface GeminiClientOptions {
  /** Model to use (default: gemini-2.0-flash) */
  model?: string;
  /** Maximum tokens for response */
  maxOutputTokens?: number;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Temperature for response randomness (0-2, default: 1) */
  temperature?: number;
  /** System instruction to prepend */
  systemInstruction?: string;
  /** Conversation history for multi-turn */
  history?: GeminiMessage[];
  /** Enable streaming mode */
  stream?: boolean;
}

/**
 * Gemini message format
 */
export interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

/**
 * Response from Gemini API execution
 */
export interface GeminiResponse {
  /** Response content */
  content: string;
  /** Model used */
  model: string;
  /** Token usage statistics */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Response latency in milliseconds */
  latencyMs: number;
  /** Finish reason */
  finishReason?: string;
}

/**
 * Error thrown when Gemini API key is not configured
 */
export class GeminiNotConfiguredError extends Error {
  constructor(message: string = 'Gemini API key not configured') {
    super(message);
    this.name = 'GeminiNotConfiguredError';
  }
}

/**
 * Error thrown when API request times out
 */
export class GeminiTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gemini API request timed out after ${timeoutMs}ms`);
    this.name = 'GeminiTimeoutError';
  }
}

/**
 * Error thrown when API returns an error
 */
export class GeminiApiError extends Error {
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'GeminiApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Error thrown when rate limited
 */
export class GeminiRateLimitError extends GeminiApiError {
  public readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message, 429);
    this.name = 'GeminiRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<GeminiClientOptions, 'systemInstruction' | 'history' | 'stream'>> = {
  model: DEFAULT_MODEL,
  maxOutputTokens: 8192,
  timeout: 60_000,
  temperature: 1,
};

/**
 * Cache for API key availability
 */
let apiKeyConfigured: boolean | null = null;

/**
 * Check if Gemini API is configured
 */
export function isGeminiConfigured(): boolean {
  if (apiKeyConfigured !== null) {
    return apiKeyConfigured;
  }

  apiKeyConfigured = !!process.env['GEMINI_API_KEY'];

  const logger = getLogger();
  if (apiKeyConfigured) {
    logger.info('Gemini API configured');
  } else {
    logger.warn('Gemini API not configured - GEMINI_API_KEY not set');
  }

  return apiKeyConfigured;
}

/**
 * Reset configuration cache (for testing)
 */
export function resetGeminiCache(): void {
  apiKeyConfigured = null;
}

/**
 * Get the API key from environment
 */
function getApiKey(): string {
  const key = process.env['GEMINI_API_KEY'];
  if (!key) {
    throw new GeminiNotConfiguredError(
      'GEMINI_API_KEY environment variable is required for Gemini API access'
    );
  }
  return key;
}

/**
 * Get the model to use
 */
function getModel(options: GeminiClientOptions): string {
  return options.model || process.env['GEMINI_MODEL'] || DEFAULT_MODEL;
}

/**
 * Build the API URL for a model endpoint
 */
function buildApiUrl(model: string, stream: boolean = false): string {
  const endpoint = stream ? 'streamGenerateContent' : 'generateContent';
  return `${GEMINI_API_BASE}/models/${model}:${endpoint}`;
}

/**
 * Convert conversation history to Gemini format
 */
function buildContents(
  prompt: string,
  history?: GeminiMessage[]
): GeminiMessage[] {
  const contents: GeminiMessage[] = [];

  // Add history if provided
  if (history && history.length > 0) {
    contents.push(...history);
  }

  // Add current user message
  contents.push({
    role: 'user',
    parts: [{ text: prompt }],
  });

  return contents;
}

/**
 * Build the request body for Gemini API
 */
function buildRequestBody(
  prompt: string,
  options: GeminiClientOptions
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    contents: buildContents(prompt, options.history),
    generationConfig: {
      maxOutputTokens: options.maxOutputTokens || DEFAULT_OPTIONS.maxOutputTokens,
      temperature: options.temperature ?? DEFAULT_OPTIONS.temperature,
    },
  };

  // Add system instruction if provided
  if (options.systemInstruction) {
    body['systemInstruction'] = {
      parts: [{ text: options.systemInstruction }],
    };
  }

  return body;
}

/**
 * Parse the Gemini API response
 */
function parseResponse(
  data: unknown,
  model: string,
  latencyMs: number
): GeminiResponse {
  const response = data as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
      finishReason?: string;
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    };
  };

  // Extract content from first candidate
  const candidate = response.candidates?.[0];
  const content = candidate?.content?.parts
    ?.map((part) => part.text || '')
    .join('') || '';

  // Extract usage metadata
  const usage = response.usageMetadata || {};

  return {
    content,
    model,
    usage: {
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
    },
    latencyMs,
    finishReason: candidate?.finishReason,
  };
}

/**
 * Execute a request to the Gemini API
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @returns Promise resolving to Gemini response
 * @throws GeminiNotConfiguredError if API key is not set
 * @throws GeminiTimeoutError if request times out
 * @throws GeminiApiError if API returns an error
 * @throws GeminiRateLimitError if rate limited
 */
export async function executeGemini(
  prompt: string,
  options: GeminiClientOptions = {}
): Promise<GeminiResponse> {
  const logger = getLogger();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  // Check configuration
  if (!isGeminiConfigured()) {
    throw new GeminiNotConfiguredError();
  }

  const apiKey = getApiKey();
  const model = getModel(opts);
  const url = `${buildApiUrl(model)}?key=${apiKey}`;

  logger.debug({ model, promptLength: prompt.length }, 'Executing Gemini API request');

  // Build request
  const body = buildRequestBody(prompt, opts);

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, opts.timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    // Handle errors
    if (!response.ok) {
      const errorBody = await response.text();
      let errorData: unknown;
      try {
        errorData = JSON.parse(errorBody);
      } catch {
        errorData = errorBody;
      }

      // Check for rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;
        throw new GeminiRateLimitError(
          `Gemini API rate limited: ${errorBody}`,
          retryAfterMs
        );
      }

      throw new GeminiApiError(
        `Gemini API error (${response.status}): ${errorBody}`,
        response.status,
        errorData
      );
    }

    // Parse response
    const data = await response.json();
    const result = parseResponse(data, model, latencyMs);

    logger.info({
      model,
      latencyMs,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      finishReason: result.finishReason,
    }, 'Gemini API request completed');

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    // Handle abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn({ latencyMs, timeout: opts.timeout }, 'Gemini API request timed out');
      throw new GeminiTimeoutError(opts.timeout);
    }

    // Re-throw known errors
    if (
      error instanceof GeminiNotConfiguredError ||
      error instanceof GeminiTimeoutError ||
      error instanceof GeminiApiError
    ) {
      throw error;
    }

    // Wrap unknown errors
    logger.error({ error, latencyMs }, 'Gemini API request failed');
    throw new GeminiApiError(
      `Gemini API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      0,
      error
    );
  }
}

/**
 * Execute Gemini API with automatic retry on transient failures
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @param maxRetries - Maximum retry attempts (default: 3)
 * @returns Promise resolving to Gemini response
 */
export async function executeGeminiWithRetry(
  prompt: string,
  options: GeminiClientOptions = {},
  maxRetries: number = 3
): Promise<GeminiResponse> {
  const logger = getLogger();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await executeGemini(prompt, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on configuration errors
      if (error instanceof GeminiNotConfiguredError) {
        throw error;
      }

      // Don't retry on client errors (4xx except 429)
      if (error instanceof GeminiApiError && error.statusCode >= 400 && error.statusCode < 500) {
        if (!(error instanceof GeminiRateLimitError)) {
          throw error;
        }
      }

      // Calculate backoff
      let delayMs = Math.min(1000 * Math.pow(2, attempt), 10000);

      // Use Retry-After header if rate limited
      if (error instanceof GeminiRateLimitError && error.retryAfterMs) {
        delayMs = Math.min(error.retryAfterMs, 30000);
      }

      if (attempt < maxRetries) {
        logger.warn({
          attempt: attempt + 1,
          maxRetries,
          delayMs,
          error: lastError.message,
        }, 'Gemini API request failed, retrying');

        await sleep(delayMs);
      }
    }
  }

  throw lastError || new Error('Gemini API request failed after retries');
}

/**
 * Execute Gemini with fallback to stub response
 *
 * Gracefully degrades when Gemini API is not available.
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @returns Promise resolving to Gemini response (real or stub)
 */
export async function executeGeminiWithFallback(
  prompt: string,
  options: GeminiClientOptions = {}
): Promise<GeminiResponse> {
  const logger = getLogger();

  try {
    return await executeGeminiWithRetry(prompt, options);
  } catch (error) {
    if (error instanceof GeminiNotConfiguredError) {
      logger.debug('Gemini API not configured, using stub response');
      return createStubResponse(prompt, options);
    }
    throw error;
  }
}

/**
 * Create a stub response for when API is not available
 */
export function createStubResponse(
  prompt: string,
  options: GeminiClientOptions = {}
): GeminiResponse {
  const model = getModel(options);
  const content = `[STUB RESPONSE - Gemini API not available]

Your message: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"

This is a placeholder response. Configure GEMINI_API_KEY to enable real Gemini responses.`;

  return {
    content,
    model,
    usage: {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(content.length / 4),
      totalTokens: Math.ceil((prompt.length + content.length) / 4),
    },
    latencyMs: 0,
    finishReason: 'STUB',
  };
}

/**
 * Stream Gemini API response
 *
 * Yields chunks of the response as they arrive via Server-Sent Events.
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @yields String chunks as they arrive
 * @returns Final GeminiResponse with complete content and usage
 */
export async function* streamGemini(
  prompt: string,
  options: GeminiClientOptions = {}
): AsyncGenerator<string, GeminiResponse, unknown> {
  const logger = getLogger();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();

  // Check configuration
  if (!isGeminiConfigured()) {
    throw new GeminiNotConfiguredError();
  }

  const apiKey = getApiKey();
  const model = getModel(opts);
  const url = `${buildApiUrl(model, true)}?key=${apiKey}&alt=sse`;

  logger.debug({ model, promptLength: prompt.length }, 'Starting Gemini streaming request');

  const body = buildRequestBody(prompt, opts);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, opts.timeout);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorBody = await response.text();
      throw new GeminiApiError(
        `Gemini API error (${response.status}): ${errorBody}`,
        response.status
      );
    }

    if (!response.body) {
      clearTimeout(timeoutId);
      throw new GeminiApiError('No response body for streaming', 0);
    }

    let fullContent = '';
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: string | undefined;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process SSE lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data) as {
                candidates?: Array<{
                  content?: { parts?: Array<{ text?: string }> };
                  finishReason?: string;
                }>;
                usageMetadata?: {
                  promptTokenCount?: number;
                  candidatesTokenCount?: number;
                  totalTokenCount?: number;
                };
              };

              // Extract text chunk
              const chunk = parsed.candidates?.[0]?.content?.parts
                ?.map((p) => p.text || '')
                .join('') || '';

              if (chunk) {
                fullContent += chunk;
                yield chunk;
              }

              // Update finish reason
              if (parsed.candidates?.[0]?.finishReason) {
                finishReason = parsed.candidates[0].finishReason;
              }

              // Update usage (usually only in final message)
              if (parsed.usageMetadata) {
                usage = {
                  promptTokens: parsed.usageMetadata.promptTokenCount || 0,
                  completionTokens: parsed.usageMetadata.candidatesTokenCount || 0,
                  totalTokens: parsed.usageMetadata.totalTokenCount || 0,
                };
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    logger.info({
      model,
      latencyMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      finishReason,
    }, 'Gemini streaming request completed');

    return {
      content: fullContent,
      model,
      usage,
      latencyMs,
      finishReason,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeminiTimeoutError(opts.timeout);
    }

    throw error;
  }
}

/**
 * Convert Claude-style messages to Gemini format
 *
 * Utility for adapting existing conversation history.
 */
export function convertToGeminiHistory(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): GeminiMessage[] {
  return messages
    .filter((m) => m.role !== 'system') // System messages go in systemInstruction
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

/**
 * Extract system message from conversation history
 */
export function extractSystemInstruction(
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): string | undefined {
  const systemMessages = messages.filter((m) => m.role === 'system');
  if (systemMessages.length === 0) {
    return undefined;
  }
  return systemMessages.map((m) => m.content).join('\n\n');
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Export for testing
 */
export const __testing = {
  buildContents,
  buildRequestBody,
  parseResponse,
  buildApiUrl,
  DEFAULT_MODEL,
  GEMINI_API_BASE,
};
