/**
 * Execution brief generator.
 *
 * Uses Claude API to generate a structured execution brief from
 * the clarification Q&A context, for operator approval before pipeline runs.
 */

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { ClarificationContext } from './clarifier'

export interface ExecutionBriefData {
  scope: string[]
  assumptions: string[]
  acceptanceCriteria: string[]
}

const briefSchema = z.object({
  scope: z.array(z.string()),
  assumptions: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()),
})

/**
 * Strip markdown code fences from Claude's JSON responses.
 * Claude frequently wraps JSON in ```json ... ``` fences.
 */
function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  return fenced ? fenced[1].trim() : raw.trim()
}

/**
 * Generate an execution brief from the clarification context.
 *
 * Returns a structured brief with scope, assumptions, and acceptance criteria.
 * Throws if Claude returns invalid JSON or the response doesn't match the schema.
 */
export async function generateExecutionBrief(
  ctx: ClarificationContext,
): Promise<ExecutionBriefData> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: 'Generate an execution brief for a non-technical user\'s request. Return JSON with three arrays: scope (what will be done, 2-5 bullet points), assumptions (what we\'re assuming, 1-3 items), acceptanceCriteria (how we\'ll know it\'s done, 2-4 numbered items). Use plain language, no technical jargon.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify(ctx),
      },
    ],
  })

  const block = response.content[0]
  const text = block?.type === 'text' ? block.text : ''
  if (!text) {
    throw new Error('Empty response from Claude API — no text content returned')
  }

  // WR-04: Strip markdown fences before parsing (Claude often wraps JSON in ```json ... ```)
  const jsonText = extractJson(text)
  const parsed = JSON.parse(jsonText)
  return briefSchema.parse(parsed)
}
