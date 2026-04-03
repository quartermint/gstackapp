import OpenAI from 'openai'
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
} from './types'

interface OpenAIProviderOptions {
  apiKey: string
  baseURL?: string
}

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  private client: OpenAI

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    })
  }

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    const messages = [
      { role: 'system' as const, content: params.system },
      ...params.messages.flatMap((m) => this.toOpenAIMessages(m)),
    ]

    const response = await this.client.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
      tools: params.tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      })),
    })

    const choice = response.choices[0]
    const msg = choice.message

    const content: ContentBlock[] = []

    if (msg.content) {
      content.push({ type: 'text', text: msg.content })
    }

    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        if (tc.type !== 'function') continue
        // Guard against malformed JSON from local models
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          // Malformed arguments -- use empty object, tool execution will handle the missing params
        }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input,
        })
      }
    }

    return {
      stopReason: this.normalizeFinishReason(choice.finish_reason),
      content,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    }
  }

  private normalizeFinishReason(
    reason: string | null
  ): CompletionResult['stopReason'] {
    if (reason === 'tool_calls') return 'tool_use'
    if (reason === 'length') return 'max_tokens'
    return 'end_turn'
  }

  private toOpenAIMessages(
    msg: ConversationMessage
  ): OpenAI.ChatCompletionMessageParam[] {
    if (typeof msg.content === 'string') {
      return [{ role: msg.role as 'user' | 'assistant', content: msg.content }]
    }

    // Tool results -> one "tool" role message per result
    if (Array.isArray(msg.content) && msg.content.length > 0 && 'toolCallId' in msg.content[0]) {
      return (msg.content as ToolResultBlock[]).map((tr) => ({
        role: 'tool' as const,
        tool_call_id: tr.toolCallId,
        content: tr.content,
      }))
    }

    // Assistant content blocks with tool_use
    const toolCalls = (msg.content as ContentBlock[]).filter(
      (b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use'
    )
    const textParts = (msg.content as ContentBlock[]).filter(
      (b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text'
    )

    return [{
      role: 'assistant' as const,
      content: textParts.map((t) => t.text).join('\n') || null,
      tool_calls: toolCalls.length > 0
        ? toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          }))
        : undefined,
    }]
  }
}
