/**
 * Agent loop integration tests with mocked SDK.
 *
 * Tests cover:
 * - Stream bridge: text, tool_use, result, compact, error, and unknown message mapping
 * - Agent loop generator: yields bridged events from mock SDK query
 */

import { describe, it, expect, vi } from 'vitest'
import { bridgeToSSE } from '../agent/stream-bridge'
import {
  createMockQueryGenerator,
  mockTextResponse,
  mockToolResponse,
  mockStreamingResponse,
  mockCompactEvent,
  mockErrorResult,
} from './helpers/mock-sdk'

// ── Stream Bridge Tests ─────────────────────────────────────────────────────

describe('bridgeToSSE', () => {
  it('maps assistant text message to text_delta event', () => {
    const msg = mockTextResponse[0] // assistant with text content
    const event = bridgeToSSE(msg as any)

    expect(event).not.toBeNull()
    expect(event!.type).toBe('text_delta')
    if (event!.type === 'text_delta') {
      expect(event!.text).toBe('Hello, I can help with that.')
    }
  })

  it('maps assistant tool_use message to tool_start event', () => {
    const msg = mockToolResponse[0] // assistant with tool_use content
    const event = bridgeToSSE(msg as any)

    expect(event).not.toBeNull()
    expect(event!.type).toBe('tool_start')
    if (event!.type === 'tool_start') {
      expect(event!.name).toBe('Read')
      expect(event!.id).toBe('tool-1')
      expect(event!.input).toContain('/tmp/test.txt')
    }
  })

  it('maps result message to result event', () => {
    const msg = mockTextResponse[1] // result message
    const event = bridgeToSSE(msg as any)

    expect(event).not.toBeNull()
    expect(event!.type).toBe('result')
    if (event!.type === 'result') {
      expect(event!.sdkSessionId).toBe('sdk-sess-123')
      expect(event!.cost).toBe(0.01)
      expect(event!.tokenUsage).toBe(150) // 100 + 50
    }
  })

  it('maps stream_event text_delta to text_delta event', () => {
    const msg = mockStreamingResponse[0] // stream event with text delta
    const event = bridgeToSSE(msg as any)

    expect(event).not.toBeNull()
    expect(event!.type).toBe('text_delta')
    if (event!.type === 'text_delta') {
      expect(event!.text).toBe('Hello')
    }
  })

  it('maps compact_boundary system message to compact event', () => {
    const event = bridgeToSSE(mockCompactEvent as any)

    expect(event).not.toBeNull()
    expect(event!.type).toBe('compact')
    if (event!.type === 'compact') {
      expect(event!.message).toContain('auto')
    }
  })

  it('maps error result to error event', () => {
    const event = bridgeToSSE(mockErrorResult as any)

    expect(event).not.toBeNull()
    expect(event!.type).toBe('error')
    if (event!.type === 'error') {
      expect(event!.message).toContain('error_max_budget_usd')
      expect(event!.message).toContain('Budget limit exceeded')
    }
  })

  it('returns null for unhandled message types', () => {
    const unknownMsg = {
      type: 'some_unknown_type',
      data: 'whatever',
    }
    const event = bridgeToSSE(unknownMsg as any)
    expect(event).toBeNull()
  })

  it('returns null for user messages (type not handled)', () => {
    const userMsg = {
      type: 'user',
      message: { role: 'user', content: 'hello' },
      parent_tool_use_id: null,
      uuid: 'user-uuid',
      session_id: 'sess',
    }
    const event = bridgeToSSE(userMsg as any)
    expect(event).toBeNull()
  })
})

// ── Agent Loop Generator Tests (with mocked SDK) ────────────────────────────

describe('runAgentLoop (mocked)', () => {
  it('yields bridged events from mock SDK query', async () => {
    // Mock the SDK module
    const mockQuery = createMockQueryGenerator(mockTextResponse)

    // Manually run through events to simulate what runAgentLoop does
    const events = []
    for await (const msg of mockQuery({})) {
      const event = bridgeToSSE(msg)
      if (event) events.push(event)
    }

    expect(events).toHaveLength(2)
    expect(events[0].type).toBe('text_delta')
    expect(events[1].type).toBe('result')
  })

  it('handles tool use sequence correctly', async () => {
    const mockQuery = createMockQueryGenerator(mockToolResponse)

    const events = []
    for await (const msg of mockQuery({})) {
      const event = bridgeToSSE(msg)
      if (event) events.push(event)
    }

    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('tool_start')
    expect(events[1].type).toBe('text_delta')
    expect(events[2].type).toBe('result')
  })

  it('handles streaming text delta sequence', async () => {
    const mockQuery = createMockQueryGenerator(mockStreamingResponse)

    const events = []
    for await (const msg of mockQuery({})) {
      const event = bridgeToSSE(msg)
      if (event) events.push(event)
    }

    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('text_delta')
    expect(events[1].type).toBe('text_delta')
    expect(events[2].type).toBe('result')

    // Verify accumulated text
    const textEvents = events.filter(e => e.type === 'text_delta')
    const fullText = textEvents.map(e => (e as any).text).join('')
    expect(fullText).toBe('Hello, world!')
  })

  it('handles mixed events including compact boundary', async () => {
    const messages = [
      mockTextResponse[0],
      mockCompactEvent,
      mockTextResponse[1],
    ]
    const mockQuery = createMockQueryGenerator(messages)

    const events = []
    for await (const msg of mockQuery({})) {
      const event = bridgeToSSE(msg)
      if (event) events.push(event)
    }

    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('text_delta')
    expect(events[1].type).toBe('compact')
    expect(events[2].type).toBe('result')
  })
})
