import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VerdictSchema, FindingSchema } from '@gstackapp/shared'
import type { Stage, Verdict, Finding } from '@gstackapp/shared'
import { createSandboxTools, executeTool } from './tools'
import { resolveModel } from '@gstackapp/harness'
import type { ContentBlock, ConversationMessage, ToolResultBlock } from '@gstackapp/harness'
import { logger } from '../lib/logger'
import { trackLLMCall } from '../lib/posthog'

// ── Constants ────────────────────────────────────────────────────────────────

/** Tool_use loop cap per stage (Claude's discretion within limit) */
const MAX_ITERATIONS = 25

/** 5 minutes per stage timeout (D-13) */
const STAGE_TIMEOUT_MS = 5 * 60 * 1000

/** Prompt directory resolved from this module's location */
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Types ────────────────────────────────────────────────────────────────────

export interface StageInput {
  stage: Stage
  runId: string
  clonePath: string
  prFiles: Array<{
    filename: string
    status: string
    additions: number
    deletions: number
    patch?: string
  }>
  repoFullName: string
  headSha: string
  type: 'pr' | 'push'
  prNumber?: number
  baseSha?: string
}

export interface StageOutput {
  verdict: Verdict
  summary: string
  findings: Finding[]
  tokenUsage: number
  durationMs: number
  providerModel: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the user message content for a stage, including PR metadata,
 * changed files list, and truncated diff patches.
 */
function buildStageInput(input: StageInput): string {
  const totalAdditions = input.prFiles.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = input.prFiles.reduce((sum, f) => sum + f.deletions, 0)

  let content: string
  if (input.type === 'pr' && input.prNumber) {
    content = `## Pull Request #${input.prNumber}\n`
  } else {
    content = `## Push Review\n`
    if (input.baseSha) {
      content += `**Commits:** ${input.baseSha.slice(0, 7)}..${input.headSha.slice(0, 7)}\n`
    }
  }
  content += `**Repository:** ${input.repoFullName}\n`
  content += `**Head SHA:** ${input.headSha}\n`
  content += `**Files changed:** ${input.prFiles.length}\n`
  content += `**Total additions:** +${totalAdditions} / **deletions:** -${totalDeletions}\n\n`

  content += `### Changed Files\n\n`
  for (const file of input.prFiles) {
    content += `- \`${file.filename}\` (${file.status}) +${file.additions}/-${file.deletions}\n`
  }
  content += `\n`

  // Include truncated diff patches for the most significant files
  const PATCH_BUDGET = 15_000
  const filesWithPatches = input.prFiles
    .filter((f) => f.patch)
    .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))

  let usedChars = 0
  const patchSections: string[] = []
  for (const file of filesWithPatches) {
    if (!file.patch) continue
    const remaining = PATCH_BUDGET - usedChars
    if (remaining <= 0) break
    const truncated = file.patch.length > remaining
      ? file.patch.slice(0, remaining) + '\n... [truncated]'
      : file.patch
    patchSections.push(`#### ${file.filename}\n\`\`\`diff\n${truncated}\n\`\`\``)
    usedChars += truncated.length
  }

  if (patchSections.length > 0) {
    content += `### Diff Patches (most significant files)\n\n`
    content += patchSections.join('\n\n')
    content += `\n\n`
  }

  content += `### Instructions\n\n`
  content += `Use the \`read_file\`, \`list_files\`, and \`search_code\` tools to explore the repository for deeper analysis beyond the diff patches shown above.\n`

  return content
}

/**
 * Parse the structured output from the provider response.
 * Expects a JSON code block with verdict, summary, and findings array.
 * Falls back to FLAG with raw text summary on parse failure.
 */
function parseStageOutput(
  content: ContentBlock[] | null,
  stage: Stage
): { verdict: Verdict; summary: string; findings: Finding[] } {
  if (!content) {
    return { verdict: 'FLAG', summary: 'Stage did not produce a response', findings: [] }
  }

  const textBlocks = content.filter(
    (block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text'
  )
  const fullText = textBlocks.map((b) => b.text).join('\n')

  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      const verdict = VerdictSchema.parse(parsed.verdict)
      const summary = typeof parsed.summary === 'string' ? parsed.summary : ''
      const findings: Finding[] = []
      if (Array.isArray(parsed.findings)) {
        for (const raw of parsed.findings) {
          try {
            findings.push(FindingSchema.parse(raw))
          } catch {
            logger.warn({ stage, raw }, 'Skipping invalid finding from AI response')
          }
        }
      }
      return { verdict, summary, findings }
    } catch {
      logger.warn({ stage }, 'Failed to parse structured output from AI response')
    }
  }

  return { verdict: 'FLAG', summary: fullText.slice(0, 500), findings: [] }
}

// ── Stage Execution ──────────────────────────────────────────────────────────

/**
 * Execute a single pipeline stage: run a provider API conversation with
 * tool_use for sandboxed file access. Returns structured stage output.
 *
 * The loop:
 * 1. Send initial prompt with PR context
 * 2. Provider may request tool calls (read_file, list_files, search_code)
 * 3. Execute tools, send results back
 * 4. Repeat until provider returns end_turn or iteration limit reached
 * 5. Parse structured output from final response
 */
export async function runStage(input: StageInput): Promise<StageOutput> {
  const startTime = Date.now()

  // Resolve provider + model for this stage
  const { provider, providerName, model } = resolveModel(input.stage)
  const providerModel = `${providerName}:${model}`

  // Timeout via AbortController (D-13: 5 min per stage)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), STAGE_TIMEOUT_MS)

  try {
    // Load stage-specific prompt instructions
    const stageInstructions = readFileSync(
      resolve(__dirname, 'prompts', `${input.stage}.md`),
      'utf-8'
    )

    // Create sandbox tools for this clone (already in ToolDefinition format)
    const tools = createSandboxTools(input.clonePath)

    // Build user message content
    const userContent = buildStageInput(input)

    // Initialize conversation
    const messages: ConversationMessage[] = [
      { role: 'user' as const, content: userContent },
    ]

    let totalTokens = 0
    let finalContent: ContentBlock[] | null = null

    // Tool_use agentic loop
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const result = await provider.createCompletion({
        model,
        system: stageInstructions,
        messages,
        tools,
        maxTokens: 4096,
        signal: controller.signal,
      })

      totalTokens += result.usage.inputTokens + result.usage.outputTokens

      if (result.stopReason === 'end_turn') {
        finalContent = result.content
        break
      }

      if (result.stopReason === 'tool_use') {
        // Extract tool_use blocks and execute each
        const toolUseBlocks = result.content.filter(
          (block): block is Extract<ContentBlock, { type: 'tool_use' }> =>
            block.type === 'tool_use'
        )

        const toolResults: ToolResultBlock[] = []
        for (const toolBlock of toolUseBlocks) {
          try {
            const toolResult = await executeTool(
              toolBlock.name,
              toolBlock.input as Record<string, unknown>,
              input.clonePath
            )
            toolResults.push({
              type: 'tool_result',
              toolCallId: toolBlock.id,
              name: toolBlock.name,
              content: toolResult,
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
          { role: 'assistant' as const, content: result.content },
          { role: 'user' as const, content: toolResults }
        )
        continue
      }

      // Other stop_reason (max_tokens, etc.) -- break with current response
      finalContent = result.content
      break
    }

    const parsed = parseStageOutput(finalContent, input.stage)
    const durationMs = Date.now() - startTime

    logger.info(
      {
        stage: input.stage,
        runId: input.runId,
        verdict: parsed.verdict,
        findings: parsed.findings.length,
        tokenUsage: totalTokens,
        durationMs,
        providerModel,
      },
      'Stage completed'
    )

    trackLLMCall({
      stage: input.stage,
      provider: providerName,
      model,
      inputTokens: totalTokens,
      outputTokens: 0,
      durationMs,
      runId: input.runId,
      pipeline: 'review',
      success: true,
    })

    return {
      verdict: parsed.verdict,
      summary: parsed.summary,
      findings: parsed.findings,
      tokenUsage: totalTokens,
      durationMs,
      providerModel,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Run a stage with one retry on error (D-11).
 * If both attempts fail, returns FLAG verdict instead of throwing.
 */
export async function runStageWithRetry(input: StageInput): Promise<StageOutput> {
  try {
    return await runStage(input)
  } catch (firstError) {
    logger.warn(
      { stage: input.stage, error: (firstError as Error).message },
      'Stage failed, retrying'
    )
    try {
      return await runStage(input)
    } catch (retryError) {
      const { providerName, model } = resolveModel(input.stage)
      logger.error(
        { stage: input.stage, error: (retryError as Error).message },
        'Stage failed after retry'
      )
      return {
        verdict: 'FLAG' as const,
        summary: `Stage failed after retry: ${(retryError as Error).message}`,
        findings: [],
        tokenUsage: 0,
        durationMs: 0,
        providerModel: `${providerName}:${model}`,
      }
    }
  }
}
