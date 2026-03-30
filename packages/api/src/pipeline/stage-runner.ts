import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VerdictSchema, FindingSchema } from '@gstackapp/shared'
import type { Stage, Verdict, Finding } from '@gstackapp/shared'
import { createSandboxTools, executeTool } from './tools'
import { logger } from '../lib/logger'

// ── Constants ────────────────────────────────────────────────────────────────

/** Model selection per stage (D-01: mixed model strategy) */
const MODEL_MAP: Record<Stage, string> = {
  ceo: 'claude-opus-4-6',       // D-01: Opus for high-judgment
  security: 'claude-opus-4-6',  // D-01: Opus for security
  eng: 'claude-sonnet-4-6',     // D-01: Sonnet for pattern matching
  design: 'claude-sonnet-4-6',  // D-01: Sonnet for design
  qa: 'claude-sonnet-4-6',      // D-01: Sonnet for QA
}

/** Tool_use loop cap per stage (Claude's discretion within limit) */
const MAX_ITERATIONS = 25

/** 5 minutes per stage timeout (D-13) */
const STAGE_TIMEOUT_MS = 5 * 60 * 1000

/** Shared Anthropic client -- reads ANTHROPIC_API_KEY from env automatically */
const anthropic = new Anthropic()

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
  prNumber: number
  headSha: string
}

export interface StageOutput {
  verdict: Verdict
  summary: string
  findings: Finding[]
  tokenUsage: number
  durationMs: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the user message content for a stage, including PR metadata,
 * changed files list, and truncated diff patches.
 */
function buildStageInput(input: StageInput): string {
  const totalAdditions = input.prFiles.reduce((sum, f) => sum + f.additions, 0)
  const totalDeletions = input.prFiles.reduce((sum, f) => sum + f.deletions, 0)

  let content = `## Pull Request #${input.prNumber}\n`
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
 * Parse the structured output from Claude's response.
 * Expects a JSON code block with verdict, summary, and findings array.
 * Falls back to FLAG with raw text summary on parse failure.
 */
function parseStageOutput(
  response: Anthropic.Message | null,
  stage: Stage
): { verdict: Verdict; summary: string; findings: Finding[] } {
  if (!response) {
    return { verdict: 'FLAG', summary: 'Stage did not produce a response', findings: [] }
  }

  // Extract text blocks
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )
  const fullText = textBlocks.map((b) => b.text).join('\n')

  // Try to find and parse JSON code block
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
      // JSON parse or Zod validation failed -- fall through to fallback
      logger.warn({ stage }, 'Failed to parse structured output from AI response')
    }
  }

  // Fallback: return FLAG with raw text
  return { verdict: 'FLAG', summary: fullText.slice(0, 500), findings: [] }
}

// ── Stage Execution ──────────────────────────────────────────────────────────

/**
 * Execute a single pipeline stage: run a Claude API conversation with
 * tool_use for sandboxed file access. Returns structured stage output.
 *
 * The loop:
 * 1. Send initial prompt with PR context
 * 2. Claude may request tool calls (read_file, list_files, search_code)
 * 3. Execute tools, send results back
 * 4. Repeat until Claude returns end_turn or iteration limit reached
 * 5. Parse structured output from final response
 */
export async function runStage(input: StageInput): Promise<StageOutput> {
  const startTime = Date.now()

  // Timeout via AbortController (D-13: 5 min per stage)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), STAGE_TIMEOUT_MS)

  try {
    // Load stage-specific prompt instructions
    const stageInstructions = readFileSync(
      resolve(__dirname, 'prompts', `${input.stage}.md`),
      'utf-8'
    )

    // Create sandbox tools for this clone
    const tools = createSandboxTools(input.clonePath)

    // Add cache_control to the LAST tool definition for prompt caching
    const toolsWithCaching: Anthropic.Tool[] = tools.map((tool, i) => {
      if (i === tools.length - 1) {
        return { ...tool, cache_control: { type: 'ephemeral' as const } }
      }
      return tool
    })

    // Build user message content
    const userContent = buildStageInput(input)

    // Initialize conversation
    const messages: Anthropic.MessageParam[] = [
      { role: 'user' as const, content: userContent },
    ]

    let totalTokens = 0
    let finalResponse: Anthropic.Message | null = null

    // Tool_use agentic loop
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await anthropic.messages.create(
        {
          model: MODEL_MAP[input.stage],
          max_tokens: 4096,
          system: [
            {
              type: 'text',
              text: stageInstructions,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: toolsWithCaching,
          messages,
        },
        { signal: controller.signal }
      )

      totalTokens += response.usage.input_tokens + response.usage.output_tokens

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'refusal') {
        finalResponse = response
        break
      }

      if (response.stop_reason === 'tool_use') {
        // Extract tool_use blocks and execute each
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        )

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolBlock of toolUseBlocks) {
          try {
            const result = await executeTool(
              toolBlock.name,
              toolBlock.input as Record<string, unknown>,
              input.clonePath
            )
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: result,
            })
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: `Error: ${(err as Error).message}`,
              is_error: true,
            })
          }
        }

        // CRITICAL ordering: assistant message first, then user message with tool results
        // Tool results MUST come first in user content array
        messages.push(
          { role: 'assistant' as const, content: response.content },
          { role: 'user' as const, content: toolResults }
        )
        continue
      }

      // Other stop_reason (max_tokens, etc.) -- break with current response
      finalResponse = response
      break
    }

    const parsed = parseStageOutput(finalResponse, input.stage)
    const durationMs = Date.now() - startTime

    logger.info(
      {
        stage: input.stage,
        runId: input.runId,
        verdict: parsed.verdict,
        findings: parsed.findings.length,
        tokenUsage: totalTokens,
        durationMs,
      },
      'Stage completed'
    )

    return {
      verdict: parsed.verdict,
      summary: parsed.summary,
      findings: parsed.findings,
      tokenUsage: totalTokens,
      durationMs,
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
      }
    }
  }
}
