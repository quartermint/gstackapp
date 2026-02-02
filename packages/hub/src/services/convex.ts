/**
 * Convex client initialization and management
 *
 * Provides a singleton ConvexHttpClient for serverless/edge environments.
 * Uses CONVEX_URL environment variable for configuration.
 */

import { ConvexHttpClient } from 'convex/browser';
import { FunctionReference, anyApi } from 'convex/server';

/**
 * Singleton ConvexHttpClient instance
 */
let convexClient: ConvexHttpClient | null = null;

/**
 * Get or create the Convex client instance
 *
 * @throws Error if CONVEX_URL environment variable is not set
 */
export function getConvexClient(): ConvexHttpClient {
  if (convexClient) {
    return convexClient;
  }

  const convexUrl = process.env['CONVEX_URL'];

  if (!convexUrl) {
    throw new Error(
      'CONVEX_URL environment variable is required for Convex integration'
    );
  }

  convexClient = new ConvexHttpClient(convexUrl);
  return convexClient;
}

/**
 * Check if Convex is configured (CONVEX_URL is set)
 */
export function isConvexConfigured(): boolean {
  return !!process.env['CONVEX_URL'];
}

/**
 * Reset the Convex client (useful for testing)
 */
export function resetConvexClient(): void {
  convexClient = null;
}

/**
 * Type-safe function references for Convex API
 *
 * These match the functions defined in the Convex backend.
 * The anyApi provides runtime access to Convex functions.
 */
export const api = anyApi as unknown as {
  conversations: {
    create: FunctionReference<
      'mutation',
      'public',
      {
        title?: string;
        userId?: string;
        trustLevel: 'internal' | 'authenticated' | 'untrusted';
        agentProfile: 'chat-readonly' | 'code-assistant' | 'task-orchestrator';
      },
      string
    >;
    get: FunctionReference<'query', 'public', { id: string }, unknown>;
    list: FunctionReference<
      'query',
      'public',
      { limit?: number },
      unknown[]
    >;
    update: FunctionReference<
      'mutation',
      'public',
      {
        id: string;
        title?: string;
        trustLevel?: 'internal' | 'authenticated' | 'untrusted';
        agentProfile?: 'chat-readonly' | 'code-assistant' | 'task-orchestrator';
      },
      string
    >;
  };
  messages: {
    create: FunctionReference<
      'mutation',
      'public',
      { conversationId: string; role: 'user' | 'assistant' | 'system'; content: string },
      string
    >;
    listByConversation: FunctionReference<
      'query',
      'public',
      { conversationId: string; limit?: number; cursor?: string },
      { messages: unknown[]; total: number; nextCursor?: string }
    >;
  };
  // NOTE: users module is defined for type compatibility but does not exist in Convex yet.
  // User routes will fail at runtime until convex/convex/users.ts is implemented.
  users: {
    get: FunctionReference<'query', 'public', { id: string }, unknown>;
    getByEmail: FunctionReference<'query', 'public', { email: string }, unknown>;
    upsert: FunctionReference<
      'mutation',
      'public',
      {
        id: string;
        email: string;
        name?: string;
        avatarUrl?: string;
        preferences?: Record<string, unknown>;
        isPowerUser?: boolean;
        deviceApproved?: boolean;
      },
      string
    >;
    updatePreferences: FunctionReference<
      'mutation',
      'public',
      { id: string; preferences: Record<string, unknown> },
      string
    >;
  };
  tasks: {
    create: FunctionReference<
      'mutation',
      'public',
      { requestId: string; command: string; priority?: number },
      string
    >;
    get: FunctionReference<'query', 'public', { id: string }, unknown>;
    listByStatus: FunctionReference<
      'query',
      'public',
      { status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'; limit?: number },
      unknown[]
    >;
    listDeadLetter: FunctionReference<
      'query',
      'public',
      { limit?: number },
      unknown[]
    >;
    updateStatus: FunctionReference<
      'mutation',
      'public',
      {
        id: string;
        status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
        result?: string;
      },
      string
    >;
    updatePriority: FunctionReference<
      'mutation',
      'public',
      { id: string; priority: number },
      string
    >;
    assignToNode: FunctionReference<
      'mutation',
      'public',
      { id: string; nodeId: string },
      string
    >;
    retryFromDeadLetter: FunctionReference<
      'mutation',
      'public',
      { id: string },
      string
    >;
  };
  nodes: {
    upsert: FunctionReference<
      'mutation',
      'public',
      {
        hostname: string;
        status: 'online' | 'offline' | 'busy';
        load: number;
        activeTasks: number;
        capabilities: string[];
        tailscaleIp?: string;
      },
      string
    >;
    get: FunctionReference<'query', 'public', { hostname: string }, unknown>;
    listOnline: FunctionReference<'query', 'public', Record<string, never>, unknown[]>;
    markOffline: FunctionReference<
      'mutation',
      'public',
      { hostname: string },
      string
    >;
  };
  auditLog: {
    log: FunctionReference<
      'mutation',
      'public',
      {
        requestId: string;
        action: string;
        details?: string;
        sourceIp?: string;
        userId?: string;
      },
      string
    >;
    queryByRequestId: FunctionReference<
      'query',
      'public',
      { requestId: string; limit?: number },
      { logs: unknown[]; count: number; requestId: string }
    >;
    listByTimestamp: FunctionReference<
      'query',
      'public',
      { startTime?: number; endTime?: number; limit?: number; cursor?: string },
      { logs: unknown[]; nextCursor: string | null }
    >;
    queryByTimeRange: FunctionReference<
      'query',
      'public',
      {
        startTime: number;
        endTime: number;
        limit?: number;
        offset?: number;
        action?: string;
      },
      {
        logs: unknown[];
        count: number;
        timeRange: { start: string; end: string };
        actionCounts: Record<string, number>;
        hasMore: boolean;
      }
    >;
    search: FunctionReference<
      'query',
      'public',
      { startTime: number; endTime: number; action?: string; limit?: number },
      {
        logs: unknown[];
        count: number;
        timeRange: { start: string; end: string };
        actionCounts: Record<string, number>;
      }
    >;
    export_: FunctionReference<
      'query',
      'public',
      { startTime: number; endTime: number; limit?: number },
      {
        logs: unknown[];
        count: number;
        timeRange: { start: string; end: string };
        exportedAt: string;
      }
    >;
    getByRequestId: FunctionReference<
      'query',
      'public',
      { requestId: string },
      {
        logs: unknown[];
        count: number;
        requestId: string;
        timeline: {
          start: string;
          end: string;
          durationMs: number;
          eventCount: number;
          actions: Array<{ action: string; timestamp: string; relativeMs: number }>;
        } | null;
      }
    >;
    getRecentErrors: FunctionReference<
      'query',
      'public',
      { limit?: number; sinceTimestamp?: number },
      {
        errors: unknown[];
        count: number;
        totalInPeriod: number;
        byAction: Record<string, number>;
        since: string;
      }
    >;
    getStats: FunctionReference<
      'query',
      'public',
      { periodMs?: number },
      {
        total: number;
        period: { ms: number; since: string };
        ratePerMinute: number;
        byAction: Record<string, number>;
        uniqueUsers: number;
        uniqueIps: number;
        topUsers: Array<{ userId: string; count: number }>;
        topIps: Array<{ ip: string; count: number }>;
      }
    >;
  };
};
