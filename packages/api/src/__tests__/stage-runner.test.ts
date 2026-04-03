import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock providers module ───────────────────────────────────────────────────
const { mockCreateCompletion } = vi.hoisted(() => {
  const mockCreateCompletion = vi.fn()
  return { mockCreateCompletion }
})

vi.mock('../pipeline/providers', () => ({
  resolveModel: vi.fn(() => ({
    provider: { name: 'anthropic', createCompletion: mockCreateCompletion },
    providerName: 'anthropic',
    model: 'claude-sonnet-4-6',
  })),
}))

// ── Mock tools module ────────────────────────────────────────────────────────
vi.mock('../pipeline/tools', () => ({
  createSandboxTools: vi.fn(() => [
    {
      name: 'read_file',
      description: 'Read file',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      name: 'list_files',
      description: 'List files',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      name: 'search_code',
      description: 'Search code',
      inputSchema: {
        type: 'object',
        properties: { pattern: { type: 'string' } },
        required: ['pattern'],
      },
    },
  ]),
  executeTool: vi.fn().mockResolvedValue('file contents here'),
}))

// ── Mock fs.readFileSync for prompt loading ──────────────────────────────────
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    readFileSync: vi.fn((path: string, encoding?: string) => {
      if (typeof path === 'string' && path.includes('prompts/')) {
        return '# Test Stage Prompt\nYou are a test reviewer. Output JSON with verdict, summary, findings.'
      }
      return original.readFileSync(path, encoding as any)
    }),
  }
})

// Import after mocks
import { runStage, runStageWithRetry } from '../pipeline/stage-runner'
import type { StageInput } from '../pipeline/stage-runner'
import type { Stage } from '@gstackapp/shared'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStageInput(overrides?: Partial<StageInput>): StageInput {
  return {
    stage: 'eng' as Stage,
    runId: 'test-run-123',
    clonePath: '/tmp/test-clone',
    prFiles: [
      {
        filename: 'src/index.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: '@@ -1,5 +1,10 @@\n+import { foo } from "./bar"',
      },
    ],
    repoFullName: 'owner/repo',
    prNumber: 42,
    headSha: 'abc1234',
    ...overrides,
  }
}

function makeEndTurnResult(json: object) {
  return {
    stopReason: 'end_turn' as const,
    content: [{ type: 'text' as const, text: '```json\n' + JSON.stringify(json) + '\n```' }],
    usage: { inputTokens: 100, outputTokens: 50 },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('stage-runner', () => {
  beforeEach(() => {
    mockCreateCompletion.mockReset()
  })

  it('completes with PASS verdict when provider returns clean review', async () => {
    mockCreateCompletion.mockResolvedValueOnce(
      makeEndTurnResult({
        verdict: 'PASS',
        summary: 'All good',
        findings: [],
      })
    )

    const result = await runStage(makeStageInput())

    expect(result.verdict).toBe('PASS')
    expect(result.summary).toBe('All good')
    expect(result.findings).toEqual([])
    expect(result.tokenUsage).toBe(150) // 100 input + 50 output
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })

  it('handles tool_use loop correctly', async () => {
    // First call: provider requests a tool
    mockCreateCompletion.mockResolvedValueOnce({
      stopReason: 'tool_use' as const,
      content: [
        {
          type: 'tool_use' as const,
          id: 'tool1',
          name: 'read_file',
          input: { path: 'src/index.ts' },
        },
      ],
      usage: { inputTokens: 100, outputTokens: 50 },
    })

    // Second call: provider returns final answer
    mockCreateCompletion.mockResolvedValueOnce(
      makeEndTurnResult({
        verdict: 'PASS',
        summary: 'Code looks good after review',
        findings: [],
      })
    )

    const result = await runStage(makeStageInput())

    expect(mockCreateCompletion).toHaveBeenCalledTimes(2)
    expect(result.verdict).toBe('PASS')
    expect(result.tokenUsage).toBe(300) // 150 per call * 2
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })

  it('returns FLAG verdict on API failure via runStageWithRetry', async () => {
    mockCreateCompletion.mockRejectedValue(new Error('API rate limit exceeded'))

    const result = await runStageWithRetry(makeStageInput())

    expect(result.verdict).toBe('FLAG')
    expect(result.summary).toContain('failed after retry')
    expect(result.findings).toEqual([])
    expect(result.tokenUsage).toBe(0)
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })

  it('parses findings from provider response', async () => {
    mockCreateCompletion.mockResolvedValueOnce(
      makeEndTurnResult({
        verdict: 'FLAG',
        summary: 'Found some issues',
        findings: [
          {
            severity: 'notable',
            category: 'code-quality',
            title: 'Missing error handling',
            description: 'The function does not handle errors properly',
            filePath: 'src/index.ts',
            lineStart: 10,
            lineEnd: 15,
            suggestion: 'Add try-catch block',
            codeSnippet: 'const result = await fetch(url)',
          },
        ],
      })
    )

    const result = await runStage(makeStageInput())

    expect(result.verdict).toBe('FLAG')
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('notable')
    expect(result.findings[0].category).toBe('code-quality')
    expect(result.findings[0].title).toBe('Missing error handling')
    expect(result.findings[0].filePath).toBe('src/index.ts')
    expect(result.findings[0].lineStart).toBe(10)
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })

  it('respects MAX_ITERATIONS limit', async () => {
    // Always return tool_use -- should stop after 25 iterations
    mockCreateCompletion.mockResolvedValue({
      stopReason: 'tool_use' as const,
      content: [
        {
          type: 'tool_use' as const,
          id: 'tool-loop',
          name: 'read_file',
          input: { path: 'src/index.ts' },
        },
      ],
      usage: { inputTokens: 10, outputTokens: 10 },
    })

    const result = await runStage(makeStageInput())

    expect(mockCreateCompletion).toHaveBeenCalledTimes(25)
    // Should return FLAG since no final end_turn response was received
    expect(result.verdict).toBe('FLAG')
    expect(result.summary).toBe('Stage did not produce a response')
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })

  it('handles max_tokens stop_reason gracefully', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      stopReason: 'max_tokens' as const,
      content: [
        {
          type: 'text' as const,
          text: '```json\n{"verdict":"PASS","summary":"Partial review","findings":[]}\n```',
        },
      ],
      usage: { inputTokens: 200, outputTokens: 4096 },
    })

    const result = await runStage(makeStageInput())

    expect(result.verdict).toBe('PASS')
    expect(result.summary).toBe('Partial review')
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })

  it('falls back to FLAG when response has no valid JSON', async () => {
    mockCreateCompletion.mockResolvedValueOnce({
      stopReason: 'end_turn' as const,
      content: [
        {
          type: 'text' as const,
          text: 'This is just plain text without any JSON block.',
        },
      ],
      usage: { inputTokens: 100, outputTokens: 50 },
    })

    const result = await runStage(makeStageInput())

    expect(result.verdict).toBe('FLAG')
    expect(result.summary).toContain('This is just plain text')
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })

  it('skips invalid findings and keeps valid ones', async () => {
    mockCreateCompletion.mockResolvedValueOnce(
      makeEndTurnResult({
        verdict: 'FLAG',
        summary: 'Mixed findings',
        findings: [
          {
            severity: 'critical',
            category: 'security',
            title: 'SQL injection',
            description: 'User input used in query',
          },
          {
            // Invalid: missing required fields
            severity: 'INVALID_SEVERITY',
            category: 123,
          },
        ],
      })
    )

    const result = await runStage(makeStageInput())

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].title).toBe('SQL injection')
    expect(result.providerModel).toBe('anthropic:claude-sonnet-4-6')
  })
})
