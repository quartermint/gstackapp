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
   * 5. Execute agent
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

    // Step 5: Execute agent (stub)
    const agentResponse = await executeAgent(agent, chatRequest, trustContext);

    // Step 6: Build and return response
    const conversationId =
      chatRequest.conversationId || crypto.randomUUID();

    const response: ChatResponse = {
      success: true,
      data: {
        response: agentResponse.content,
        conversationId,
        agentProfile: agent.id,
        requestId,
        usage: agentResponse.usage,
      },
    };

    return reply.send(response);
  });
};
