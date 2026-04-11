/**
 * Clarification question generator.
 *
 * Uses Claude API to generate one clarification question at a time,
 * adapting to previous answers. Maximum 5 questions per request.
 */

import Anthropic from '@anthropic-ai/sdk'

export interface ClarificationContext {
  whatNeeded: string
  whatGood: string
  deadline?: string
  previousQA: Array<{ question: string; answer: string }>
}

const MAX_QUESTIONS = 5

/**
 * Generate the next clarification question for an operator request.
 *
 * Returns { isComplete: true } when the request is clear enough to proceed.
 * Returns { isComplete: false, question: "..." } when more clarity is needed.
 */
export async function generateClarificationQuestion(
  ctx: ClarificationContext,
): Promise<{ question: string; isComplete: boolean }> {
  const client = new Anthropic()
  const remaining = MAX_QUESTIONS - ctx.previousQA.length

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: `You are helping clarify a non-technical user's request. Ask one specific, plain-language question to reduce ambiguity. No technical jargon. If the request is clear enough to proceed, respond with JSON: {"isComplete": true, "question": ""}. Otherwise respond with JSON: {"isComplete": false, "question": "your question here"}. Maximum ${remaining} questions remaining.`,
    messages: [
      {
        role: 'user',
        content: JSON.stringify(ctx),
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

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
