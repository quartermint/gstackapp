/**
 * Chat routes - Handle chat requests through the security pipeline
 */

import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import {
  ChatRequestSchema,
  ChatResponse,
  HTTP_STATUS,
  ERROR_CODES,
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
   * 5. Execute agent via Claude CLI
   * 6. Validate and return response
   */
  server.post('/chat', async (request, reply) => {
    const requestId = request.id;

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
        requestId,
      },
      'Processing chat request'
    );

    // Step 5: Execute agent via Claude CLI
    try {
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
        chatRequest.message,
        claudeOptions
      );

      // Step 6: Build and return response
      const response: ChatResponse = {
        success: true,
        data: {
          response: claudeResponse.content,
          conversationId: claudeResponse.conversationId || crypto.randomUUID(),
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

      const response: ChatResponse = {
        success: true,
        data: {
          response: agentResponse.content,
          conversationId: chatRequest.conversationId || crypto.randomUUID(),
          agentProfile: agent.id,
          requestId,
          usage: agentResponse.usage,
        },
      };

      return reply.send(response);
    }
  });
};
