import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
} from './types'

export class GeminiProvider implements LLMProvider {
  readonly name = 'gemini'
  private client: GoogleGenerativeAI

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey)
  }

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    const model = this.client.getGenerativeModel({
      model: params.model,
      systemInstruction: params.system,
      tools: [{
        functionDeclarations: params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema as any,
        })),
      }],
    })

    const contents = params.messages.map((m) => this.toGeminiContent(m))

    const result = await model.generateContent({
      contents,
      generationConfig: { maxOutputTokens: params.maxTokens },
    })

    const response = result.response
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    const usage = response.usageMetadata

    const hasFunctionCall = parts.some((p: any) => p.functionCall)

    const content: ContentBlock[] = []
    for (const part of parts) {
      if ((part as any).text !== undefined) {
        content.push({ type: 'text', text: (part as any).text })
      }
      if ((part as any).functionCall) {
        const fc = (part as any).functionCall
        // Preserve the raw part for Gemini 3's thought_signature requirement
        content.push({
          type: 'tool_use',
          id: `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: fc.name,
          input: fc.args ?? {},
          providerMetadata: { rawPart: part },
        })
      }
    }

    return {
      stopReason: hasFunctionCall ? 'tool_use' : this.normalizeFinishReason(candidate?.finishReason),
      content,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
      },
    }
  }

  private normalizeFinishReason(
    reason?: string
  ): CompletionResult['stopReason'] {
    if (reason === 'MAX_TOKENS') return 'max_tokens'
    return 'end_turn'
  }

  private toGeminiContent(msg: ConversationMessage): any {
    const role = msg.role === 'assistant' ? 'model' : 'user'

    if (typeof msg.content === 'string') {
      return { role, parts: [{ text: msg.content }] }
    }

    // Tool results -> functionResponse (CRITICAL: use tr.name, not tr.toolCallId)
    if (Array.isArray(msg.content) && msg.content.length > 0 && 'toolCallId' in msg.content[0]) {
      return {
        role,
        parts: (msg.content as ToolResultBlock[]).map((tr) => ({
          functionResponse: {
            name: tr.name ?? tr.toolCallId,  // Gemini needs function name, not opaque ID
            response: { content: tr.content },
          },
        })),
      }
    }

    // Content blocks (assistant with function calls)
    // Restore raw parts for Gemini 3's thought_signature requirement
    return {
      role,
      parts: (msg.content as ContentBlock[]).map((b) => {
        if (b.type === 'text') return { text: b.text }
        // Use preserved raw part if available (includes thought_signature for Gemini 3)
        if (b.providerMetadata?.rawPart) return b.providerMetadata.rawPart
        return { functionCall: { name: b.name, args: b.input } }
      }),
    }
  }
}
