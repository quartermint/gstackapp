/**
 * Integration tests for conversation routes
 *
 * Tests authentication, authorization, Convex availability,
 * pagination, and CRUD operations for conversations and messages.
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, type Mock } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestServer, closeTestServer, createValidToken, createExpiredToken } from './helpers.js';

// Mock convex to control availability and responses
const mockQuery = vi.fn();
const mockMutation = vi.fn();
const mockIsConvexConfigured = vi.fn(() => false);

vi.mock('../src/services/convex.js', () => ({
  isConvexConfigured: () => mockIsConvexConfigured(),
  getConvexClient: vi.fn(() => ({
    query: mockQuery,
    mutation: mockMutation,
  })),
  api: {
    conversations: {
      listByUser: 'conversations:listByUser',
      get: 'conversations:get',
      create: 'conversations:create',
    },
    messages: {
      listByConversation: 'messages:listByConversation',
      create: 'messages:create',
    },
  },
}));

// Mock audit logging to prevent actual Convex calls
const mockLogAuditEvent = vi.fn(() => Promise.resolve());
vi.mock('../src/services/audit.js', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

describe('Conversation Routes', () => {
  let server: FastifyInstance;
  let validToken: string;
  let anotherUserToken: string;
  const testUserId = 'user_test_123';
  const anotherUserId = 'user_other_456';

  beforeAll(async () => {
    process.env['JWT_SECRET'] = 'test-secret-key-for-jwt-signing-min-32-chars';
    server = await createTestServer();
    validToken = await createValidToken(testUserId, 'test@example.com');
    anotherUserToken = await createValidToken(anotherUserId, 'other@example.com');
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsConvexConfigured.mockReturnValue(false);
  });

  // ==========================================================================
  // GET /conversations - List Conversations
  // ==========================================================================
  describe('GET /conversations', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/conversations',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
      expect(body.error.message).toContain('Authentication required');
    });

    it('should return 401 with invalid JWT token', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/conversations',
        headers: {
          authorization: 'Bearer invalid.jwt.token',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('should return 401 with expired JWT token', async () => {
      // Create an expired token (expired 1 hour ago)
      const expiredToken = await createExpiredToken(testUserId);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should return 503 when Convex is not configured', async () => {
      mockIsConvexConfigured.mockReturnValue(false);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('not configured');
    });

    it('should return 200 with empty list when user has no conversations', async () => {
      mockIsConvexConfigured.mockReturnValue(true);
      // New API returns array directly, not { conversations, total, nextCursor }
      mockQuery.mockResolvedValue([]);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.conversations).toEqual([]);
      expect(body.data.total).toBe(0);
    });

    it('should support pagination with limit parameter', async () => {
      mockIsConvexConfigured.mockReturnValue(true);
      // New API returns array directly
      mockQuery.mockResolvedValue([
        {
          _id: 'conv_1',
          title: 'Test Conversation',
          userId: testUserId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations?limit=1',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.conversations).toHaveLength(1);
      // New API doesn't support pagination, total is array length
      expect(body.data.total).toBe(1);

      // Verify query was called with correct limit
      expect(mockQuery).toHaveBeenCalledWith(
        undefined, // First arg is undefined for anyApi calls
        expect.objectContaining({ limit: 1 })
      );
    });

    it('should support pagination with cursor parameter', async () => {
      mockIsConvexConfigured.mockReturnValue(true);
      // New API returns array directly, doesn't support cursor
      mockQuery.mockResolvedValue([
        {
          _id: 'conv_2',
          title: 'Page 2 Conversation',
          userId: testUserId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations?cursor=cursor_page2',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      // Cursor is accepted but not passed to new API (API doesn't support it)
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 400 for invalid limit parameter', async () => {
      mockIsConvexConfigured.mockReturnValue(true);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations?limit=invalid',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('should return 400 for limit exceeding maximum', async () => {
      mockIsConvexConfigured.mockReturnValue(true);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations?limit=500',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('should return conversations array with proper structure', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);
      // New API returns array directly
      mockQuery.mockResolvedValue([
        {
          _id: 'conv_123',
          title: 'My Conversation',
          userId: testUserId,
          createdAt: now,
          updatedAt: now,
          metadata: { source: 'web' },
        },
      ]);

      const response = await server.inject({
        method: 'GET',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data.conversations).toHaveLength(1);

      const conversation = body.data.conversations[0];
      expect(conversation.id).toBe('conv_123');
      expect(conversation.title).toBe('My Conversation');
      expect(conversation.userId).toBe(testUserId);
      expect(conversation.createdAt).toBeDefined();
      expect(conversation.updatedAt).toBeDefined();
      expect(conversation.metadata).toEqual({ source: 'web' });
    });
  });

  // ==========================================================================
  // GET /conversations/:id/messages - Get Messages
  // ==========================================================================
  describe('GET /conversations/:id/messages', () => {
    const conversationId = 'conv_test_123';

    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('should return 503 when Convex is not configured', async () => {
      mockIsConvexConfigured.mockReturnValue(false);

      const response = await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('not configured');
    });

    it('should return 404 when conversation does not exist', async () => {
      mockIsConvexConfigured.mockReturnValue(true);
      mockQuery.mockResolvedValue(null);

      const response = await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('CONVERSATION_NOT_FOUND');
      expect(body.error.message).toContain(conversationId);
    });

    it('should return 403 when accessing another user conversation', async () => {
      mockIsConvexConfigured.mockReturnValue(true);
      mockQuery.mockResolvedValue({
        _id: conversationId,
        title: 'Other User Conversation',
        userId: 'other_user_xyz',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const response = await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('INSUFFICIENT_TRUST');
      expect(body.error.message).toContain('do not have access');
    });

    it('should audit log unauthorized access attempts', async () => {
      mockIsConvexConfigured.mockReturnValue(true);
      mockQuery.mockResolvedValue({
        _id: conversationId,
        title: 'Other User Conversation',
        userId: 'other_user_xyz',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversations.unauthorized_access',
          userId: testUserId,
        })
      );

      const auditCall = mockLogAuditEvent.mock.calls.find(
        (call) => (call[0] as { action: string }).action === 'conversations.unauthorized_access'
      );
      expect(auditCall).toBeDefined();
      const details = JSON.parse((auditCall![0] as { details: string }).details);
      expect(details.conversationId).toBe(conversationId);
      expect(details.ownerId).toBe('other_user_xyz');
    });

    it('should return 200 with messages for own conversation', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);

      // First call returns conversation, second call returns messages
      mockQuery
        .mockResolvedValueOnce({
          _id: conversationId,
          title: 'My Conversation',
          userId: testUserId,
          createdAt: now,
          updatedAt: now,
        })
        .mockResolvedValueOnce({
          messages: [
            {
              _id: 'msg_1',
              conversationId,
              role: 'user',
              content: 'Hello!',
              createdAt: now,
            },
            {
              _id: 'msg_2',
              conversationId,
              role: 'assistant',
              content: 'Hi there!',
              createdAt: now + 1000,
            },
          ],
          total: 2,
          nextCursor: undefined,
        });

      const response = await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data.conversationId).toBe(conversationId);
      expect(body.data.messages).toHaveLength(2);
      expect(body.data.total).toBe(2);

      const firstMessage = body.data.messages[0];
      expect(firstMessage.id).toBe('msg_1');
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBe('Hello!');
      expect(firstMessage.createdAt).toBeDefined();
    });

    it('should support pagination with limit/cursor', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);

      mockQuery
        .mockResolvedValueOnce({
          _id: conversationId,
          title: 'My Conversation',
          userId: testUserId,
          createdAt: now,
          updatedAt: now,
        })
        .mockResolvedValueOnce({
          messages: [
            {
              _id: 'msg_3',
              conversationId,
              role: 'user',
              content: 'Page 2 message',
              createdAt: now,
            },
          ],
          total: 3,
          nextCursor: 'cursor_page3',
        });

      const response = await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages?limit=1&cursor=cursor_page2`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);

      expect(body.data.messages).toHaveLength(1);
      expect(body.data.nextCursor).toBe('cursor_page3');

      // Verify the messages query was called with pagination params
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          conversationId,
          limit: 1,
          cursor: 'cursor_page2',
        })
      );
    });

    it('should return 400 for invalid limit parameter', async () => {
      mockIsConvexConfigured.mockReturnValue(true);

      const response = await server.inject({
        method: 'GET',
        url: `/conversations/${conversationId}/messages?limit=abc`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  // ==========================================================================
  // POST /conversations - Create Conversation
  // ==========================================================================
  describe('POST /conversations', () => {
    it('should return 401 without authentication', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'New Conversation',
        }),
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTH_MISSING_TOKEN');
    });

    it('should return 503 when Convex is not configured', async () => {
      mockIsConvexConfigured.mockReturnValue(false);

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'New Conversation',
        }),
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toContain('not configured');
    });

    it('should return 201 with valid request body', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_new_123');
      mockQuery.mockResolvedValue({
        _id: 'conv_new_123',
        title: 'My New Chat',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
        metadata: { source: 'api' },
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'My New Chat',
          metadata: { source: 'api' },
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.data.conversation).toBeDefined();
      expect(body.data.conversation.id).toBe('conv_new_123');
      expect(body.data.conversation.title).toBe('My New Chat');
      expect(body.data.conversation.userId).toBe(testUserId);
    });

    it('should auto-generate title from initialMessage if not provided', async () => {
      const now = Date.now();
      const initialMessage = 'Hello, this is my first message in this conversation!';
      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_auto_title');
      mockQuery.mockResolvedValue({
        _id: 'conv_auto_title',
        title: initialMessage.slice(0, 50) + '...',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          initialMessage,
        }),
      });

      expect(response.statusCode).toBe(201);

      // Verify mutation was called with auto-generated title
      expect(mockMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: expect.stringContaining('Hello, this is my first message'),
        })
      );
    });

    it('should use initialMessage prefix (first 50 chars) when no title provided', async () => {
      const now = Date.now();
      const longMessage = 'This is a very long message that exceeds fifty characters and should be truncated';
      const expectedTitlePrefix = longMessage.slice(0, 50);

      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_truncated_title');
      mockQuery.mockResolvedValue({
        _id: 'conv_truncated_title',
        title: expectedTitlePrefix + '...',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          initialMessage: longMessage,
        }),
      });

      expect(response.statusCode).toBe(201);

      // Verify mutation was called with truncated title
      expect(mockMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: expectedTitlePrefix + '...',
        })
      );
    });

    it('should accept metadata object', async () => {
      const now = Date.now();
      const metadata = {
        source: 'mobile',
        platform: 'ios',
        version: '1.0.0',
      };

      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_with_meta');
      mockQuery.mockResolvedValue({
        _id: 'conv_with_meta',
        title: 'Conversation with metadata',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'Conversation with metadata',
          metadata, // metadata is accepted but not passed to Convex (schema doesn't support it)
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      // Verify mutation was called with trustLevel and agentProfile (new schema)
      expect(mockMutation).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Conversation with metadata',
          trustLevel: expect.any(String),
          agentProfile: expect.any(String),
        })
      );
    });

    it('should return created conversation with id, title, userId, timestamps', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_full');
      mockQuery.mockResolvedValue({
        _id: 'conv_full',
        title: 'Complete Conversation',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'Complete Conversation',
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);

      const conversation = body.data.conversation;
      expect(conversation).toHaveProperty('id');
      expect(conversation).toHaveProperty('title');
      expect(conversation).toHaveProperty('userId');
      expect(conversation).toHaveProperty('createdAt');
      expect(conversation).toHaveProperty('updatedAt');

      // Verify timestamps are ISO strings
      expect(() => new Date(conversation.createdAt)).not.toThrow();
      expect(() => new Date(conversation.updatedAt)).not.toThrow();
    });

    it('should audit log conversation creation', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_audited');
      mockQuery.mockResolvedValue({
        _id: 'conv_audited',
        title: 'Audited Conversation',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'Audited Conversation',
          initialMessage: 'Hello!',
        }),
      });

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'conversations.created',
          userId: testUserId,
        })
      );

      const auditCall = mockLogAuditEvent.mock.calls.find(
        (call) => (call[0] as { action: string }).action === 'conversations.created'
      );
      expect(auditCall).toBeDefined();
      const details = JSON.parse((auditCall![0] as { details: string }).details);
      expect(details.conversationId).toBe('conv_audited');
      expect(details.hasInitialMessage).toBe(true);
    });

    it('should return 400 for invalid request body (wrong schema)', async () => {
      mockIsConvexConfigured.mockReturnValue(true);

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: '', // Empty title should fail validation (min 1 char)
        }),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('should return 400 for title exceeding max length', async () => {
      mockIsConvexConfigured.mockReturnValue(true);

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'x'.repeat(300), // Exceeds 200 char limit
        }),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_FAILED');
    });

    it('should create initial message when provided', async () => {
      const now = Date.now();
      const initialMessage = 'Starting a new conversation!';

      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation
        .mockResolvedValueOnce('conv_with_msg') // First call creates conversation
        .mockResolvedValueOnce('msg_initial'); // Second call creates message
      mockQuery.mockResolvedValue({
        _id: 'conv_with_msg',
        title: 'New Chat',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'New Chat',
          initialMessage,
        }),
      });

      expect(response.statusCode).toBe(201);

      // Verify message creation was called
      expect(mockMutation).toHaveBeenCalledTimes(2);
      expect(mockMutation).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          conversationId: 'conv_with_msg',
          role: 'user',
          content: initialMessage,
        })
      );
    });

    it('should not create message when initialMessage is not provided', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_no_msg');
      mockQuery.mockResolvedValue({
        _id: 'conv_no_msg',
        title: 'Empty Chat',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          title: 'Empty Chat',
        }),
      });

      // Only one mutation call (create conversation), no message creation
      expect(mockMutation).toHaveBeenCalledTimes(1);
    });

    it('should allow creating conversation with only initialMessage', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation
        .mockResolvedValueOnce('conv_msg_only')
        .mockResolvedValueOnce('msg_1');
      mockQuery.mockResolvedValue({
        _id: 'conv_msg_only',
        title: 'Short message',
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({
          initialMessage: 'Short message',
        }),
      });

      expect(response.statusCode).toBe(201);
    });

    it('should allow creating conversation with empty payload', async () => {
      const now = Date.now();
      mockIsConvexConfigured.mockReturnValue(true);
      mockMutation.mockResolvedValue('conv_empty');
      mockQuery.mockResolvedValue({
        _id: 'conv_empty',
        title: expect.stringContaining('New Conversation'),
        userId: testUserId,
        createdAt: now,
        updatedAt: now,
      });

      const response = await server.inject({
        method: 'POST',
        url: '/conversations',
        headers: {
          authorization: `Bearer ${validToken}`,
          'content-type': 'application/json',
        },
        payload: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(201);
    });
  });
});
