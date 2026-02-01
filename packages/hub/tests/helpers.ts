/**
 * Test helpers for integration testing hub routes
 */

import { FastifyInstance } from 'fastify';
import { vi } from 'vitest';
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

// ============= JWT Token Helpers =============

export async function createValidToken(
  sub: string,
  email?: string,
  options?: { role?: string; deviceApproved?: boolean }
): Promise<string> {
  const { signJwt } = await import('../src/services/trust.js');
  return signJwt({
    sub,
    email: email ?? `${sub}@test.com`,
    ...options,
  });
}

export async function createPowerUserToken(
  sub: string,
  email?: string
): Promise<string> {
  return createValidToken(sub, email, { role: 'power-user', deviceApproved: true });
}

export async function createExpiredToken(sub: string): Promise<string> {
  const { signJwt } = await import('../src/services/trust.js');
  return signJwt({ sub }, '-1h');
}

export async function createRefreshToken(sub: string, email?: string): Promise<string> {
  const { signJwt: sharedSignJwt } = await import('@mission-control/shared');
  const secret = process.env['JWT_SECRET'] ?? 'test-secret-key-for-jwt-signing-minimum-32-chars';
  return sharedSignJwt({ sub, email: email ?? `${sub}@test.com` }, secret, { type: 'refresh' });
}

// ============= Mock Factories =============

export function createConvexMocks() {
  const mockQuery = vi.fn();
  const mockMutation = vi.fn();
  const mockIsConfigured = vi.fn(() => false);
  return { mockQuery, mockMutation, mockIsConfigured };
}

export function createAuditMock() {
  return vi.fn(() => Promise.resolve());
}

// ============= Environment Setup =============

export function setupTestEnvironment(options?: {
  jwtSecret?: string;
  mockUsers?: Record<string, unknown>;
}) {
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'error';
  process.env['JWT_SECRET'] = options?.jwtSecret ??
    'test-secret-key-for-jwt-signing-minimum-32-chars';
  if (options?.mockUsers) {
    process.env['MOCK_USERS'] = JSON.stringify(options.mockUsers);
  }
}

// ============= Audit Assertion Helpers =============

export function findAuditCall(
  mockFn: ReturnType<typeof vi.fn>,
  action: string
): unknown[] | undefined {
  return mockFn.mock.calls.find(
    (call) => (call[0] as { action: string }).action === action
  );
}

export function getAuditDetails(call: unknown[]): Record<string, unknown> {
  return JSON.parse((call[0] as { details: string }).details);
}
