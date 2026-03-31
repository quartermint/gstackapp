import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock @google/generative-ai ───────────────────────────────────────────────
const { mockGenerateContent } = vi.hoisted(() => {
  const mockGenerateContent = vi.fn()
  return { mockGenerateContent }
})

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class MockGoogleAI {
    constructor() {}
    getGenerativeModel() {
      return { generateContent: mockGenerateContent }
    }
  },
}))

import { GeminiProvider } from '../../pipeline/providers/gemini'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(overrides: {
  parts?: any[]
  finishReason?: string
  usageMetadata?: any
}) {
  const { parts = [{ text: 'Hello world' }], finishReason = 'STOP', usageMetadata } = overrides
  return {
    response: {
      candidates: [
        {
          content: { parts },
          finishReason,
        },
      ],
      usageMetadata: usageMetadata !== undefined
        ? usageMetadata
        : { promptTokenCount: 100, candidatesTokenCount: 50 },
    },
  }
}

const BASE_PARAMS = {
  model: 'gemini-2.0-flash',
  system: 'You are a helpful assistant.',
  messages: [{ role: 'user' as const, content: 'Hi' }],
  tools: [
    {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
  ],
  maxTokens: 1024,
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GeminiProvider', () => {
  let provider: GeminiProvider

  beforeEach(() => {
    provider = new GeminiProvider('fake-api-key')
    mockGenerateContent.mockReset()
  })

  it('text response → normalized format', async () => {
    mockGenerateContent.mockResolvedValue(
      makeResponse({
        parts: [{ text: 'Hello world' }],
        finishReason: 'STOP',
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello world' }])
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })

  it('function call → tool_use format', async () => {
    mockGenerateContent.mockResolvedValue(
      makeResponse({
        parts: [
          {
            functionCall: {
              name: 'read_file',
              args: { path: '/src/index.ts' },
            },
          },
        ],
        finishReason: 'STOP',
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toHaveLength(1)
    const block = result.content[0]
    expect(block.type).toBe('tool_use')
    if (block.type === 'tool_use') {
      expect(block.name).toBe('read_file')
      expect(block.input).toEqual({ path: '/src/index.ts' })
      expect(block.id).toMatch(/^gemini-\d+-[a-z0-9]+$/)
    }
  })

  it('mixed text + function call → tool_use takes priority', async () => {
    mockGenerateContent.mockResolvedValue(
      makeResponse({
        parts: [
          { text: 'Let me read that file.' },
          {
            functionCall: {
              name: 'read_file',
              args: { path: '/src/index.ts' },
            },
          },
        ],
        finishReason: 'STOP',
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toHaveLength(2)
    expect(result.content[0]).toEqual({ type: 'text', text: 'Let me read that file.' })
    expect(result.content[1].type).toBe('tool_use')
    if (result.content[1].type === 'tool_use') {
      expect(result.content[1].name).toBe('read_file')
    }
  })

  it('MAX_TOKENS finish reason → max_tokens stopReason', async () => {
    mockGenerateContent.mockResolvedValue(
      makeResponse({
        parts: [{ text: 'Truncated response...' }],
        finishReason: 'MAX_TOKENS',
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('max_tokens')
  })

  it('empty candidates array → empty content, end_turn, zero usage', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
      },
    })

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([])
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 0 })
  })

  it('missing usageMetadata → usage defaults to zeros', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: { parts: [{ text: 'Hello' }] },
            finishReason: 'STOP',
          },
        ],
        // no usageMetadata field
      },
    })

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('tool results use function name (not opaque ID)', async () => {
    mockGenerateContent.mockResolvedValue(
      makeResponse({
        parts: [{ text: 'Done.' }],
        finishReason: 'STOP',
      })
    )

    await provider.createCompletion({
      ...BASE_PARAMS,
      messages: [
        { role: 'user' as const, content: 'Hi' },
        {
          role: 'assistant' as const,
          content: [
            {
              type: 'tool_use' as const,
              id: 'gemini-123-abc',
              name: 'read_file',
              input: { path: '/src/index.ts' },
            },
          ],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              toolCallId: 'gemini-123-abc',
              name: 'read_file',
              content: 'file contents here',
            },
          ],
        },
      ],
    })

    const callArgs = mockGenerateContent.mock.calls[0][0]
    // Last message should be the tool result (user role)
    const lastContent = callArgs.contents[callArgs.contents.length - 1]
    expect(lastContent.role).toBe('user')
    expect(lastContent.parts).toHaveLength(1)
    expect(lastContent.parts[0].functionResponse).toBeDefined()
    expect(lastContent.parts[0].functionResponse.name).toBe('read_file')
    expect(lastContent.parts[0].functionResponse.name).not.toBe('gemini-123-abc')
  })
})
