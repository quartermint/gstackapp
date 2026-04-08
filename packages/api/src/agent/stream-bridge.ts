/**
 * Stream bridge: maps Claude Agent SDK message types to typed SSE events
 * for browser consumption.
 *
 * The SDK yields SDKMessage objects (assistant messages, stream events,
 * result messages, system messages). This bridge transforms them into
 * simplified, frontend-consumable event types.
 */

import type {
  SDKMessage,
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKCompactBoundaryMessage,
} from '@anthropic-ai/claude-agent-sdk'

// ── SSE Event Types ─────────────────────────────────────────────────────────

export type AgentSSEEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; name: string; id: string; input?: string }
  | { type: 'tool_result'; id: string; output: string; isError: boolean }
  | { type: 'turn_complete'; messageId: string }
  | { type: 'result'; sessionId: string; sdkSessionId: string; cost?: number; tokenUsage?: number }
  | { type: 'compact'; message: string }
  | { type: 'error'; message: string }

// ── Bridge Function ─────────────────────────────────────────────────────────

/**
 * Maps a raw SDK generator message to a typed SSE event.
 * Returns null for message types we don't need to forward to the frontend.
 */
export function bridgeToSSE(rawMessage: SDKMessage): AgentSSEEvent | null {
  switch (rawMessage.type) {
    case 'assistant':
      return handleAssistantMessage(rawMessage as SDKAssistantMessage)

    case 'stream_event':
      return handleStreamEvent(rawMessage as SDKPartialAssistantMessage)

    case 'result':
      return handleResultMessage(rawMessage as SDKResultMessage)

    case 'system':
      return handleSystemMessage(rawMessage)

    default:
      // Log unhandled types at debug level for iterative discovery
      // console.debug('[stream-bridge] unhandled message type:', rawMessage.type)
      return null
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

function handleAssistantMessage(msg: SDKAssistantMessage): AgentSSEEvent | null {
  const content = msg.message?.content
  if (!Array.isArray(content)) return null

  // Process each content block in the assistant message
  for (const block of content) {
    if (block.type === 'text' && block.text) {
      return { type: 'text_delta', text: block.text }
    }
    if (block.type === 'tool_use') {
      return {
        type: 'tool_start',
        name: block.name,
        id: block.id,
        input: typeof block.input === 'string'
          ? block.input
          : JSON.stringify(block.input),
      }
    }
  }

  return null
}

function handleStreamEvent(msg: SDKPartialAssistantMessage): AgentSSEEvent | null {
  const event = msg.event
  if (!event) return null

  // Handle streaming text deltas
  if (event.type === 'content_block_delta') {
    const delta = (event as any).delta
    if (delta?.type === 'text_delta' && delta.text) {
      return { type: 'text_delta', text: delta.text }
    }
    if (delta?.type === 'input_json_delta' && delta.partial_json) {
      // Tool input streaming — skip for now, frontend gets full tool_start
      return null
    }
  }

  // Handle tool_use content block start
  if (event.type === 'content_block_start') {
    const block = (event as any).content_block
    if (block?.type === 'tool_use') {
      return {
        type: 'tool_start',
        name: block.name,
        id: block.id,
      }
    }
  }

  return null
}

function handleResultMessage(msg: SDKResultMessage): AgentSSEEvent | null {
  if (msg.subtype === 'success') {
    return {
      type: 'result',
      sessionId: '', // Filled by the route handler
      sdkSessionId: msg.session_id,
      cost: msg.total_cost_usd,
      tokenUsage: msg.usage
        ? (msg.usage.input_tokens ?? 0) + (msg.usage.output_tokens ?? 0)
        : undefined,
    }
  }

  // Error results
  if (msg.is_error) {
    return {
      type: 'error',
      message: `Agent loop error: ${msg.subtype}${msg.errors?.length ? ' - ' + msg.errors.join(', ') : ''}`,
    }
  }

  return {
    type: 'result',
    sessionId: '',
    sdkSessionId: msg.session_id,
    cost: msg.total_cost_usd,
    tokenUsage: msg.usage
      ? (msg.usage.input_tokens ?? 0) + (msg.usage.output_tokens ?? 0)
      : undefined,
  }
}

function handleSystemMessage(msg: any): AgentSSEEvent | null {
  // Handle compact boundary events
  if (msg.subtype === 'compact_boundary') {
    const compactMsg = msg as SDKCompactBoundaryMessage
    return {
      type: 'compact',
      message: `Context compacted (trigger: ${compactMsg.compact_metadata?.trigger ?? 'auto'})`,
    }
  }

  // Handle status messages (compacting state)
  if (msg.subtype === 'status' && msg.status === 'compacting') {
    return {
      type: 'compact',
      message: 'Context compaction in progress...',
    }
  }

  return null
}
