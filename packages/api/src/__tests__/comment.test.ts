import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderSkeleton, renderComment, renderCrossRepoSection, COMMENT_MARKER_PREFIX, MAX_COMMENT_LENGTH, MAX_FINDINGS_PER_STAGE } from '../github/comment-renderer'
import { createSkeletonComment, updatePRComment } from '../github/comment'
import type { CrossRepoMatch } from '../embeddings/search'
import { getTestDb } from './helpers/test-db'
import { pipelineRuns, pullRequests, repositories, githubInstallations, stageResults, findings as findingsTable } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { Finding } from '@gstackapp/shared'

// ── Test Fixtures ──────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<Finding> & { severity: Finding['severity'] }): Finding {
  return {
    category: 'test',
    title: 'Test finding',
    description: 'Test description',
    ...overrides,
  }
}

interface StageData {
  stage: string
  verdict: string
  summary?: string
}

interface FindingWithStage extends Finding {
  stage: string
}

// ── Shared mock Octokit ────────────────────────────────────────────────────

const mockCreateComment = vi.fn().mockResolvedValue({ data: { id: 999 } })
const mockUpdateComment = vi.fn().mockResolvedValue({ data: { id: 999 } })
const mockListComments = vi.fn().mockResolvedValue({ data: [] })

const mockOctokit = {
  issues: {
    createComment: mockCreateComment,
    updateComment: mockUpdateComment,
    listComments: mockListComments,
  },
} as any

// ── Setup helper: insert prerequisite rows ─────────────────────────────────

function setupTestData(runId: string, opts?: { commentId?: number }) {
  const { db } = getTestDb()

  db.insert(githubInstallations).values({
    id: 1,
    accountLogin: 'testorg',
    accountType: 'Organization',
    appId: 12345,
  }).run()

  db.insert(repositories).values({
    id: 100,
    installationId: 1,
    fullName: 'testorg/testrepo',
  }).run()

  db.insert(pullRequests).values({
    id: 1,
    repoId: 100,
    number: 42,
    title: 'Test PR',
    authorLogin: 'testuser',
    headSha: 'abc123',
    baseBranch: 'main',
  }).run()

  db.insert(pipelineRuns).values({
    id: runId,
    deliveryId: `del-${runId}`,
    prId: 1,
    installationId: 1,
    headSha: 'abc123',
    status: 'RUNNING',
    ...(opts?.commentId != null ? { commentId: opts.commentId } : {}),
  }).run()

  for (const stage of ['ceo', 'eng', 'design', 'qa', 'security']) {
    db.insert(stageResults).values({
      id: `sr-${runId}-${stage}`,
      pipelineRunId: runId,
      stage,
      verdict: 'PASS',
    }).run()
  }
}

// ── renderSkeleton ─────────────────────────────────────────────────────────

describe('renderSkeleton', () => {
  it('includes the hidden marker comment', () => {
    const result = renderSkeleton('run-123')
    expect(result).toContain('<!-- gstackapp-review:run-123 -->')
  })

  it('includes pipeline topology with "..." for all verdicts', () => {
    const result = renderSkeleton('run-123')
    // Should have 5 "..." entries (one per stage)
    const dotCount = (result.match(/\.\.\./g) || []).length
    expect(dotCount).toBeGreaterThanOrEqual(5)
  })

  it('includes running message', () => {
    const result = renderSkeleton('run-123')
    expect(result).toContain('Pipeline running')
  })

  it('includes all stage names', () => {
    const result = renderSkeleton('run-123')
    expect(result).toContain('CEO')
    expect(result).toContain('Eng')
    expect(result).toContain('Design')
    expect(result).toContain('QA')
    expect(result).toContain('Security')
  })
})

// ── renderComment ──────────────────────────────────────────────────────────

describe('renderComment', () => {
  const baseInput = {
    runId: 'run-456',
    headSha: 'abc1234567890',
    durationMs: 5000,
  }

  it('includes hidden marker in output', () => {
    const result = renderComment({
      ...baseInput,
      stages: [],
      allFindings: [],
    })
    expect(result).toContain('<!-- gstackapp-review:run-456 -->')
  })

  it('renders full pipeline with all 5 stages completed', () => {
    const stages: StageData[] = [
      { stage: 'ceo', verdict: 'PASS', summary: 'Looks good' },
      { stage: 'eng', verdict: 'FLAG', summary: 'Some concerns' },
      { stage: 'design', verdict: 'SKIP' },
      { stage: 'qa', verdict: 'BLOCK', summary: 'Critical bugs' },
      { stage: 'security', verdict: 'PASS', summary: 'Secure' },
    ]
    const findings: FindingWithStage[] = [
      { ...makeFinding({ severity: 'critical', title: 'SQL Injection' }), stage: 'qa' },
      { ...makeFinding({ severity: 'notable', title: 'Missing test' }), stage: 'eng' },
      { ...makeFinding({ severity: 'minor', title: 'Style issue' }), stage: 'eng' },
    ]

    const result = renderComment({ ...baseInput, stages, allFindings: findings })

    // Topology header should show all stages
    expect(result).toContain('CEO')
    expect(result).toContain('Eng')
    expect(result).toContain('Design')
    expect(result).toContain('QA')
    expect(result).toContain('Security')

    // Should show verdicts
    expect(result).toContain('PASS')
    expect(result).toContain('FLAG')
    expect(result).toContain('**BLOCK**')

    // Should show signal ratio
    expect(result).toContain('findings actionable')

    // Should show head sha (first 7 chars)
    expect(result).toContain('abc1234')
  })

  it('renders incremental state with pending stages', () => {
    const stages: StageData[] = [
      { stage: 'ceo', verdict: 'PASS', summary: 'Good' },
      { stage: 'eng', verdict: 'RUNNING' },
      { stage: 'design', verdict: 'PENDING' },
      { stage: 'qa', verdict: 'PENDING' },
      { stage: 'security', verdict: 'PENDING' },
    ]

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: [],
    })

    // CEO should show PASS
    expect(result).toContain('PASS')
    // Pending stages show "..."
    expect(result).toContain('...')
  })

  it('shows skip message for SKIP stages', () => {
    const stages: StageData[] = [
      { stage: 'design', verdict: 'SKIP' },
    ]

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: [],
    })

    expect(result).toContain('skipped')
  })

  it('shows no findings message for PASS stages', () => {
    const stages: StageData[] = [
      { stage: 'security', verdict: 'PASS' },
    ]

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: [],
    })

    expect(result).toContain('No significant findings')
  })

  it('wraps minor findings in collapsible details section', () => {
    const stages: StageData[] = [
      { stage: 'eng', verdict: 'FLAG' },
    ]
    const findings: FindingWithStage[] = [
      { ...makeFinding({ severity: 'minor', title: 'Style nit 1' }), stage: 'eng' },
      { ...makeFinding({ severity: 'minor', title: 'Style nit 2' }), stage: 'eng' },
    ]

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: findings,
    })

    expect(result).toContain('<details>')
    expect(result).toContain('<summary>')
    expect(result).toContain('Minor findings')
    expect(result).toContain('</details>')
  })

  it('truncates finding descriptions at 500 chars', () => {
    const longDesc = 'x'.repeat(600)
    const stages: StageData[] = [
      { stage: 'eng', verdict: 'FLAG' },
    ]
    const findings: FindingWithStage[] = [
      { ...makeFinding({ severity: 'critical', description: longDesc }), stage: 'eng' },
    ]

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: findings,
    })

    // Should not contain the full 600-char description
    expect(result).not.toContain(longDesc)
    // Should contain truncation indicator
    expect(result).toContain('...')
  })

  it('limits findings per stage to MAX_FINDINGS_PER_STAGE', () => {
    const stages: StageData[] = [
      { stage: 'qa', verdict: 'BLOCK' },
    ]
    const findings: FindingWithStage[] = Array.from({ length: 15 }, (_, i) => ({
      ...makeFinding({ severity: 'critical', title: `Finding ${i + 1}` }),
      stage: 'qa',
    }))

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: findings,
    })

    // Should mention overflow
    expect(result).toContain('more findings')
  })

  it('truncates total body at MAX_COMMENT_LENGTH', () => {
    // Create many stages worth of findings with long content to push over the limit
    const manyStages: StageData[] = [
      { stage: 'ceo', verdict: 'FLAG' },
      { stage: 'eng', verdict: 'FLAG' },
      { stage: 'design', verdict: 'FLAG' },
      { stage: 'qa', verdict: 'FLAG' },
      { stage: 'security', verdict: 'FLAG' },
    ]
    const manyFindings: FindingWithStage[] = []
    for (const s of ['ceo', 'eng', 'design', 'qa', 'security']) {
      for (let i = 0; i < MAX_FINDINGS_PER_STAGE; i++) {
        manyFindings.push({
          ...makeFinding({
            severity: 'critical',
            title: `Finding ${s}-${i}`,
            description: 'x'.repeat(490),
            suggestion: 'y'.repeat(490),
            codeSnippet: 'z'.repeat(490),
          }),
          stage: s,
        })
      }
    }

    const result = renderComment({
      ...baseInput,
      stages: manyStages,
      allFindings: manyFindings,
    })

    expect(result.length).toBeLessThanOrEqual(MAX_COMMENT_LENGTH)
    if (result.includes('truncated')) {
      expect(result).toContain('truncated')
    }
  })

  it('sorts stages by severity order (BLOCK first, FLAG, PASS, SKIP last)', () => {
    const stages: StageData[] = [
      { stage: 'ceo', verdict: 'PASS' },
      { stage: 'eng', verdict: 'FLAG' },
      { stage: 'design', verdict: 'SKIP' },
      { stage: 'qa', verdict: 'BLOCK' },
      { stage: 'security', verdict: 'PASS' },
    ]

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: [],
    })

    // Find the stage section headers (### lines)
    const sectionHeaders = result.split('\n')
      .filter(line => line.startsWith('### '))

    // Extract verdicts from section headers
    const sectionVerdicts = sectionHeaders.map(h => {
      if (h.includes('**BLOCK**')) return 'BLOCK'
      if (h.includes('~~SKIP~~')) return 'SKIP'
      if (h.includes('FLAG')) return 'FLAG'
      if (h.includes('PASS')) return 'PASS'
      return 'UNKNOWN'
    })

    // BLOCK should come before FLAG which comes before PASS which comes before SKIP
    const blockIdx = sectionVerdicts.indexOf('BLOCK')
    const flagIdx = sectionVerdicts.indexOf('FLAG')
    const firstPassIdx = sectionVerdicts.indexOf('PASS')
    const skipIdx = sectionVerdicts.indexOf('SKIP')

    expect(blockIdx).toBeLessThan(flagIdx)
    expect(flagIdx).toBeLessThan(firstPassIdx)
    expect(firstPassIdx).toBeLessThan(skipIdx)
  })

  it('includes footer with gstackapp link', () => {
    const result = renderComment({
      ...baseInput,
      stages: [],
      allFindings: [],
    })

    expect(result).toContain('gstackapp')
  })

  it('renders finding details with file path and line numbers', () => {
    const stages: StageData[] = [
      { stage: 'security', verdict: 'BLOCK' },
    ]
    const findings: FindingWithStage[] = [
      {
        ...makeFinding({
          severity: 'critical',
          title: 'SQL Injection',
          filePath: 'src/api/users.ts',
          lineStart: 42,
          lineEnd: 50,
          suggestion: 'Use parameterized queries',
        }),
        stage: 'security',
      },
    ]

    const result = renderComment({
      ...baseInput,
      stages,
      allFindings: findings,
    })

    expect(result).toContain('src/api/users.ts')
    expect(result).toContain('42')
    expect(result).toContain('SQL Injection')
    expect(result).toContain('parameterized queries')
  })
})

// ── Comment Manager (updatePRComment, createSkeletonComment) ───────────────

describe('Comment Manager', () => {
  beforeEach(() => {
    mockCreateComment.mockClear()
    mockUpdateComment.mockClear()
    mockListComments.mockClear()
    mockCreateComment.mockResolvedValue({ data: { id: 999 } })
    mockUpdateComment.mockResolvedValue({ data: { id: 999 } })
    mockListComments.mockResolvedValue({ data: [] })
  })

  it('createSkeletonComment creates a comment and stores commentId', async () => {
    setupTestData('run-skel-1')

    await createSkeletonComment({
      octokit: mockOctokit,
      owner: 'testorg',
      repo: 'testrepo',
      prNumber: 42,
      runId: 'run-skel-1',
    })

    // Should have called createComment
    expect(mockCreateComment).toHaveBeenCalledTimes(1)
    const callArgs = mockCreateComment.mock.calls[0][0]
    expect(callArgs.owner).toBe('testorg')
    expect(callArgs.repo).toBe('testrepo')
    expect(callArgs.issue_number).toBe(42)
    expect(callArgs.body).toContain('gstackapp-review')

    // Should have stored the commentId in DB
    const { db } = getTestDb()
    const run = db.select().from(pipelineRuns).where(eq(pipelineRuns.id, 'run-skel-1')).get()
    expect(run?.commentId).toBe(999)
  })

  it('updatePRComment uses fast path when commentId exists', async () => {
    setupTestData('run-fast-1', { commentId: 888 })

    await updatePRComment({
      octokit: mockOctokit,
      owner: 'testorg',
      repo: 'testrepo',
      prNumber: 42,
      runId: 'run-fast-1',
    })

    // Fast path: should call updateComment, NOT listComments
    expect(mockUpdateComment).toHaveBeenCalledTimes(1)
    expect(mockListComments).not.toHaveBeenCalled()
    expect(mockUpdateComment.mock.calls[0][0].comment_id).toBe(888)
  })

  it('updatePRComment uses slow path when no commentId', async () => {
    setupTestData('run-slow-1')

    // Slow path: listComments finds an existing comment with marker
    mockListComments.mockResolvedValue({
      data: [
        { id: 777, body: '<!-- gstackapp-review:run-slow-1 -->\nOld body' },
      ],
    })

    await updatePRComment({
      octokit: mockOctokit,
      owner: 'testorg',
      repo: 'testrepo',
      prNumber: 42,
      runId: 'run-slow-1',
    })

    // Slow path: should call listComments then updateComment
    expect(mockListComments).toHaveBeenCalledTimes(1)
    expect(mockUpdateComment).toHaveBeenCalledTimes(1)
    expect(mockUpdateComment.mock.calls[0][0].comment_id).toBe(777)
  })

  it('updatePRComment creates new comment when no existing found', async () => {
    setupTestData('run-new-1')

    // No existing comments
    mockListComments.mockResolvedValue({ data: [] })

    await updatePRComment({
      octokit: mockOctokit,
      owner: 'testorg',
      repo: 'testrepo',
      prNumber: 42,
      runId: 'run-new-1',
    })

    // Should list comments (slow path), then create since none found
    expect(mockListComments).toHaveBeenCalledTimes(1)
    expect(mockCreateComment).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent updatePRComment calls via mutex', async () => {
    setupTestData('run-mutex-1', { commentId: 555 })

    // Track execution order
    const executionOrder: string[] = []

    mockUpdateComment.mockImplementation(async () => {
      executionOrder.push('start')
      // Small delay to simulate API call
      await new Promise(r => setTimeout(r, 10))
      executionOrder.push('end')
      return { data: { id: 555 } }
    })

    // Fire two concurrent calls for the same PR
    const promise1 = updatePRComment({
      octokit: mockOctokit,
      owner: 'testorg',
      repo: 'testrepo',
      prNumber: 42,
      runId: 'run-mutex-1',
    })
    const promise2 = updatePRComment({
      octokit: mockOctokit,
      owner: 'testorg',
      repo: 'testrepo',
      prNumber: 42,
      runId: 'run-mutex-1',
    })

    await Promise.all([promise1, promise2])

    // With mutex, calls should be serialized: start, end, start, end
    // Not interleaved: start, start, end, end
    expect(executionOrder).toEqual(['start', 'end', 'start', 'end'])
  })
})

// ── Cross-repo callout rendering ──────────────────────────────────────────

describe('renderCrossRepoSection', () => {
  const sampleMatches: CrossRepoMatch[] = [
    {
      finding_id: 'f-cross-1',
      title: 'SQL Injection risk',
      description: 'Potential SQL injection in query builder',
      file_path: 'src/db/queries.ts',
      repo_full_name: 'otherorg/backend',
      distance: 0.1,
      stage: 'security',
      severity: 'critical',
    },
    {
      finding_id: 'f-cross-2',
      title: 'Missing input validation',
      description: 'No validation on user input',
      file_path: null,
      repo_full_name: 'otherorg/api',
      distance: 0.12,
      stage: 'eng',
      severity: 'notable',
    },
  ]

  it('cross-repo callout renders when matches provided', () => {
    const result = renderCrossRepoSection(sampleMatches)
    expect(result).toContain('Seen in your other repos')
  })

  it('cross-repo callout omitted when no matches', () => {
    const result = renderCrossRepoSection([])
    expect(result).toBe('')
  })

  it('cross-repo callout shows repo name and similarity', () => {
    const result = renderCrossRepoSection(sampleMatches)
    expect(result).toContain('otherorg/backend')
    expect(result).toContain('90% similar')
    expect(result).toContain('otherorg/api')
    expect(result).toContain('88% similar')
  })

  it('cross-repo callout includes file path when present', () => {
    const result = renderCrossRepoSection(sampleMatches)
    expect(result).toContain('src/db/queries.ts')
  })

  it('cross-repo callout omits file path when null', () => {
    const result = renderCrossRepoSection([
      { ...sampleMatches[1], file_path: null },
    ])
    // Should not have an empty "File:" line
    expect(result).not.toContain('File:')
  })
})

describe('renderComment with cross-repo matches', () => {
  const baseInput = {
    runId: 'run-xrepo',
    headSha: 'abc1234567890',
    durationMs: 5000,
    stages: [{ stage: 'ceo', verdict: 'PASS' }] as StageData[],
    allFindings: [] as FindingWithStage[],
  }

  const sampleMatches: CrossRepoMatch[] = [
    {
      finding_id: 'f-cross-3',
      title: 'Similar pattern found',
      description: 'A similar code pattern was flagged',
      file_path: 'src/lib/util.ts',
      repo_full_name: 'otherorg/lib',
      distance: 0.08,
      stage: 'eng',
      severity: 'notable',
    },
  ]

  it('renderComment includes cross-repo section when crossRepoMatches provided', () => {
    const result = renderComment({
      ...baseInput,
      crossRepoMatches: sampleMatches,
    })
    expect(result).toContain('Seen in your other repos')
    expect(result).toContain('otherorg/lib')
  })

  it('renderComment omits cross-repo section when no matches', () => {
    const result = renderComment({
      ...baseInput,
      crossRepoMatches: [],
    })
    expect(result).not.toContain('Seen in your other repos')
  })

  it('renderComment omits cross-repo section when crossRepoMatches undefined', () => {
    const result = renderComment({
      ...baseInput,
    })
    expect(result).not.toContain('Seen in your other repos')
  })

  it('cross-repo section appears before the footer', () => {
    const result = renderComment({
      ...baseInput,
      crossRepoMatches: sampleMatches,
    })
    const crossRepoIdx = result.indexOf('Seen in your other repos')
    const footerIdx = result.lastIndexOf('Reviewed by')
    expect(crossRepoIdx).toBeGreaterThan(-1)
    expect(footerIdx).toBeGreaterThan(crossRepoIdx)
  })
})
