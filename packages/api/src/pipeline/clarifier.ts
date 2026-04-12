/**
 * Clarification question generator.
 *
 * Uses Claude API to generate one clarification question at a time,
 * adapting to previous answers. Maximum 5 questions per request.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { GbrainCacheData } from '../gbrain/types'

export interface ClarificationContext {
  whatNeeded: string
  whatGood: string
  deadline?: string
  previousQA: Array<{ question: string; answer: string }>
}

const MAX_QUESTIONS = 5

/**
 * Build a knowledge block string from gbrain entities for injection into
 * the clarification system prompt. Returns empty string if no usable entities.
 *
 * T-19-06: Entity excerpts are appended as context data, not executable instructions.
 */
function buildKnowledgeBlock(gbrainContext?: GbrainCacheData): string {
  if (!gbrainContext?.available || !gbrainContext.entities?.length) {
    return ''
  }

  return `\n\nYou have knowledge about the following projects/people mentioned in the request:\n${
    gbrainContext.entities.map(e => `- ${e.title} (${e.type}): ${e.excerpt}`).join('\n')
  }\n\nUse this knowledge to ask more specific, context-aware questions. For example, if they mention a project you know about, reference its tech stack or recent activity.`
}

/**
 * Generate the next clarification question for an operator request.
 *
 * Returns { isComplete: true } when the request is clear enough to proceed.
 * Returns { isComplete: false, question: "..." } when more clarity is needed.
 *
 * GB-03: When gbrainContext is provided with available entities, injects
 * knowledge block into system prompt for context-aware clarification.
 */
export async function generateClarificationQuestion(
  ctx: ClarificationContext,
  gbrainContext?: GbrainCacheData,
): Promise<{ question: string; isComplete: boolean }> {
  const client = new Anthropic()
  const remaining = MAX_QUESTIONS - ctx.previousQA.length
  const knowledgeBlock = buildKnowledgeBlock(gbrainContext)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `You are helping clarify a non-technical user's request. Ask one specific, plain-language question to reduce ambiguity. No technical jargon. If the request is clear enough to proceed, respond with JSON: {"isComplete": true, "question": ""}. Otherwise respond with JSON: {"isComplete": false, "question": "your question here"}. Maximum ${remaining} questions remaining.${knowledgeBlock}`,
    messages: [
      {
        role: 'user',
        content: JSON.stringify(ctx),
      },
    ],
  })

  const block = response.content[0]
  const text = block?.type === 'text' ? block.text : ''

  try {
    const parsed = JSON.parse(text)
    return {
      isComplete: Boolean(parsed.isComplete),
      question: parsed.question ?? '',
    }
  } catch {
    // If Claude doesn't return valid JSON, treat the response as a question
    return {
      isComplete: false,
      question: text,
    }
  }
}
