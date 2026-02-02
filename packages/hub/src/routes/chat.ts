/**
 * Chat routes - Handle chat requests through the security pipeline
 *
 * Now supports:
 * - Conversation persistence via Convex
 * - Multi-agent orchestration for complex requests
 * - Conversation history in prompts
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  ChatRequestSchema,
  HTTP_STATUS,
  ERROR_CODES,
  TrustLevel,
} from '@mission-control/shared';
import { sanitize } from '../services/sanitizer.js';
import { classifyTrust } from '../services/trust.js';
import { selectAgent, executeAgent } from '../services/agents.js';
import {
  executeClaudeCliWithFallback,
  ClaudeCliTimeoutError,
  ClaudeCliExecutionError,
  ClaudeClientOptions,
} from '../services/claude-client.js';
import { getConvexClient, isConvexConfigured, api } from '../services/convex.js';
import { orchestrate, requiresOrchestration } from '../services/orchestrator.js';
import { getLogger } from '../services/logger.js';

/**
 * Map TrustLevel to Convex trust level enum
 */
function mapTrustLevel(level: TrustLevel): 'internal' | 'authenticated' | 'untrusted' {
  switch (level) {
    case 'internal':
      return 'internal';
    case 'power-user':
    case 'authenticated':
      return 'authenticated';
    case 'untrusted':
    default:
      return 'untrusted';
  }
}

/**
 * Map AgentProfileId to Convex agent profile enum
 */
function mapAgentProfile(profile: string): 'chat-readonly' | 'code-assistant' | 'task-orchestrator' {
  switch (profile) {
    case 'chat-readonly':
      return 'chat-readonly';
    case 'code-assistant':
      return 'code-assistant';
    case 'power-user':
    case 'task-orchestrator':
      return 'task-orchestrator';
    default:
      return 'chat-readonly';
  }
}

/**
 * Fetch conversation history from Convex
 */
async function fetchConversationHistory(
  conversationId: string
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
  if (!isConvexConfigured()) {
    return [];
  }

  const logger = getLogger();
  const client = getConvexClient();

  try {
    const result = await client.query(api.messages.listByConversation, {
      conversationId: conversationId as unknown as string,
      limit: 20,
    });

    // Handle the actual return type from Convex
    const messages = Array.isArray(result) ? result : [];

    return messages.map((msg: unknown) => {
      const m = msg as { role: string; content: string };
      return {
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      };
    });
  } catch (error) {
    logger.warn({ error, conversationId }, 'Failed to fetch conversation history');
    return [];
  }
}

/**
 * Store conversation and messages to Convex
 */
async function storeToConvex(
  conversationId: string | undefined,
  userMessage: string,
  assistantResponse: string,
  trustLevel: 'internal' | 'authenticated' | 'untrusted',
  agentProfile: 'chat-readonly' | 'code-assistant' | 'task-orchestrator'
): Promise<string> {
  if (!isConvexConfigured()) {
    return conversationId || crypto.randomUUID();
  }

  const logger = getLogger();
  const client = getConvexClient();

  try {
    // Create conversation if needed
    let convId = conversationId;
    if (!convId) {
      convId = await client.mutation(api.conversations.create, {
        trustLevel,
        agentProfile,
        title: userMessage.slice(0, 100),
      });
    }

    // Store user message
    await client.mutation(api.messages.create, {
      conversationId: convId as unknown as string,
      role: 'user',
      content: userMessage,
    });

    // Store assistant response
    await client.mutation(api.messages.create, {
      conversationId: convId as unknown as string,
      role: 'assistant',
      content: assistantResponse,
    });

    return convId;
  } catch (error) {
    logger.error({ error }, 'Failed to store messages to Convex');
    return conversationId || crypto.randomUUID();
  }
}

/**
 * Build prompt with conversation history
 */
function buildPromptWithHistory(
  message: string,
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): string {
  if (history.length === 0) {
    return message;
  }

  const historyText = history
    .slice(-10) // Last 10 messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `Previous conversation:
${historyText}

Current request:
${message}`;
}

/**
 * Chat response type (without strict literal type)
 */
interface ChatResponseData {
  success: boolean;
  data?: {
    response: string;
    conversationId: string;
    agentProfile: string;
    requestId: string;
    usage?: {
      inputTokens: number;
      outputTokens: number;
    };
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

/**
 * Chat routes plugin
 */
export const chatRoutes: FastifyPluginAsync = async (
  server: FastifyInstance
) => {
  /**
   * POST /chat - Process a chat request
   *
   * Security pipeline:
   * 1. Parse and validate request
   * 2. Sanitize input for injection patterns
   * 3. Classify trust level
   * 4. Select appropriate agent
   * 5. Fetch conversation history (if available)
   * 6. Detect orchestration needs
   * 7. Execute agent via Claude CLI or orchestrator
   * 8. Store messages to Convex
   * 9. Validate and return response
   */
  server.post('/chat', async (request, reply) => {
    const requestId = request.id;
    const logger = getLogger();

    // Step 1: Parse and validate request body
    const parseResult = ChatRequestSchema.safeParse(request.body);

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

    const chatRequest = parseResult.data;

    // Step 2: Sanitize input
    const sanitizeResult = sanitize(chatRequest.message);

    if (!sanitizeResult.safe) {
      request.log.warn(
        {
          issues: sanitizeResult.issues,
          requestId,
        },
        'Input sanitization failed'
      );

      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: ERROR_CODES.SANITIZATION_FAILED,
          message: 'Input contains potentially unsafe content',
          details: sanitizeResult.issues,
          requestId,
        },
      });
    }

    // Step 3: Classify trust level
    const trustContext = classifyTrust(request);

    // Step 4: Select appropriate agent based on trust level
    const agent = selectAgent(trustContext, chatRequest.agentProfile);

    request.log.info(
      {
        trustLevel: trustContext.level,
        agentProfile: agent.id,
        conversationId: chatRequest.conversationId,
        requestId,
      },
      'Processing chat request'
    );

    // Step 5: Check if this is an orchestration request (for internal/authenticated users)
    const canOrchestrate = trustContext.level === 'internal' ||
      trustContext.level === 'power-user' ||
      (trustContext.level === 'authenticated' && agent.id === 'task-orchestrator');

    const shouldOrchestrate = canOrchestrate && requiresOrchestration(
      chatRequest.message,
      { requestId, forceOrchestration: false }
    );

    // Step 6: Execute via orchestrator or direct Claude CLI
    if (shouldOrchestrate) {
      logger.info({ requestId }, 'Using orchestrator for complex request');

      try {
        const orchestrationResult = await orchestrate(chatRequest.message, {
          requestId,
          conversationId: chatRequest.conversationId,
          defaultTimeout: parseInt(process.env['CLAUDE_TIMEOUT'] || '120000', 10),
          onProgress: (status) => {
            logger.debug({ requestId, status }, 'Orchestration progress');
          },
        });

        const response: ChatResponseData = {
          success: orchestrationResult.success,
          data: {
            response: orchestrationResult.response,
            conversationId: chatRequest.conversationId || crypto.randomUUID(),
            agentProfile: agent.id,
            requestId,
            usage: {
              inputTokens: 0,
              outputTokens: Math.ceil(orchestrationResult.response.length / 4),
            },
          },
        };

        return reply.send(response);
      } catch (error) {
        logger.error({ error, requestId }, 'Orchestration failed');
        // Fall through to direct execution
      }
    }

    // Step 7: Execute agent via Claude CLI with conversation context
    try {
      // Fetch conversation history
      let history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
      if (chatRequest.conversationId) {
        history = await fetchConversationHistory(chatRequest.conversationId);
      }

      // Build prompt with history
      const promptWithHistory = buildPromptWithHistory(chatRequest.message, history);

      // Build Claude CLI options from agent profile
      const claudeOptions: ClaudeClientOptions = {
        maxTokens: agent.maxTokens || 4096,
        timeout: parseInt(process.env['CLAUDE_TIMEOUT'] || '120000', 10),
        conversationId: chatRequest.conversationId,
        systemPrompt: agent.systemPromptAdditions,
        allowedTools: agent.allowedTools,
      };

      // Try to use Claude CLI directly first
      const claudeResponse = await executeClaudeCliWithFallback(
        promptWithHistory,
        claudeOptions
      );

      // Step 8: Store to Convex
      const finalConversationId = await storeToConvex(
        chatRequest.conversationId,
        chatRequest.message,
        claudeResponse.content,
        mapTrustLevel(trustContext.level),
        mapAgentProfile(agent.id)
      );

      // Step 9: Build and return response
      const response: ChatResponseData = {
        success: true,
        data: {
          response: claudeResponse.content,
          conversationId: finalConversationId,
          agentProfile: agent.id,
          requestId,
          usage: {
            inputTokens: claudeResponse.usage.promptTokens,
            outputTokens: claudeResponse.usage.completionTokens,
          },
        },
      };

      return reply.send(response);
    } catch (error) {
      // Handle specific Claude CLI errors
      if (error instanceof ClaudeCliTimeoutError) {
        request.log.error({ err: error, requestId }, 'Claude CLI timeout');
        return reply.status(HTTP_STATUS.GATEWAY_TIMEOUT).send({
          success: false,
          error: {
            code: 'CLAUDE_TIMEOUT',
            message: 'Request to Claude CLI timed out',
            requestId,
          },
        });
      }

      if (error instanceof ClaudeCliExecutionError) {
        request.log.error({ err: error, requestId }, 'Claude CLI execution error');
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: 'CLAUDE_EXECUTION_ERROR',
            message: 'Claude CLI execution failed',
            requestId,
          },
        });
      }

      // Fall back to stub agent execution for other errors
      request.log.warn(
        { err: error, requestId },
        'Claude CLI unavailable, falling back to stub agent'
      );

      const agentResponse = await executeAgent(agent, chatRequest, trustContext);

      // Store to Convex even for stub responses
      const finalConversationId = await storeToConvex(
        chatRequest.conversationId,
        chatRequest.message,
        agentResponse.content,
        mapTrustLevel(trustContext.level),
        mapAgentProfile(agent.id)
      );

      const response: ChatResponseData = {
        success: true,
        data: {
          response: agentResponse.content,
          conversationId: finalConversationId,
          agentProfile: agent.id,
          requestId,
          usage: agentResponse.usage,
        },
      };

      return reply.send(response);
    }
  });

  /**
   * GET /chat/:conversationId/history - Get conversation history
   */
  server.get<{ Params: { conversationId: string } }>(
    '/chat/:conversationId/history',
    async (request, reply) => {
      const { conversationId } = request.params;

      if (!conversationId) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: {
            code: ERROR_CODES.VALIDATION_FAILED,
            message: 'conversationId is required',
            requestId: request.id,
          },
        });
      }

      try {
        const history = await fetchConversationHistory(conversationId);

        return reply.send({
          success: true,
          data: {
            conversationId,
            messages: history,
            count: history.length,
          },
        });
      } catch (error) {
        return reply.status(HTTP_STATUS.INTERNAL_ERROR).send({
          success: false,
          error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Failed to fetch conversation history',
            requestId: request.id,
          },
        });
      }
    }
  );
};
