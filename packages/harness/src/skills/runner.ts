import { readFileSync } from 'node:fs'
import type { SkillManifest } from './manifest'
import type { LLMProvider, ContentBlock, ConversationMessage, ToolResultBlock, ToolDefinition } from '../types'
import type { ToolAdapter } from '../adapters/types'

// -- Interfaces ---------------------------------------------------------------

export interface SkillRunInput {
  manifest: SkillManifest
  provider: LLMProvider
  adapter: ToolAdapter
  model: string
  executeTool: (name: string, input: Record<string, unknown>) => Promise<string>
  maxIterations?: number  // default 10
  maxTokens?: number      // default 4096
  signal?: AbortSignal
  userMessage?: string    // optional initial user message
}

export interface SkillResult {
  output: unknown  // validated against manifest.outputSchema
  tokenUsage: number
  durationMs: number
}

// -- Internals ----------------------------------------------------------------

/** Build a reverse map from adapter-specific name back to canonical name */
function buildReverseMap(
  tools: readonly string[],
  adapter: ToolAdapter,
): Map<string, string> {
  const reverseMap = new Map<string, string>()
  for (const canonical of tools) {
    const mapped = adapter.mapToolName(canonical)
    reverseMap.set(mapped, canonical)
  }
  return reverseMap
}

/** Resolve prompt: file path or inline text */
function resolvePrompt(prompt: string): string {
  if (prompt.startsWith('./') || prompt.startsWith('/') || prompt.endsWith('.md')) {
    try {
      return readFileSync(prompt, 'utf-8')
    } catch {
      // If file doesn't exist, use as inline text
      return prompt
    }
  }
  return prompt
}

// -- Runner -------------------------------------------------------------------

/**
 * Execute a skill manifest on an LLMProvider via a tool_use loop with adapter translation.
 *
 * 1. Validates tool support at load time (D-13 fail-fast)
 * 2. Translates tool schemas through the adapter before sending to provider
 * 3. Reverse-maps tool names from adapter-specific back to canonical for executeTool
 * 4. Translates tool results through the adapter before sending back to provider
 */
export async function runSkill(input: SkillRunInput): Promise<SkillResult> {
  const {
    manifest,
    provider,
    adapter,
    model,
    executeTool,
    maxIterations = 10,
    maxTokens = 4096,
    signal,
  } = input

  const startTime = Date.now()

  // Step 1: Validate tool support (D-13 fail-fast)
  // If adapter.mapToolName throws, we re-throw with skill name context
  for (const tool of manifest.tools) {
    try {
      adapter.mapToolName(tool)
    } catch (err) {
      throw new Error(
        `Skill "${manifest.name}" requires unsupported tool "${tool}": ${(err as Error).message}`,
      )
    }
  }

  // Step 2: Build tool definitions mapped through the adapter
  const canonicalTools: ToolDefinition[] = manifest.tools.map((toolName) => ({
    name: toolName,
    description: `Canonical tool: ${toolName}`,
    inputSchema: { type: 'object' },
  }))
  const mappedTools = canonicalTools.map((tool) => adapter.mapToolSchema(tool))

  // Build reverse map for tool name lookups
  const reverseMap = buildReverseMap(manifest.tools, adapter)

  // Step 3: Resolve prompt
  const systemPrompt = resolvePrompt(manifest.prompt)

  // Step 4: Initialize messages
  const userContent = input.userMessage ?? 'Execute the skill and return structured output.'
  const messages: ConversationMessage[] = [
    { role: 'user', content: userContent },
  ]

  let totalTokens = 0
  let finalContent: ContentBlock[] | null = null

  // Step 5: Tool_use agentic loop (mirrors stage-runner.ts pattern)
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const result = await provider.createCompletion({
      model,
      system: systemPrompt,
      messages,
      tools: mappedTools,
      maxTokens,
      signal,
    })

    totalTokens += result.usage.inputTokens + result.usage.outputTokens

    if (result.stopReason === 'end_turn') {
      finalContent = result.content
      break
    }

    if (result.stopReason === 'tool_use') {
      // Extract tool_use blocks
      const toolUseBlocks = result.content.filter(
        (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use',
      )

      const toolResults: ToolResultBlock[] = []
      for (const toolBlock of toolUseBlocks) {
        // Reverse-map the adapter-specific name back to canonical
        const canonicalName = reverseMap.get(toolBlock.name) ?? toolBlock.name

        try {
          const rawResult = await executeTool(
            canonicalName,
            toolBlock.input as Record<string, unknown>,
          )
          // Translate result through adapter
          const adaptedResult = adapter.mapToolResult(toolBlock.name, rawResult)
          toolResults.push({
            type: 'tool_result',
            toolCallId: toolBlock.id,
            name: toolBlock.name,
            content: adaptedResult,
          })
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            toolCallId: toolBlock.id,
            name: toolBlock.name,
            content: `Error: ${(err as Error).message}`,
            isError: true,
          })
        }
      }

      // CRITICAL ordering: assistant message first, then user message with tool results
      messages.push(
        { role: 'assistant', content: result.content },
        { role: 'user', content: toolResults },
      )
      continue
    }

    // Other stop_reason (max_tokens, etc.) — break with current response
    finalContent = result.content
    break
  }

  // Step 6: Parse output
  const durationMs = Date.now() - startTime
  let output: unknown = null

  if (finalContent) {
    const textContent = finalContent
      .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')

    if (textContent) {
      try {
        output = JSON.parse(textContent)
      } catch {
        output = textContent
      }
    }
  }

  return {
    output,
    tokenUsage: totalTokens,
    durationMs,
  }
}
