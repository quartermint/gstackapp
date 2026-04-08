/**
 * Eval suite runner: executes prompts against providers and produces scored results.
 *
 * Eval prompts are hardcoded in prompts.ts (not user-supplied) per T-13-11.
 * Uses standard LLMProvider.createCompletion, no special permissions.
 */

import type { LLMProvider, CompletionParams } from '../types'
import type { EvalPrompt } from './prompts'
import { scoreResult, type ScoreResult } from './scorer'
import type { CapabilityEntry } from '../router/capability-matrix'

export interface EvalConfig {
  providers: Array<{ name: string; provider: LLMProvider; model: string }>
  prompts: EvalPrompt[]
  maxTokens?: number
}

export interface EvalResult {
  scores: ScoreResult[]
  matrix: CapabilityEntry[]
}

export async function runEval(config: EvalConfig): Promise<EvalResult> {
  const scores: ScoreResult[] = []

  for (const prompt of config.prompts) {
    for (const { name, provider, model } of config.providers) {
      const params: CompletionParams = {
        model,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.userMessage }],
        tools: [],
        maxTokens: config.maxTokens ?? 2048,
      }

      const start = Date.now()
      try {
        const result = await provider.createCompletion(params)
        const latencyMs = Date.now() - start
        const responseText = result.content
          .filter(b => b.type === 'text')
          .map(b => (b as { type: 'text'; text: string }).text)
          .join('\n')

        scores.push(scoreResult(
          responseText,
          prompt.rubric,
          prompt.id,
          `${name}:${model}`,
          latencyMs,
          { input: result.usage.inputTokens, output: result.usage.outputTokens },
        ))
      } catch (_err) {
        // Record failed eval
        scores.push({
          promptId: prompt.id,
          model: `${name}:${model}`,
          rubricScores: prompt.rubric.map(() => false),
          overallScore: 0,
          latencyMs: Date.now() - start,
          tokenUsage: { input: 0, output: 0 },
        })
      }
    }
  }

  // Build capability matrix entries from scores
  const matrix = buildMatrixFromScores(scores)

  return { scores, matrix }
}

function buildMatrixFromScores(scores: ScoreResult[]): CapabilityEntry[] {
  // Group by taskType + model
  const groups = new Map<string, ScoreResult[]>()
  for (const score of scores) {
    const taskType = score.promptId.split('-')[0]  // e.g., 'scaffold' from 'scaffold-01'
    const key = `${taskType}::${score.model}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(score)
  }

  return Array.from(groups.entries()).map(([key, groupScores]) => {
    const [taskType, ...modelParts] = key.split('::')
    const model = modelParts.join('::')
    const avgScore = groupScores.reduce((sum, s) => sum + s.overallScore, 0) / groupScores.length
    const avgLatency = groupScores.reduce((sum, s) => sum + s.latencyMs, 0) / groupScores.length
    const isLocal = model.includes('qwen') || model.includes('gemma')
    return {
      taskType,
      model,
      qualityScore: avgScore,
      latencyMs: avgLatency,
      costPerMToken: isLocal ? 0 : -1,  // -1 = unknown, to be filled
      recommended: avgScore >= 0.5,      // Recommended if >= 50% rubric pass rate
      sampleSize: groupScores.length,
    }
  })
}
