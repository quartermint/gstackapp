/**
 * Tests for the execution brief generator.
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

import { generateExecutionBrief, type ExecutionBriefData } from '../pipeline/brief-generator'

describe('generateExecutionBrief', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns structured brief with scope, assumptions, and acceptance criteria', async () => {
    const briefResponse: ExecutionBriefData = {
      scope: ['Build landing page with hero section', 'Add contact form'],
      assumptions: ['Using existing design system'],
      acceptanceCriteria: ['Page loads in under 2s', 'Form validates email'],
    }

    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(briefResponse) }],
    })

    const result = await generateExecutionBrief({
      whatNeeded: 'Build a landing page',
      whatGood: 'Fast and clean',
      previousQA: [{ question: 'What sections?', answer: 'Hero and contact form' }],
    })

    expect(result.scope).toHaveLength(2)
    expect(result.assumptions).toHaveLength(1)
    expect(result.acceptanceCriteria).toHaveLength(2)
    expect(result.scope[0]).toContain('landing page')
  })

  it('includes whatNeeded and whatGood in the API call', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"scope":["test"],"assumptions":["test"],"acceptanceCriteria":["test"]}' }],
    })

    await generateExecutionBrief({
      whatNeeded: 'Build a dashboard',
      whatGood: 'Real-time updates',
      previousQA: [],
    })

    const callArgs = mockCreate.mock.calls[0][0]
    const userMessage = callArgs.messages.find((m: any) => m.role === 'user')
    expect(userMessage.content).toContain('Build a dashboard')
    expect(userMessage.content).toContain('Real-time updates')
  })

  it('uses claude-sonnet-4-20250514 model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"scope":["a"],"assumptions":["b"],"acceptanceCriteria":["c"]}' }],
    })

    await generateExecutionBrief({
      whatNeeded: 'test',
      whatGood: 'test',
      previousQA: [],
    })

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-sonnet-4-20250514')
  })

  it('validates response with Zod schema', async () => {
    // Missing acceptanceCriteria field
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"scope":["a"],"assumptions":["b"]}' }],
    })

    await expect(
      generateExecutionBrief({
        whatNeeded: 'test',
        whatGood: 'test',
        previousQA: [],
      }),
    ).rejects.toThrow()
  })

  it('throws on non-JSON response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Here is your brief: ...' }],
    })

    await expect(
      generateExecutionBrief({
        whatNeeded: 'test',
        whatGood: 'test',
        previousQA: [],
      }),
    ).rejects.toThrow()
  })
})
