/**
 * Dual-mode Codex provider: API for conversation, CLI subprocess for sandbox tasks.
 *
 * API mode: Uses OpenAI SDK with GPT-5.x models (same interface as OpenAIProvider).
 * Sandbox mode: Uses @openai/codex-sdk to spawn sandboxed tasks with structured output.
 *
 * Threat mitigations:
 * - T-13-01: API key passed via SDK constructor (not CLI args)
 * - T-13-02: Default sandbox mode is workspace-write (never danger-full-access)
 * - T-13-03: AbortController timeout on thread.run() prevents runaway subprocesses
 */

import OpenAI from 'openai'
import { Codex } from '@openai/codex-sdk'
import { execSync } from 'node:child_process'
import type {
  LLMProvider,
  CompletionParams,
  CompletionResult,
  ContentBlock,
  ConversationMessage,
  ToolResultBlock,
  SandboxOptions,
  SandboxResult,
} from '../types'

export class CodexProvider implements LLMProvider {
  readonly name = 'codex'
  private openaiClient: OpenAI
  private _codexSdk: InstanceType<typeof Codex> | null = null
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.openaiClient = new OpenAI({ apiKey })
  }

  /** Lazy-initialize Codex SDK (only needed for sandbox mode). */
  private getCodexSdk(): InstanceType<typeof Codex> {
    if (!this._codexSdk) {
      this._codexSdk = new Codex({ apiKey: this.apiKey })
    }
    return this._codexSdk
  }

  // -- API mode (LLMProvider interface) ----------------------------------------

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    const messages = [
      { role: 'system' as const, content: params.system },
      ...params.messages.flatMap((m) => this.toOpenAIMessages(m)),
    ]

    const response = await this.openaiClient.chat.completions.create({
      model: params.model,
      max_tokens: params.maxTokens,
      messages,
      tools: params.tools.length > 0
        ? params.tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.inputSchema,
            },
          }))
        : undefined,
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
        let input: Record<string, unknown> = {}
        try {
          input = JSON.parse(tc.function.arguments)
        } catch {
          // Malformed arguments -- use empty object
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

  // -- Sandbox mode (Codex CLI subprocess) ------------------------------------

  async runSandbox(task: string, options: SandboxOptions): Promise<SandboxResult> {
    const timeout = options.timeout ?? 120000
    const abortController = new AbortController()
    const timer = setTimeout(() => abortController.abort(), timeout)

    try {
      const thread = this.getCodexSdk().startThread({
        workingDirectory: options.workDir,
        skipGitRepoCheck: true,
      })

      const turn = await thread.run(task, {
        outputSchema: options.outputSchema,
        signal: abortController.signal,
      })

      return {
        response: turn.finalResponse,
        items: turn.items,
        usage: {
          inputTokens: turn.usage?.input_tokens ?? 0,
          outputTokens: turn.usage?.output_tokens ?? 0,
        },
      }
    } finally {
      clearTimeout(timer)
    }
  }

  // -- Health check -----------------------------------------------------------

  isCodexAvailable(): boolean {
    try {
      execSync('which codex', { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  // -- Private helpers --------------------------------------------------------

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
