/**
 * Test helpers for integration testing hub routes
 */

import { FastifyInstance } from 'fastify';
import { createServer } from '../src/server.js';

/**
 * Create a test server instance
 * This creates a fully configured Fastify instance without starting it
 */
export async function createTestServer(): Promise<FastifyInstance> {
  // Set test environment
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'error';

  const server = await createServer();

  // Wait for server to be ready
  await server.ready();

  return server;
}

/**
 * Close a test server instance
 */
export async function closeTestServer(server: FastifyInstance): Promise<void> {
  await server.close();
}

/**
 * Create a test request with default headers
 */
export function createTestRequest(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  options?: {
    body?: unknown;
    headers?: Record<string, string>;
    query?: Record<string, string>;
  }
): {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  payload?: string;
  query?: Record<string, string>;
} {
  const defaultHeaders: Record<string, string> = {
    'content-type': 'application/json',
    'x-request-id': `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };

  return {
    method,
    url,
    headers: { ...defaultHeaders, ...options?.headers },
    ...(options?.body && { payload: JSON.stringify(options.body) }),
    ...(options?.query && { query: options.query }),
  };
}

/**
 * Sample test fixtures
 */
export const fixtures = {
  validChatRequest: {
    message: 'Hello, how are you?',
  },
  validChatRequestWithConversation: {
    message: 'Continue our conversation',
    conversationId: '550e8400-e29b-41d4-a716-446655440000',
  },
  validChatRequestWithHistory: {
    message: 'What did we discuss?',
    history: [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
    ],
  },
  invalidChatRequest: {
    // Missing required message field
  },
  injectionAttempt: {
    message: "'; DROP TABLE users; --",
  },
};
