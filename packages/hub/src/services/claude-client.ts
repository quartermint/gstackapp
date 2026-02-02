/**
 * Claude CLI client service
 *
 * Provides integration with the Claude CLI for executing AI requests.
 * Supports both single-turn (--print) and multi-turn conversation modes.
 *
 * Features:
 * - Streaming responses via stdout events
 * - Conversation session management with --conversation flag
 * - Token counting and usage tracking
 * - Timeout support via AbortController
 * - Graceful degradation when CLI is not available
 */

import { spawn, ChildProcess } from 'child_process';
import { getLogger } from './logger.js';

/**
 * Options for Claude CLI execution
 */
export interface ClaudeClientOptions {
  /** Maximum tokens for response (default: 4096) */
  maxTokens?: number;
  /** Timeout in milliseconds (default: 120000) */
  timeout?: number;
  /** Conversation ID for multi-turn context */
  conversationId?: string;
  /** Enable streaming mode (default: false) */
  stream?: boolean;
  /** System prompt to prepend */
  systemPrompt?: string;
  /** Allowed tools for the agent */
  allowedTools?: readonly string[];
  /** Working directory for CLI execution */
  workingDirectory?: string;
}

/**
 * Response from Claude CLI execution
 */
export interface ClaudeResponse {
  /** Response content */
  content: string;
  /** Conversation ID for follow-up requests */
  conversationId?: string;
  /** Token usage statistics */
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
}

/**
 * Error thrown when Claude CLI is not available
 */
export class ClaudeCliNotFoundError extends Error {
  constructor(message: string = 'Claude CLI not found') {
    super(message);
    this.name = 'ClaudeCliNotFoundError';
  }
}

/**
 * Error thrown when CLI execution times out
 */
export class ClaudeCliTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Claude CLI execution timed out after ${timeoutMs}ms`);
    this.name = 'ClaudeCliTimeoutError';
  }
}

/**
 * Error thrown when CLI execution fails
 */
export class ClaudeCliExecutionError extends Error {
  public readonly exitCode: number | null;
  public readonly stderr: string;

  constructor(message: string, exitCode: number | null, stderr: string) {
    super(message);
    this.name = 'ClaudeCliExecutionError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * Default options for CLI execution
 */
const DEFAULT_OPTIONS: Required<Omit<ClaudeClientOptions, 'conversationId' | 'systemPrompt' | 'allowedTools' | 'workingDirectory'>> = {
  maxTokens: 4096,
  timeout: 120_000,
  stream: false,
};

/**
 * Cache for CLI availability check
 */
let cliAvailable: boolean | null = null;
let cliPath: string | null = null;

/**
 * Check if Claude CLI is available
 *
 * @returns Promise resolving to true if CLI is available
 */
export async function isClaudeCliAvailable(): Promise<boolean> {
  if (cliAvailable !== null) {
    return cliAvailable;
  }

  const logger = getLogger();

  try {
    const result = await new Promise<boolean>((resolve) => {
      const proc = spawn('which', ['claude']);
      let stdout = '';

      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          cliPath = stdout.trim();
          resolve(true);
        } else {
          resolve(false);
        }
      });

      proc.on('error', () => {
        resolve(false);
      });

      // Timeout for which command
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 5000);
    });

    cliAvailable = result;

    if (result) {
      logger.info({ cliPath }, 'Claude CLI found');
    } else {
      logger.warn('Claude CLI not found - AI features will use stub responses');
    }

    return result;
  } catch (error) {
    cliAvailable = false;
    logger.warn({ err: error }, 'Failed to check for Claude CLI');
    return false;
  }
}

/**
 * Reset CLI availability cache (for testing)
 */
export function resetCliCache(): void {
  cliAvailable = null;
  cliPath = null;
}

/**
 * Build CLI arguments from options
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @returns Array of CLI arguments
 */
function buildCliArgs(prompt: string, options: ClaudeClientOptions): string[] {
  const args: string[] = [];

  // Use --print for single-turn mode (non-streaming, non-conversation)
  if (!options.stream && !options.conversationId) {
    args.push('--print');
  }

  // Add conversation flag for multi-turn
  if (options.conversationId) {
    args.push('--conversation', options.conversationId);
  }

  // Note: Claude CLI doesn't support --max-tokens directly
  // Token limits are managed by the subscription/model

  // Add system prompt if specified
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }

  // Add allowed tools if specified
  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push('--allowedTools', options.allowedTools.join(','));
  }
  // Note: When allowedTools is empty, we don't pass --tools flag
  // The default --print mode has no tools enabled

  // Add the prompt as the final argument
  args.push(prompt);

  return args;
}

/**
 * Parse token usage from CLI output
 *
 * The Claude CLI outputs usage information in a specific format.
 * This function extracts token counts from the output.
 *
 * @param output - CLI output to parse
 * @returns Token usage information
 */
function parseTokenUsage(output: string): { promptTokens: number; completionTokens: number } {
  // Default values if parsing fails
  let promptTokens = 0;
  let completionTokens = 0;

  // Try to find token usage patterns in the output
  // Format may vary, common patterns:
  // "Tokens: 123 input, 456 output"
  // "Usage: prompt=123, completion=456"
  // Or JSON format in stderr

  const inputMatch = output.match(/(?:input|prompt)[:\s=]+(\d+)/i);
  const outputMatch = output.match(/(?:output|completion)[:\s=]+(\d+)/i);

  if (inputMatch && inputMatch[1]) {
    promptTokens = parseInt(inputMatch[1], 10);
  }

  if (outputMatch && outputMatch[1]) {
    completionTokens = parseInt(outputMatch[1], 10);
  }

  // If no match found, estimate based on content length
  // Rough estimation: ~4 characters per token
  if (promptTokens === 0 && completionTokens === 0) {
    completionTokens = Math.ceil(output.length / 4);
  }

  return { promptTokens, completionTokens };
}

/**
 * Parse conversation ID from CLI output
 *
 * @param output - CLI output or stderr
 * @returns Conversation ID if found
 */
function parseConversationId(output: string): string | undefined {
  // Look for conversation ID patterns
  // Format: "Conversation: abc123" or "conversation_id: abc123"
  const match = output.match(/conversation[_\s]?(?:id)?[:\s=]+([a-zA-Z0-9_-]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Execute Claude CLI and return the response
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @returns Promise resolving to Claude response
 * @throws ClaudeCliNotFoundError if CLI is not available
 * @throws ClaudeCliTimeoutError if execution times out
 * @throws ClaudeCliExecutionError if CLI returns an error
 */
export async function executeClaudeCli(
  prompt: string,
  options: ClaudeClientOptions = {}
): Promise<ClaudeResponse> {
  const logger = getLogger();
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check CLI availability
  const available = await isClaudeCliAvailable();
  if (!available) {
    throw new ClaudeCliNotFoundError(
      'Claude CLI is not installed or not in PATH. ' +
      'Install it from https://github.com/anthropics/claude-cli or use the API directly.'
    );
  }

  const args = buildCliArgs(prompt, opts);
  logger.debug({ args: ['claude', ...args.slice(0, -1), '[prompt]'] }, 'Executing Claude CLI');

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let killed = false;

    const proc = spawn('claude', args, {
      cwd: opts.workingDirectory,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Ensure CLI runs in non-interactive mode
        CI: 'true',
        TERM: 'dumb',
      },
    });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      // Force kill after 5 seconds if SIGTERM doesn't work
      setTimeout(() => {
        if (!proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }, opts.timeout);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (killed) {
        logger.warn({ durationMs, timeout: opts.timeout }, 'Claude CLI execution timed out');
        reject(new ClaudeCliTimeoutError(opts.timeout));
        return;
      }

      if (code !== 0) {
        logger.error({ code, stderr, durationMs }, 'Claude CLI execution failed');
        reject(new ClaudeCliExecutionError(
          `Claude CLI exited with code ${code}: ${stderr.trim() || 'Unknown error'}`,
          code,
          stderr
        ));
        return;
      }

      // Parse response
      const content = stdout.trim();
      const usage = parseTokenUsage(stderr || stdout);
      const conversationId = options.conversationId || parseConversationId(stderr);

      logger.info({
        durationMs,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        conversationId,
      }, 'Claude CLI execution completed');

      resolve({
        content,
        conversationId,
        usage,
      });
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      logger.error({ err: error }, 'Claude CLI spawn error');

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new ClaudeCliNotFoundError(
          'Claude CLI executable not found. Ensure "claude" is in your PATH.'
        ));
      } else {
        reject(new ClaudeCliExecutionError(
          `Failed to spawn Claude CLI: ${error.message}`,
          null,
          ''
        ));
      }
    });
  });
}

/**
 * Stream Claude CLI response
 *
 * Yields chunks of the response as they become available from stdout.
 * Returns the final ClaudeResponse when complete.
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @yields String chunks as they arrive
 * @returns Final ClaudeResponse with complete content and usage
 * @throws ClaudeCliNotFoundError if CLI is not available
 * @throws ClaudeCliTimeoutError if execution times out
 * @throws ClaudeCliExecutionError if CLI returns an error
 */
export async function* streamClaudeCli(
  prompt: string,
  options: ClaudeClientOptions = {}
): AsyncGenerator<string, ClaudeResponse, unknown> {
  const logger = getLogger();
  const opts = { ...DEFAULT_OPTIONS, ...options, stream: true };

  // Check CLI availability
  const available = await isClaudeCliAvailable();
  if (!available) {
    throw new ClaudeCliNotFoundError(
      'Claude CLI is not installed or not in PATH. ' +
      'Install it from https://github.com/anthropics/claude-cli or use the API directly.'
    );
  }

  const args = buildCliArgs(prompt, opts);
  logger.debug({ args: ['claude', ...args.slice(0, -1), '[prompt]'] }, 'Streaming Claude CLI');

  const startTime = Date.now();
  let fullContent = '';
  let stderr = '';
  let proc: ChildProcess | null = null;
  let killed = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Create a promise that will be used to signal completion
  let resolveComplete: (value: ClaudeResponse) => void;
  let rejectComplete: (error: Error) => void;
  const completePromise = new Promise<ClaudeResponse>((resolve, reject) => {
    resolveComplete = resolve;
    rejectComplete = reject;
  });

  // Create an async queue for chunks
  const chunks: string[] = [];
  let chunkResolve: (() => void) | null = null;
  let isDone = false;
  let error: Error | null = null;

  const pushChunk = (chunk: string): void => {
    chunks.push(chunk);
    if (chunkResolve) {
      const resolve = chunkResolve;
      chunkResolve = null;
      resolve();
    }
  };

  const waitForChunk = (): Promise<void> => {
    if (chunks.length > 0 || isDone) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      chunkResolve = resolve;
    });
  };

  // Start the process
  proc = spawn('claude', args, {
    cwd: opts.workingDirectory,
    env: {
      ...process.env,
      CI: 'true',
      TERM: 'dumb',
    },
  });

  // Set up timeout
  timeoutId = setTimeout(() => {
    killed = true;
    if (proc) {
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (proc && !proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 5000);
    }
  }, opts.timeout);

  proc.stdout?.on('data', (data: Buffer) => {
    const chunk = data.toString();
    fullContent += chunk;
    pushChunk(chunk);
  });

  proc.stderr?.on('data', (data: Buffer) => {
    stderr += data.toString();
  });

  proc.on('close', (code) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    const durationMs = Date.now() - startTime;

    if (killed) {
      error = new ClaudeCliTimeoutError(opts.timeout);
      isDone = true;
      if (chunkResolve) {
        chunkResolve();
      }
      rejectComplete(error);
      return;
    }

    if (code !== 0) {
      error = new ClaudeCliExecutionError(
        `Claude CLI exited with code ${code}: ${stderr.trim() || 'Unknown error'}`,
        code,
        stderr
      );
      isDone = true;
      if (chunkResolve) {
        chunkResolve();
      }
      rejectComplete(error);
      return;
    }

    // Parse final response
    const usage = parseTokenUsage(stderr || fullContent);
    const conversationId = options.conversationId || parseConversationId(stderr);

    logger.info({
      durationMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      conversationId,
    }, 'Claude CLI streaming completed');

    isDone = true;
    if (chunkResolve) {
      chunkResolve();
    }

    resolveComplete({
      content: fullContent.trim(),
      conversationId,
      usage,
    });
  });

  proc.on('error', (err) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    logger.error({ err }, 'Claude CLI spawn error during streaming');

    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      error = new ClaudeCliNotFoundError(
        'Claude CLI executable not found. Ensure "claude" is in your PATH.'
      );
    } else {
      error = new ClaudeCliExecutionError(
        `Failed to spawn Claude CLI: ${err.message}`,
        null,
        ''
      );
    }
    isDone = true;
    if (chunkResolve) {
      chunkResolve();
    }
    rejectComplete(error);
  });

  // Yield chunks as they arrive
  try {
    while (!isDone || chunks.length > 0) {
      await waitForChunk();

      if (error) {
        throw error;
      }

      while (chunks.length > 0) {
        const chunk = chunks.shift();
        if (chunk) {
          yield chunk;
        }
      }
    }

    // Return the final response
    return await completePromise;
  } catch (err) {
    // Clean up if iteration is aborted
    if (proc && !proc.killed) {
      proc.kill('SIGTERM');
    }
    throw err;
  }
}

/**
 * Create a stub response for when CLI is not available
 *
 * Used in development/testing environments where the CLI is not installed.
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @returns Stub response
 */
export function createStubResponse(
  prompt: string,
  options: ClaudeClientOptions = {}
): ClaudeResponse {
  const content = `[STUB RESPONSE - Claude CLI not available]

Your message: "${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}"

This is a placeholder response. In production, this would be generated by Claude via the CLI.
Install the Claude CLI to enable real AI responses.`;

  return {
    content,
    conversationId: options.conversationId || crypto.randomUUID(),
    usage: {
      promptTokens: Math.ceil(prompt.length / 4),
      completionTokens: Math.ceil(content.length / 4),
    },
  };
}

/**
 * Execute Claude CLI with fallback to stub response
 *
 * This is a convenience function that gracefully degrades to stub responses
 * when the CLI is not available (useful for CI/testing).
 *
 * @param prompt - The user prompt
 * @param options - Execution options
 * @returns Promise resolving to Claude response (real or stub)
 */
export async function executeClaudeCliWithFallback(
  prompt: string,
  options: ClaudeClientOptions = {}
): Promise<ClaudeResponse> {
  const logger = getLogger();

  try {
    return await executeClaudeCli(prompt, options);
  } catch (error) {
    if (error instanceof ClaudeCliNotFoundError) {
      logger.debug('Claude CLI not available, using stub response');
      return createStubResponse(prompt, options);
    }
    throw error;
  }
}
