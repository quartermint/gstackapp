import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock @anthropic-ai/sdk ───────────────────────────────────────────────────
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return { mockCreate }
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate }
  },
}))

import { AnthropicProvider } from '../../pipeline/providers/anthropic'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeResponse(overrides: Record<string, unknown>) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'Hello world' }],
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  }
}

const BASE_PARAMS = {
  model: 'claude-sonnet-4-5',
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

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    provider = new AnthropicProvider()
    mockCreate.mockReset()
  })

  it('end_turn response → normalized format', async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hello world' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('end_turn')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello world' }])
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
  })

  it('tool_use response → normalized tool call blocks', async () => {
    mockCreate.mockResolvedValue(
      makeResponse({
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            id: 'tool_abc123',
            name: 'read_file',
            input: { path: '/src/index.ts' },
          },
        ],
        usage: { input_tokens: 200, output_tokens: 80 },
      })
    )

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('tool_use')
    expect(result.content).toHaveLength(1)
    const block = result.content[0]
    expect(block.type).toBe('tool_use')
    if (block.type === 'tool_use') {
      expect(block.id).toBe('tool_abc123')
      expect(block.name).toBe('read_file')
      expect(block.input).toEqual({ path: '/src/index.ts' })
    }
  })

  it('tool results passed in Anthropic format', async () => {
    mockCreate.mockResolvedValue(makeResponse({}))

    await provider.createCompletion({
      ...BASE_PARAMS,
      messages: [
        { role: 'user' as const, content: 'Hi' },
        {
          role: 'assistant' as const,
          content: [{ type: 'tool_use', id: 'tool_abc123', name: 'read_file', input: { path: '/src/index.ts' } }],
        },
        {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              toolCallId: 'tool_abc123',
              content: 'file contents here',
              isError: false,
            },
          ],
        },
      ],
    })

    const callArgs = mockCreate.mock.calls[0][0]
    const lastMessage = callArgs.messages[callArgs.messages.length - 1]

    expect(lastMessage.role).toBe('user')
    expect(Array.isArray(lastMessage.content)).toBe(true)
    const toolResult = lastMessage.content[0]
    expect(toolResult.type).toBe('tool_result')
    expect(toolResult.tool_use_id).toBe('tool_abc123')
    expect(toolResult).not.toHaveProperty('toolCallId')
    expect(toolResult.content).toBe('file contents here')
  })

  it('abort signal forwarded to messages.create', async () => {
    mockCreate.mockResolvedValue(makeResponse({}))

    const controller = new AbortController()
    await provider.createCompletion({ ...BASE_PARAMS, signal: controller.signal })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: controller.signal })
    )
  })

  it('max_tokens stop reason → normalized', async () => {
    mockCreate.mockResolvedValue(makeResponse({ stop_reason: 'max_tokens' }))

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('max_tokens')
  })

  it('refusal stop reason → normalizes to end_turn', async () => {
    mockCreate.mockResolvedValue(makeResponse({ stop_reason: 'refusal' }))

    const result = await provider.createCompletion(BASE_PARAMS)

    expect(result.stopReason).toBe('end_turn')
  })

  it('no signal → second arg is undefined', async () => {
    mockCreate.mockResolvedValue(makeResponse({}))

    const paramsWithoutSignal = { ...BASE_PARAMS }
    // Ensure signal is not present
    delete (paramsWithoutSignal as Record<string, unknown>)['signal']

    await provider.createCompletion(paramsWithoutSignal)

    expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), undefined)
  })
})
