/**
 * Conversation routes - Handle conversation management endpoints
 *
 * Provides endpoints for:
 * - Listing user conversations
 * - Getting conversation messages
 * - Creating new conversations
 */

import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  HTTP_STATUS,
  ERROR_CODES,
  TRUST_LEVELS,
  meetsTrustLevel,
  ConversationQuerySchema,
  MessagesQuerySchema,
  ConversationCreateRequestSchema,
} from '@mission-control/shared';
import { classifyTrust } from '../services/trust.js';
import { getConvexClient, isConvexConfigured, api } from '../services/convex.js';
import { logAuditEvent } from '../services/audit.js';

/**
 * Convex conversation type
 */
interface ConvexConversation {
  _id: string;
  _creationTime: number;
  title: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Convex message type
 */
interface ConvexMessage {
  _id: string;
  _creationTime: number;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
  timestamp?: number;
}

/**
 * Enforce authenticated trust level minimum
 */
async function requireAuthenticated(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const trust = classifyTrust(request);

  if (!meetsTrustLevel(trust.level, TRUST_LEVELS.AUTHENTICATED)) {
    await logAuditEvent({
      requestId: request.id,
      action: 'conversations.access_denied',
      details: JSON.stringify({
        trustLevel: trust.level,
        path: request.url,
      }),
      sourceIp: trust.sourceIp,
      userId: trust.userId,
    });

    reply.status(HTTP_STATUS.UNAUTHORIZED).send({
      success: false,
      error: {
        code: ERROR_CODES.AUTH_MISSING_TOKEN,
        message: 'Authentication required to access conversations',
        requestId: request.id,
      },
    });
  }
}

/**
 * Conversation routes plugin
 */
export const conversationRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  // Register preHandler hook for all routes in this plugin
  server.addHook('preHandler', requireAuthenticated);

  /**
   * GET /conversations - List user's conversations
   *
   * Returns paginated list of conversations for the authenticated user.
   */
  server.get('/conversations', async (request, reply) => {
    const requestId = request.id;
    const trust = classifyTrust(request);

    // Parse query parameters
    const parseResult = ConversationQuerySchema.safeParse(request.query);

    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid query parameters',
          details: parseResult.error.errors,
          requestId,
        },
      });
    }

    const { limit, cursor } = parseResult.data;

    if (!isConvexConfigured()) {
      return reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Conversation storage not configured',
          requestId,
        },
      });
    }

    try {
      const client = getConvexClient();

      // Fetch conversations for the user
      const result = await client.query(api.conversations.listByUser, {
        userId: trust.userId || '',
        limit,
        cursor,
      });

      const conversations = (result.conversations as ConvexConversation[]).map(
        (conv) => ({
          id: conv._id,
          title: conv.title,
          userId: conv.userId,
          createdAt: new Date(conv.createdAt).toISOString(),
          updatedAt: new Date(conv.updatedAt).toISOString(),
          metadata: conv.metadata,
        })
      );

      return reply.send({
        success: true,
        data: {
          conversations,
          total: result.total,
          nextCursor: result.nextCursor,
        },
      });
    } catch (error) {
      request.log.error({ error, requestId }, 'Failed to list conversations');

      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to list conversations',
          requestId,
        },
      });
    }
  });

  /**
   * GET /conversations/:id/messages - Get conversation message history
   *
   * Returns paginated list of messages for a conversation.
   */
  server.get<{ Params: { id: string } }>(
    '/conversations/:id/messages',
    async (request, reply) => {
      const requestId = request.id;
      const trust = classifyTrust(request);
      const { id: conversationId } = request.params;

      // Parse query parameters
      const parseResult = MessagesQuerySchema.safeParse(request.query);

      if (!parseResult.success) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_FAILED,
            message: 'Invalid query parameters',
            details: parseResult.error.errors,
            requestId,
          },
        });
      }

      const { limit, cursor } = parseResult.data;

      if (!isConvexConfigured()) {
        return reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Conversation storage not configured',
            requestId,
          },
        });
      }

      try {
        const client = getConvexClient();

        // First verify the user owns this conversation
        const conversation = (await client.query(api.conversations.get, {
          id: conversationId,
        })) as ConvexConversation | null;

        if (!conversation) {
          return reply.status(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            error: {
              code: 'CONVERSATION_NOT_FOUND',
              message: `Conversation ${conversationId} not found`,
              requestId,
            },
          });
        }

        if (conversation.userId !== trust.userId) {
          await logAuditEvent({
            requestId,
            action: 'conversations.unauthorized_access',
            details: JSON.stringify({
              conversationId,
              ownerId: conversation.userId,
            }),
            sourceIp: trust.sourceIp,
            userId: trust.userId,
          });

          return reply.status(HTTP_STATUS.FORBIDDEN).send({
            success: false,
            error: {
              code: ERROR_CODES.INSUFFICIENT_TRUST,
              message: 'You do not have access to this conversation',
              requestId,
            },
          });
        }

        // Fetch messages
        const result = await client.query(api.messages.listByConversation, {
          conversationId,
          limit,
          cursor,
        });

        const messages = (result.messages as ConvexMessage[]).map((msg) => ({
          id: msg._id,
          role: msg.role,
          content: msg.content,
          createdAt: new Date(msg.createdAt).toISOString(),
          timestamp: msg.timestamp,
        }));

        return reply.send({
          success: true,
          data: {
            conversationId,
            messages,
            total: result.total,
            nextCursor: result.nextCursor,
          },
        });
      } catch (error) {
        request.log.error(
          { error, conversationId, requestId },
          'Failed to get conversation messages'
        );

        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to get conversation messages',
            requestId,
          },
        });
      }
    }
  );

  /**
   * POST /conversations - Create a new conversation
   *
   * Creates a new conversation for the authenticated user.
   */
  server.post('/conversations', async (request, reply) => {
    const requestId = request.id;
    const trust = classifyTrust(request);

    // Parse request body
    const parseResult = ConversationCreateRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.VALIDATION_FAILED,
          message: 'Invalid request body',
          details: parseResult.error.errors,
          requestId,
        },
      });
    }

    const { title, initialMessage, metadata } = parseResult.data;

    if (!isConvexConfigured()) {
      return reply.status(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Conversation storage not configured',
          requestId,
        },
      });
    }

    try {
      const client = getConvexClient();

      // Generate title if not provided
      const conversationTitle =
        title ||
        (initialMessage
          ? initialMessage.slice(0, 50) + (initialMessage.length > 50 ? '...' : '')
          : `New Conversation ${new Date().toISOString()}`);

      // Create the conversation
      const conversationId = await client.mutation(api.conversations.create, {
        userId: trust.userId || '',
        title: conversationTitle,
        metadata,
      });

      // If initial message provided, add it
      if (initialMessage) {
        await client.mutation(api.messages.create, {
          conversationId,
          role: 'user',
          content: initialMessage,
        });
      }

      // Fetch the created conversation
      const conversation = (await client.query(api.conversations.get, {
        id: conversationId,
      })) as ConvexConversation;

      await logAuditEvent({
        requestId,
        action: 'conversations.created',
        details: JSON.stringify({
          conversationId,
          hasInitialMessage: !!initialMessage,
        }),
        sourceIp: trust.sourceIp,
        userId: trust.userId,
      });

      return reply.status(HTTP_STATUS.CREATED).send({
        success: true,
        data: {
          conversation: {
            id: conversation._id,
            title: conversation.title,
            userId: conversation.userId,
            createdAt: new Date(conversation.createdAt).toISOString(),
            updatedAt: new Date(conversation.updatedAt).toISOString(),
            metadata: conversation.metadata,
          },
        },
      });
    } catch (error) {
      request.log.error({ error, requestId }, 'Failed to create conversation');

      return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
        success: false,
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Failed to create conversation',
          requestId,
        },
      });
    }
  });
};
