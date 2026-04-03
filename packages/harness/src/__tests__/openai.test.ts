import { describe, it, expect, vi, beforeEach } from 'vitest'

// -- Mock openai --------------------------------------------------------------
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return { mockCreate }
})

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockCreate } }
    constructor() {}
  },
}))

import { OpenAIProvider } from '../openai'

// -- Helpers ------------------------------------------------------------------

function makeResponse(overrides: {
  message?: Record<string, unknown>
  finish_reason?: string | null
  usage?: Record<string, number> | null
}) {
  const {
    message = { content: 'Hello world', tool_calls: undefined },
    finish_reason = 'stop',
    usage = { prompt_tokens: 100, completion_tokens: 50 },
  } = overrides

  return {
    choices: [{ message, finish_reason }],
    usage: usage ?? undefined,
  }
}

const BASE_PARAMS = {
  model: 'gpt-4o',
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

// -- Tests --------------------------------------------------------------------

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    provider = new OpenAIProvider({ apiKey: 'fake-api-key' })
    mockCreate.mockReset()
  })

  it('stop response -> normalized format', async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        message: { content: 'Hello world' },
        finish_reason: 'stop',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello world' }])
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })

  it('tool_calls response -> tool_use format', async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_abc123',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: JSON.stringify({ path: '/src/index.ts' }),
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
        usage: { prompt_tokens: 200, completion_tokens: 80 },
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toHaveLength(1)
    const block = result.content[0]
    expect(block.type).toBe('tool_use')
    if (block.type === 'tool_use') {
      expect(block.id).toBe('call_abc123')
      expect(block.name).toBe('read_file')
      expect(block.input).toEqual({ path: '/src/index.ts' })
    }
  })

  it('tool results -> role:tool messages', async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        message: { content: 'Done.' },
        finish_reason: 'stop',
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
              id: 'call_abc123',
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
              toolCallId: 'call_abc123',
              content: 'file contents here',
            },
          ],
        },
      ],
    })

    const callArgs = mockCreate.mock.calls[0][0]
    const toolMessage = callArgs.messages.find((m: any) => m.role === 'tool')
    expect(toolMessage).toBeDefined()
    expect(toolMessage.role).toBe('tool')
    expect(toolMessage.tool_call_id).toBe('call_abc123')
    expect(toolMessage.content).toBe('file contents here')
  })

  it('custom baseURL for local LM Studio', () => {
    const localProvider = new OpenAIProvider({
      apiKey: 'lm-studio-local',
      baseURL: 'http://ryans-mac-mini:1234/v1',
    })

    expect(localProvider.name).toBe('openai')
  })

  it('length finish reason -> max_tokens stopReason', async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        message: { content: 'Truncated...' },
        finish_reason: 'length',
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('max_tokens')
  })

  it('null usage -> defaults to zero', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: { content: 'Hello' },
          finish_reason: 'stop',
        },
      ],
      // no usage field
    })

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('malformed function arguments -> does not crash, returns empty input', async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_bad',
              type: 'function',
              function: {
                name: 'read_file',
                arguments: 'not-json',
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.content).toHaveLength(1)
    const block = result.content[0]
    expect(block.type).toBe('tool_use')
    if (block.type === 'tool_use') {
      expect(block.input).toEqual({})
    }
  })
})
