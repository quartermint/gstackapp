import Anthropic from '@anthropic-ai/sdk'
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
} from './types'

const anthropic = new Anthropic()

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    const response = await anthropic.messages.create(
      {
        model: params.model,
        max_tokens: params.maxTokens,
        system: [{ type: 'text', text: params.system, cache_control: { type: 'ephemeral' } }],
        tools: params.tools.map((t, i, arr) => {
          const tool: Anthropic.Tool = {
            name: t.name,
            description: t.description,
            input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
          }
          if (i === arr.length - 1) {
            return { ...tool, cache_control: { type: 'ephemeral' as const } }
          }
          return tool
        }),
        messages: params.messages.map((m) => this.toAnthropicMessage(m)),
      },
      params.signal ? { signal: params.signal } : undefined
    )

    return {
      stopReason: this.normalizeStopReason(response.stop_reason),
      content: this.normalizeContent(response.content),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }

  private normalizeStopReason(
    reason: string | null
  ): CompletionResult['stopReason'] {
    if (reason === 'tool_use') return 'tool_use'
    if (reason === 'max_tokens') return 'max_tokens'
    return 'end_turn'
  }

  private normalizeContent(
    content: Anthropic.ContentBlock[]
  ): ContentBlock[] {
    return content
      .filter(
        (b): b is Anthropic.TextBlock | Anthropic.ToolUseBlock =>
          b.type === 'text' || b.type === 'tool_use'
      )
      .map((b) => {
        if (b.type === 'text') {
          return { type: 'text' as const, text: b.text }
        }
        return {
          type: 'tool_use' as const,
          id: b.id,
          name: b.name,
          input: b.input as Record<string, unknown>,
        }
      })
  }

  private toAnthropicMessage(
    msg: ConversationMessage
  ): Anthropic.MessageParam {
    if (typeof msg.content === 'string') {
      return { role: msg.role, content: msg.content }
    }

    if (Array.isArray(msg.content) && msg.content.length > 0 && 'toolCallId' in msg.content[0]) {
      return {
        role: msg.role,
        content: (msg.content as ToolResultBlock[]).map((tr) => ({
          type: 'tool_result' as const,
          tool_use_id: tr.toolCallId,
          content: tr.content,
          is_error: tr.isError,
        })),
      }
    }

    return {
      role: msg.role,
      content: (msg.content as ContentBlock[]).map((b) => {
        if (b.type === 'text') return { type: 'text' as const, text: b.text }
        return {
          type: 'tool_use' as const,
          id: b.id,
          name: b.name,
          input: b.input,
        }
      }),
    }
  }
}
