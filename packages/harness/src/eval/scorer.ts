/**
 * Quality comparison scoring for eval results.
 *
 * Uses heuristic keyword matching against rubric items -- not perfect,
 * but provides a starting signal for capability matrix population.
 */

export interface ScoreResult {
  promptId: string
  model: string
  rubricScores: boolean[]    // Per-rubric pass/fail
  overallScore: number       // 0-1 (fraction of rubric items passed)
  latencyMs: number
  tokenUsage: { input: number; output: number }
}

export function scoreResult(
  response: string,
  rubric: string[],
  promptId: string,
  model: string,
  latencyMs: number,
  usage: { input: number; output: number },
): ScoreResult {
  // Automated scoring: check if response contains evidence of addressing each rubric item
  // This is a heuristic scorer -- not perfect, but gives a starting signal
  const rubricScores = rubric.map(criterion => {
    const keywords = criterion.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    const responseL = response.toLowerCase()
    // At least 40% of significant keywords from rubric appear in response
    const matchCount = keywords.filter(kw => responseL.includes(kw)).length
    return matchCount >= Math.max(1, Math.ceil(keywords.length * 0.4))
  })

  return {
    promptId,
    model,
    rubricScores,
    overallScore: rubricScores.filter(Boolean).length / rubricScores.length,
    latencyMs,
    tokenUsage: usage,
  }
}

export function compareResults(a: ScoreResult, b: ScoreResult): {
  winner: string
  qualityDelta: number
  latencyDelta: number
} {
  const qualityDelta = a.overallScore - b.overallScore
  const latencyDelta = a.latencyMs - b.latencyMs
  return {
    winner: qualityDelta > 0 ? a.model : qualityDelta < 0 ? b.model : 'tie',
    qualityDelta,
    latencyDelta,
  }
}
