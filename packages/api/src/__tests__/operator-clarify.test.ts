/**
 * Tests for the clarification question generator.
 *
 * Mocks @anthropic-ai/sdk to test prompt construction and response parsing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Anthropic SDK
const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

import { generateClarificationQuestion, type ClarificationContext } from '../pipeline/clarifier'

describe('generateClarificationQuestion', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns a question when request is ambiguous', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"isComplete": false, "question": "What color scheme do you prefer?"}' }],
    })

    const ctx: ClarificationContext = {
      whatNeeded: 'Build a website',
      whatGood: 'Looks nice',
      previousQA: [],
    }

    const result = await generateClarificationQuestion(ctx)
    expect(result.isComplete).toBe(false)
    expect(result.question).toBe('What color scheme do you prefer?')
  })

  it('returns isComplete when request is clear', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"isComplete": true, "question": ""}' }],
    })

    const ctx: ClarificationContext = {
      whatNeeded: 'Add a logout button to the settings page, top right corner, red color',
      whatGood: 'Button visible, logs user out, redirects to login page',
      previousQA: [],
    }

    const result = await generateClarificationQuestion(ctx)
    expect(result.isComplete).toBe(true)
  })

  it('includes previousQA in the API call', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"isComplete": true, "question": ""}' }],
    })

    const ctx: ClarificationContext = {
      whatNeeded: 'Build a form',
      whatGood: 'Works well',
      previousQA: [
        { question: 'How many fields?', answer: '3 fields' },
        { question: 'What types?', answer: 'Text, email, phone' },
      ],
    }

    await generateClarificationQuestion(ctx)

    // Verify the user message includes the full context
    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: any) => m.role === 'user')
    expect(userMessage.content).toContain('3 fields')
    expect(userMessage.content).toContain('Text, email, phone')
  })

  it('uses claude-sonnet-4-20250514 model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"isComplete": false, "question": "test?"}' }],
    })

    await generateClarificationQuestion({
      whatNeeded: 'test',
      whatGood: 'test',
      previousQA: [],
    })

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-20250514')
  })

  it('handles non-JSON response gracefully', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'What color do you want?' }],
    })

    const result = await generateClarificationQuestion({
      whatNeeded: 'Build a site',
      whatGood: 'Looks good',
      previousQA: [],
    })

    expect(result.isComplete).toBe(false)
    expect(result.question).toBe('What color do you want?')
  })

  it('includes max questions remaining in system prompt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"isComplete": false, "question": "test?"}' }],
    })

    await generateClarificationQuestion({
      whatNeeded: 'test',
      whatGood: 'test',
      previousQA: [
        { question: 'q1', answer: 'a1' },
        { question: 'q2', answer: 'a2' },
      ],
    })

    const systemPrompt = mockCreate.mock.calls[0][0].system
    expect(systemPrompt).toContain('3') // 5 - 2 = 3 remaining
  })
})
