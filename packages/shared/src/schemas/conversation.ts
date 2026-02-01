import { z } from 'zod';
import { MessageSchema } from './chat.js';

/**
 * Conversation schema for storing conversation metadata
 */
export const ConversationSchema = z.object({
  /** Unique conversation ID */
  id: z.string().uuid(),
  /** Conversation title (auto-generated or user-defined) */
  title: z.string().min(1).max(200),
  /** User ID who owns this conversation */
  userId: z.string(),
  /** Creation timestamp (ISO string) */
  createdAt: z.string().datetime(),
  /** Last update timestamp (ISO string) */
  updatedAt: z.string().datetime(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

/**
 * Conversation list response schema
 */
export const ConversationListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    /** List of conversations */
    conversations: z.array(ConversationSchema),
    /** Total count of conversations */
    total: z.number(),
    /** Pagination cursor for next page */
    nextCursor: z.string().optional(),
  }),
});

export type ConversationListResponse = z.infer<typeof ConversationListResponseSchema>;

/**
 * Conversation create request schema
 */
export const ConversationCreateRequestSchema = z.object({
  /** Optional title (auto-generated if not provided) */
  title: z.string().min(1).max(200).optional(),
  /** Optional initial message to start the conversation */
  initialMessage: z.string().min(1).max(10000).optional(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type ConversationCreateRequest = z.infer<typeof ConversationCreateRequestSchema>;

/**
 * Conversation create response schema
 */
export const ConversationCreateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    /** The created conversation */
    conversation: ConversationSchema,
  }),
});

export type ConversationCreateResponse = z.infer<typeof ConversationCreateResponseSchema>;

/**
 * Conversation messages response schema
 */
export const ConversationMessagesResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    /** Conversation ID */
    conversationId: z.string().uuid(),
    /** Messages in the conversation */
    messages: z.array(MessageSchema.extend({
      /** Message ID */
      id: z.string().uuid(),
      /** Creation timestamp */
      createdAt: z.string().datetime(),
    })),
    /** Total message count */
    total: z.number(),
    /** Pagination cursor for next page */
    nextCursor: z.string().optional(),
  }),
});

export type ConversationMessagesResponse = z.infer<typeof ConversationMessagesResponseSchema>;

/**
 * Conversation query parameters schema
 */
export const ConversationQuerySchema = z.object({
  /** Maximum number of conversations to return */
  limit: z.coerce.number().min(1).max(100).default(20),
  /** Pagination cursor */
  cursor: z.string().optional(),
});

export type ConversationQuery = z.infer<typeof ConversationQuerySchema>;

/**
 * Messages query parameters schema
 */
export const MessagesQuerySchema = z.object({
  /** Maximum number of messages to return */
  limit: z.coerce.number().min(1).max(100).default(50),
  /** Pagination cursor */
  cursor: z.string().optional(),
});

export type MessagesQuery = z.infer<typeof MessagesQuerySchema>;
