import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock @anthropic-ai/sdk ───────────────────────────────────────────────────
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn()
  return { mockCreate }
})

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

// ── Mock tools module ────────────────────────────────────────────────────────
vi.mock('../pipeline/tools', () => ({
  createSandboxTools: vi.fn(() => [
    {
      name: 'read_file',
      description: 'Read file',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      name: 'list_files',
      description: 'List files',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
    {
      name: 'search_code',
      description: 'Search code',
      input_schema: {
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

function makeEndTurnResponse(json: object) {
  return {
    stop_reason: 'end_turn',
    content: [
      {
        type: 'text',
        text: '```json\n' + JSON.stringify(json) + '\n```',
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('stage-runner', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('completes with PASS verdict when Claude returns clean review', async () => {
    mockCreate.mockResolvedValueOnce(
      makeEndTurnResponse({
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
  })

  it('handles tool_use loop correctly', async () => {
    // First call: Claude requests a tool
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tool1',
          name: 'read_file',
          input: { path: 'src/index.ts' },
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    // Second call: Claude returns final answer
    mockCreate.mockResolvedValueOnce(
      makeEndTurnResponse({
        verdict: 'PASS',
        summary: 'Code looks good after review',
        findings: [],
      })
    )

    const result = await runStage(makeStageInput())

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.verdict).toBe('PASS')
    expect(result.tokenUsage).toBe(300) // 150 per call * 2
  })

  it('returns FLAG verdict on API failure via runStageWithRetry', async () => {
    mockCreate.mockRejectedValue(new Error('API rate limit exceeded'))

    const result = await runStageWithRetry(makeStageInput())

    expect(result.verdict).toBe('FLAG')
    expect(result.summary).toContain('failed after retry')
    expect(result.findings).toEqual([])
    expect(result.tokenUsage).toBe(0)
  })

  it('parses findings from Claude response', async () => {
    mockCreate.mockResolvedValueOnce(
      makeEndTurnResponse({
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
  })

  it('respects MAX_ITERATIONS limit', async () => {
    // Always return tool_use -- should stop after 25 iterations
    mockCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tool-loop',
          name: 'read_file',
          input: { path: 'src/index.ts' },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10 },
    })

    const result = await runStage(makeStageInput())

    expect(mockCreate).toHaveBeenCalledTimes(25)
    // Should return FLAG since no final end_turn response was received
    expect(result.verdict).toBe('FLAG')
    expect(result.summary).toBe('Stage did not produce a response')
  })

  it('handles max_tokens stop_reason gracefully', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'max_tokens',
      content: [
        {
          type: 'text',
          text: '```json\n{"verdict":"PASS","summary":"Partial review","findings":[]}\n```',
        },
      ],
      usage: { input_tokens: 200, output_tokens: 4096 },
    })

    const result = await runStage(makeStageInput())

    expect(result.verdict).toBe('PASS')
    expect(result.summary).toBe('Partial review')
  })

  it('falls back to FLAG when response has no valid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'end_turn',
      content: [
        {
          type: 'text',
          text: 'This is just plain text without any JSON block.',
        },
      ],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const result = await runStage(makeStageInput())

    expect(result.verdict).toBe('FLAG')
    expect(result.summary).toContain('This is just plain text')
  })

  it('skips invalid findings and keeps valid ones', async () => {
    mockCreate.mockResolvedValueOnce(
      makeEndTurnResponse({
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
  })
})
