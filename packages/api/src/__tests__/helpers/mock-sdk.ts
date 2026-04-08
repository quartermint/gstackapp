/**
 * Mock helper for @anthropic-ai/claude-agent-sdk query() function.
 *
 * Provides a mock async generator that yields predetermined SDK messages,
 * allowing integration tests without real API calls.
 */

/**
 * Creates a mock query() function that yields the given messages.
 */
export function createMockQueryGenerator(messages: any[]) {
  return function mockQuery(_opts: any) {
    const gen = (async function* () {
      for (const msg of messages) {
        yield msg
      }
    })()

    // Add close() method to match Query interface
    ;(gen as any).close = () => {}

    return gen
  }
}

// ── Predefined mock message sequences ───────────────────────────────────────

/** Simple text response from assistant */
export const mockTextResponse = [
  {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text: 'Hello, I can help with that.' }],
    },
    parent_tool_use_id: null,
    uuid: 'msg-uuid-001',
    session_id: 'sdk-sess-123',
  },
  {
    type: 'result',
    subtype: 'success',
    session_id: 'sdk-sess-123',
    total_cost_usd: 0.01,
    duration_ms: 500,
    num_turns: 1,
    is_error: false,
    result: 'Hello, I can help with that.',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: 'result-uuid-001',
  },
]

/** Response with tool use (Read file) */
export const mockToolResponse = [
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'tool-1',
          name: 'Read',
          input: { file_path: '/tmp/test.txt' },
        },
      ],
    },
    parent_tool_use_id: null,
    uuid: 'msg-uuid-002',
    session_id: 'sdk-sess-456',
  },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'I read the file. Here is what I found.' },
      ],
    },
    parent_tool_use_id: null,
    uuid: 'msg-uuid-003',
    session_id: 'sdk-sess-456',
  },
  {
    type: 'result',
    subtype: 'success',
    session_id: 'sdk-sess-456',
    total_cost_usd: 0.02,
    duration_ms: 1200,
    num_turns: 2,
    is_error: false,
    result: 'I read the file. Here is what I found.',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 200,
      output_tokens: 80,
      cache_read_input_tokens: 50,
      cache_creation_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: 'result-uuid-002',
  },
]

/** Streaming text delta events */
export const mockStreamingResponse = [
  {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' },
    },
    parent_tool_use_id: null,
    uuid: 'stream-uuid-001',
    session_id: 'sdk-sess-789',
  },
  {
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: ', world!' },
    },
    parent_tool_use_id: null,
    uuid: 'stream-uuid-002',
    session_id: 'sdk-sess-789',
  },
  {
    type: 'result',
    subtype: 'success',
    session_id: 'sdk-sess-789',
    total_cost_usd: 0.005,
    duration_ms: 300,
    num_turns: 1,
    is_error: false,
    result: 'Hello, world!',
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 50,
      output_tokens: 10,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
    uuid: 'result-uuid-003',
  },
]

/** Compact boundary event */
export const mockCompactEvent = {
  type: 'system',
  subtype: 'compact_boundary',
  compact_metadata: {
    trigger: 'auto' as const,
    pre_tokens: 50000,
  },
  uuid: 'compact-uuid-001',
  session_id: 'sdk-sess-compact',
}

/** Error result */
export const mockErrorResult = {
  type: 'result',
  subtype: 'error_max_budget_usd',
  session_id: 'sdk-sess-error',
  total_cost_usd: 5.0,
  duration_ms: 60000,
  num_turns: 50,
  is_error: true,
  stop_reason: null,
  usage: {
    input_tokens: 100000,
    output_tokens: 50000,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
  modelUsage: {},
  permission_denials: [],
  errors: ['Budget limit exceeded'],
  uuid: 'result-uuid-error',
}
