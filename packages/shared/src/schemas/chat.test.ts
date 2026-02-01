import { describe, it, expect } from 'vitest';
import {
  MessageSchema,
  ChatRequestSchema,
  ChatResponseSchema,
} from './chat.js';
import { LIMITS, AGENT_PROFILES } from '../constants.js';

describe('MessageSchema', () => {
  it('should accept valid user message', () => {
    const result = MessageSchema.safeParse({
      role: 'user',
      content: 'Hello, how are you?',
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid assistant message', () => {
    const result = MessageSchema.safeParse({
      role: 'assistant',
      content: 'I am doing well, thank you!',
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid system message', () => {
    const result = MessageSchema.safeParse({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(result.success).toBe(true);
  });

  it('should accept message with timestamp', () => {
    const result = MessageSchema.safeParse({
      role: 'user',
      content: 'Test message',
      timestamp: Date.now(),
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid role', () => {
    const result = MessageSchema.safeParse({
      role: 'invalid',
      content: 'Hello',
    });
    expect(result.success).toBe(false);
  });

  it('should reject content exceeding max length', () => {
    const longContent = 'x'.repeat(LIMITS.MAX_INPUT_LENGTH + 1);
    const result = MessageSchema.safeParse({
      role: 'user',
      content: longContent,
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatRequestSchema', () => {
  it('should accept minimal valid request', () => {
    const result = ChatRequestSchema.safeParse({
      message: 'Hello!',
    });
    expect(result.success).toBe(true);
  });

  it('should accept request with conversation ID', () => {
    const result = ChatRequestSchema.safeParse({
      message: 'Continue our conversation',
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should accept request with history', () => {
    const result = ChatRequestSchema.safeParse({
      message: 'What did we discuss?',
      history: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should accept request with agent profile', () => {
    const result = ChatRequestSchema.safeParse({
      message: 'Help me code',
      agentProfile: AGENT_PROFILES.CODE_ASSISTANT,
    });
    expect(result.success).toBe(true);
  });

  it('should accept all valid agent profiles', () => {
    for (const profile of Object.values(AGENT_PROFILES)) {
      const result = ChatRequestSchema.safeParse({
        message: 'Test',
        agentProfile: profile,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should accept request with metadata', () => {
    const result = ChatRequestSchema.safeParse({
      message: 'Test',
      metadata: { key: 'value', count: 42 },
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty message', () => {
    const result = ChatRequestSchema.safeParse({
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject message exceeding max length', () => {
    const longMessage = 'x'.repeat(LIMITS.MAX_INPUT_LENGTH + 1);
    const result = ChatRequestSchema.safeParse({
      message: longMessage,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid conversation ID format', () => {
    const result = ChatRequestSchema.safeParse({
      message: 'Hello',
      conversationId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid agent profile', () => {
    const result = ChatRequestSchema.safeParse({
      message: 'Hello',
      agentProfile: 'invalid-profile',
    });
    expect(result.success).toBe(false);
  });

  it('should reject history with too many messages', () => {
    const history = Array.from({ length: 101 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }));
    const result = ChatRequestSchema.safeParse({
      message: 'Hello',
      history,
    });
    expect(result.success).toBe(false);
  });
});

describe('ChatResponseSchema', () => {
  it('should accept valid minimal response', () => {
    const result = ChatResponseSchema.safeParse({
      success: true,
      data: {
        response: 'Hello! How can I help you?',
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        agentProfile: 'chat-readonly',
        requestId: 'req_abc123_def456789012',
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept response with usage statistics', () => {
    const result = ChatResponseSchema.safeParse({
      success: true,
      data: {
        response: 'Here is your answer.',
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        agentProfile: 'code-assistant',
        requestId: 'req_abc123_def456789012',
        usage: {
          inputTokens: 100,
          outputTokens: 250,
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject response with success: false', () => {
    const result = ChatResponseSchema.safeParse({
      success: false,
      data: {
        response: 'Hello',
        conversationId: '550e8400-e29b-41d4-a716-446655440000',
        agentProfile: 'chat-readonly',
        requestId: 'req_abc123',
      },
    });
    expect(result.success).toBe(false);
  });

  it('should reject response with invalid conversation ID', () => {
    const result = ChatResponseSchema.safeParse({
      success: true,
      data: {
        response: 'Hello',
        conversationId: 'invalid',
        agentProfile: 'chat-readonly',
        requestId: 'req_abc123',
      },
    });
    expect(result.success).toBe(false);
  });

  it('should reject response missing required fields', () => {
    const result = ChatResponseSchema.safeParse({
      success: true,
      data: {
        response: 'Hello',
        // Missing conversationId, agentProfile, requestId
      },
    });
    expect(result.success).toBe(false);
  });
});
