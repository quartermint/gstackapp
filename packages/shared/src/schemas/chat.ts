import { z } from 'zod';
import { LIMITS, AGENT_PROFILES } from '../constants.js';

/**
 * Message schema for conversation history
 */
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(LIMITS.MAX_INPUT_LENGTH),
  timestamp: z.number().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

/**
 * Chat request schema
 */
export const ChatRequestSchema = z.object({
  /** User's message */
  message: z.string().min(1).max(LIMITS.MAX_INPUT_LENGTH),
  /** Conversation ID for context continuity */
  conversationId: z.string().uuid().optional(),
  /** Conversation history (if no conversationId) */
  history: z.array(MessageSchema).max(100).optional(),
  /** Preferred agent profile (may be overridden by trust level) */
  agentProfile: z
    .enum([
      AGENT_PROFILES.CHAT_READONLY,
      AGENT_PROFILES.CODE_ASSISTANT,
      AGENT_PROFILES.TASK_ORCHESTRATOR,
    ])
    .optional(),
  /** Optional metadata */
  metadata: z.record(z.unknown()).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/**
 * Chat response schema
 */
export const ChatResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    /** Assistant's response */
    response: z.string(),
    /** Conversation ID for future requests */
    conversationId: z.string().uuid(),
    /** Agent profile used */
    agentProfile: z.string(),
    /** Request tracking ID */
    requestId: z.string(),
    /** Usage statistics */
    usage: z
      .object({
        inputTokens: z.number(),
        outputTokens: z.number(),
      })
      .optional(),
  }),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;
