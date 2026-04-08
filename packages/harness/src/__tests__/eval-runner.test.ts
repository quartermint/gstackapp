import { describe, it, expect, vi } from 'vitest'
import type { LLMProvider, CompletionParams, CompletionResult } from '../types'
import { runEval } from '../eval/runner'
import { scoreResult, compareResults } from '../eval/scorer'
import { EVAL_PROMPTS } from '../eval/prompts'
import type { EvalPrompt } from '../eval/prompts'

// -- Mock Provider -----------------------------------------------------------

class MockEvalProvider implements LLMProvider {
  readonly name: string
  private response: string
  calls: CompletionParams[] = []

  constructor(name: string, response: string) {
    this.name = name
    this.response = response
  }

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    this.calls.push(params)
    return {
      stopReason: 'end_turn',
      content: [{ type: 'text', text: this.response }],
      usage: { inputTokens: 200, outputTokens: 150 },
    }
  }
}

// -- Tests -------------------------------------------------------------------

describe('Eval Runner', () => {
  // Test 5: Eval runner executes a prompt against a mock provider and returns EvalResult
  it('executes a prompt against a mock provider and returns EvalResult with response + latency + usage', async () => {
    const provider = new MockEvalProvider(
      'test',
      'Here is a function exported correctly with TypeScript types and regex that handles common email formats. No runtime errors.',
    )

    const prompt: EvalPrompt = {
      id: 'scaffold-01',
      taskType: 'scaffolding',
      system: 'You are a code generation assistant.',
      userMessage: 'Create a TypeScript function.',
      expectedCapabilities: ['code-generation'],
      rubric: ['Function exported correctly', 'Regex handles common email formats', 'TypeScript types present', 'No runtime errors'],
    }

    const result = await runEval({
      providers: [{ name: 'test', provider, model: 'test-model' }],
      prompts: [prompt],
    })

    expect(result.scores).toHaveLength(1)
    expect(result.scores[0].promptId).toBe('scaffold-01')
    expect(result.scores[0].model).toBe('test:test-model')
    expect(result.scores[0].latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.scores[0].tokenUsage).toEqual({ input: 200, output: 150 })
    expect(result.scores[0].overallScore).toBeGreaterThanOrEqual(0)
    expect(result.scores[0].overallScore).toBeLessThanOrEqual(1)

    // Matrix entries should be built
    expect(result.matrix).toHaveLength(1)
    expect(result.matrix[0].taskType).toBe('scaffold')
    expect(result.matrix[0].model).toBe('test:test-model')
  })

  it('records failed eval with zero scores when provider throws', async () => {
    const failProvider: LLMProvider = {
      name: 'fail',
      async createCompletion() {
        throw new Error('API error')
      },
    }

    const prompt: EvalPrompt = {
      id: 'review-01',
      taskType: 'review',
      system: 'Review code.',
      userMessage: 'Review this.',
      expectedCapabilities: ['review'],
      rubric: ['Finds bugs', 'Suggests fixes'],
    }

    const result = await runEval({
      providers: [{ name: 'fail', provider: failProvider, model: 'fail-model' }],
      prompts: [prompt],
    })

    expect(result.scores).toHaveLength(1)
    expect(result.scores[0].overallScore).toBe(0)
    expect(result.scores[0].rubricScores).toEqual([false, false])
  })
})

describe('Eval Scorer', () => {
  // Test 6: Eval scorer compares two results and produces quality delta score
  it('compares two results and produces quality delta score', () => {
    const resultA = scoreResult(
      'This function is exported correctly with TypeScript types and handles email formats via regex. No runtime errors.',
      ['Function exported correctly', 'TypeScript types present'],
      'scaffold-01',
      'model-a',
      1000,
      { input: 100, output: 50 },
    )

    const resultB = scoreResult(
      'Here is some code.',
      ['Function exported correctly', 'TypeScript types present'],
      'scaffold-01',
      'model-b',
      500,
      { input: 80, output: 30 },
    )

    const comparison = compareResults(resultA, resultB)
    expect(comparison.winner).toBe('model-a')
    expect(comparison.qualityDelta).toBeGreaterThan(0) // A is better
    expect(comparison.latencyDelta).toBe(500) // A is slower
  })

  it('returns tie when scores are equal', () => {
    const result: any = {
      promptId: 'test',
      model: 'a',
      rubricScores: [true],
      overallScore: 0.5,
      latencyMs: 1000,
      tokenUsage: { input: 100, output: 50 },
    }
    const resultB = { ...result, model: 'b' }

    const comparison = compareResults(result, resultB)
    expect(comparison.winner).toBe('tie')
    expect(comparison.qualityDelta).toBe(0)
  })
})

describe('EVAL_PROMPTS', () => {
  // Test 7: EVAL_PROMPTS contains at least 4 task types with 2+ prompts each
  it('contains at least 4 task types with 2+ prompts each', () => {
    const taskTypes = new Map<string, number>()
    for (const prompt of EVAL_PROMPTS) {
      taskTypes.set(prompt.taskType, (taskTypes.get(prompt.taskType) ?? 0) + 1)
    }

    expect(taskTypes.size).toBeGreaterThanOrEqual(4)

    for (const [taskType, count] of taskTypes) {
      expect(count, `${taskType} should have at least 2 prompts`).toBeGreaterThanOrEqual(2)
    }
  })

  it('has at least 8 total prompts', () => {
    expect(EVAL_PROMPTS.length).toBeGreaterThanOrEqual(8)
  })

  it('each prompt has non-empty rubric', () => {
    for (const prompt of EVAL_PROMPTS) {
      expect(prompt.rubric.length, `${prompt.id} should have rubric items`).toBeGreaterThan(0)
    }
  })
})
