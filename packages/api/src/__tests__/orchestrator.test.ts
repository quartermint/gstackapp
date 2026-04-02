import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '../db/client'
import {
  githubInstallations,
  repositories,
  pullRequests,
  pipelineRuns,
  stageResults,
  findings as findingsTable,
} from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

// ── Hoisted mocks (must be available at vi.mock evaluation time) ─────────────
const {
  mockRunStageWithRetry,
  mockCloneRepo,
  mockCleanupClone,
  mockShouldRunStage,
} = vi.hoisted(() => ({
  mockRunStageWithRetry: vi.fn(),
  mockCloneRepo: vi.fn(),
  mockCleanupClone: vi.fn(),
  mockShouldRunStage: vi.fn(),
}))

// ── Mock stage-runner ────────────────────────────────────────────────────────
vi.mock('../pipeline/stage-runner', () => ({
  runStageWithRetry: (...args: any[]) => mockRunStageWithRetry(...args),
}))

// ── Mock clone ───────────────────────────────────────────────────────────────
vi.mock('../pipeline/clone', () => ({
  cloneRepo: (...args: any[]) => mockCloneRepo(...args),
  cleanupClone: (...args: any[]) => mockCleanupClone(...args),
}))

// ── Mock filter ──────────────────────────────────────────────────────────────
vi.mock('../pipeline/filter', () => ({
  shouldRunStage: (...args: any[]) => mockShouldRunStage(...args),
}))

// ── Mock github auth (override pulls.listFiles on top of test-db.ts mock) ────
import { getInstallationOctokit } from '../github/auth'

// Import after mocks
import { executePipeline } from '../pipeline/orchestrator'
import type { PipelineInput } from '../pipeline/orchestrator'

// ── Test Helpers ─────────────────────────────────────────────────────────────

function seedTestPipelineRun(): { runId: string; input: PipelineInput } {
  const installationId = 100
  const repoId = 200

  // Insert github_installation
  db.insert(githubInstallations)
    .values({
      id: installationId,
      accountLogin: 'testuser',
      accountType: 'User',
      appId: 12345,
      status: 'active',
    })
    .onConflictDoNothing()
    .run()

  // Insert repository
  db.insert(repositories)
    .values({
      id: repoId,
      installationId,
      fullName: 'testuser/testrepo',
      isActive: true,
    })
    .onConflictDoNothing()
    .run()

  // Insert pull request (auto-increment ID)
  const prResult = db.insert(pullRequests)
    .values({
      repoId,
      number: 42,
      title: 'Test PR',
      authorLogin: 'testuser',
      headSha: 'abc1234',
      baseBranch: 'main',
    })
    .returning({ id: pullRequests.id })
    .get()

  const prDbId = prResult.id

  // Insert pipeline run
  const runId = nanoid()
  db.insert(pipelineRuns)
    .values({
      id: runId,
      deliveryId: nanoid(),
      prId: prDbId,
      installationId,
      headSha: 'abc1234',
      status: 'PENDING',
    })
    .run()

  return {
    runId,
    input: {
      runId,
      installationId,
      repoFullName: 'testuser/testrepo',
      prNumber: 42,
      headSha: 'abc1234',
      headRef: 'feature-branch',
      type: 'pr',
    },
  }
}

function makeStageOutput(overrides?: Partial<{
  verdict: string
  summary: string
  findings: any[]
  tokenUsage: number
  durationMs: number
  providerModel: string
}>) {
  return {
    verdict: 'PASS',
    summary: 'All good',
    findings: [],
    tokenUsage: 150,
    durationMs: 1000,
    providerModel: 'anthropic:claude-sonnet-4-6',
    ...overrides,
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockRunStageWithRetry.mockReset()
  mockCloneRepo.mockReset()
  mockCleanupClone.mockReset()
  mockShouldRunStage.mockReset()

  // Default: all stages should run
  mockShouldRunStage.mockReturnValue(true)

  // Default: clone succeeds
  mockCloneRepo.mockResolvedValue('/tmp/test-clone-dir')

  // Default: cleanup succeeds
  mockCleanupClone.mockResolvedValue(undefined)

  // Default: all stages succeed
  mockRunStageWithRetry.mockResolvedValue(makeStageOutput())

  // Override getInstallationOctokit to return mock with pulls.listFiles
  vi.mocked(getInstallationOctokit).mockReturnValue({
    pulls: {
      listFiles: vi.fn().mockResolvedValue({
        data: [
          {
            filename: 'src/index.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            patch: '@@ -1,5 +1,10 @@\n+console.log("hello")',
          },
        ],
      }),
    },
    apps: {
      listReposAccessibleToInstallation: vi.fn().mockResolvedValue({
        data: { repositories: [] },
      }),
    },
  } as any)
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('orchestrator', () => {
  it('sets RUNNING status before stages begin (PIPE-09)', async () => {
    // Verify RUNNING was set by checking inside stage runner mock
    let statusWhenStageRan: string | undefined
    mockRunStageWithRetry.mockImplementation(async () => {
      // Query the pipeline run status at the time the stage runs
      const run = db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.status, 'RUNNING'))
        .get()
      statusWhenStageRan = run?.status
      return makeStageOutput()
    })

    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    expect(statusWhenStageRan).toBe('RUNNING')
  })

  it('executes stages in parallel via Promise.allSettled (PIPE-02)', async () => {
    const stageOrder: string[] = []
    mockRunStageWithRetry.mockImplementation(async (input: any) => {
      stageOrder.push(input.stage)
      return makeStageOutput()
    })

    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    // All 5 stages should have been called (all pass filter by default)
    expect(mockRunStageWithRetry).toHaveBeenCalledTimes(5)

    // Verify all stage_result records exist
    const results = db.select().from(stageResults).all()
    expect(results).toHaveLength(5)
  })

  it('persists stage results and findings to database', async () => {
    mockRunStageWithRetry.mockResolvedValue(
      makeStageOutput({
        verdict: 'FLAG',
        summary: 'Found an issue',
        findings: [
          {
            severity: 'notable',
            category: 'code-quality',
            title: 'Missing error handling',
            description: 'No try-catch around async call',
            filePath: 'src/index.ts',
            lineStart: 10,
          },
        ],
      })
    )

    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    // Check stage results
    const results = db.select().from(stageResults).all()
    const completedResults = results.filter((r) => r.verdict === 'FLAG')
    expect(completedResults.length).toBeGreaterThanOrEqual(1)
    expect(completedResults[0].summary).toBe('Found an issue')

    // Check findings
    const allFindings = db.select().from(findingsTable).all()
    expect(allFindings.length).toBeGreaterThanOrEqual(1)
    expect(allFindings[0].title).toBe('Missing error handling')
    expect(allFindings[0].severity).toBe('notable')
    expect(allFindings[0].filePath).toBe('src/index.ts')
  })

  it('marks failed stages as FLAG (D-11)', async () => {
    // Make one specific stage reject from Promise.allSettled level
    mockRunStageWithRetry.mockImplementation(async (input: any) => {
      if (input.stage === 'eng') {
        throw new Error('Unexpected engine failure')
      }
      return makeStageOutput()
    })

    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    // Find the eng stage result
    const engResult = db
      .select()
      .from(stageResults)
      .where(
        and(
          eq(stageResults.pipelineRunId, input.runId),
          eq(stageResults.stage, 'eng')
        )
      )
      .get()

    expect(engResult).toBeDefined()
    expect(engResult!.verdict).toBe('FLAG')
    expect(engResult!.error).toContain('Unexpected engine failure')
  })

  it('sets pipeline status to COMPLETED on success', async () => {
    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    const run = db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, input.runId))
      .get()

    expect(run).toBeDefined()
    expect(run!.status).toBe('COMPLETED')
    expect(run!.completedAt).not.toBeNull()
  })

  it('sets pipeline status to FAILED on orchestrator-level error', async () => {
    // Make clone throw to simulate orchestrator-level failure
    mockCloneRepo.mockRejectedValue(new Error('Clone failed: repo not found'))

    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    const run = db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.id, input.runId))
      .get()

    expect(run).toBeDefined()
    expect(run!.status).toBe('FAILED')
  })

  it('cleans up clone directory in finally block', async () => {
    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    expect(mockCleanupClone).toHaveBeenCalledWith('/tmp/test-clone-dir')
  })

  it('skips CEO stage when no relevant files (D-08)', async () => {
    // Override filter: CEO and design don't run, others do
    mockShouldRunStage.mockImplementation((stage: string) => {
      return stage !== 'ceo' && stage !== 'design'
    })

    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    // runStageWithRetry should NOT have been called for 'ceo' or 'design'
    const calledStages = mockRunStageWithRetry.mock.calls.map(
      (call: any[]) => call[0].stage
    )
    expect(calledStages).not.toContain('ceo')
    expect(calledStages).not.toContain('design')
    expect(calledStages).toContain('eng')
    expect(calledStages).toContain('qa')
    expect(calledStages).toContain('security')

    // CEO and design stage_result should have verdict 'SKIP'
    const ceoResult = db
      .select()
      .from(stageResults)
      .where(
        and(
          eq(stageResults.pipelineRunId, input.runId),
          eq(stageResults.stage, 'ceo')
        )
      )
      .get()

    expect(ceoResult).toBeDefined()
    expect(ceoResult!.verdict).toBe('SKIP')

    const designResult = db
      .select()
      .from(stageResults)
      .where(
        and(
          eq(stageResults.pipelineRunId, input.runId),
          eq(stageResults.stage, 'design')
        )
      )
      .get()

    expect(designResult).toBeDefined()
    expect(designResult!.verdict).toBe('SKIP')
  })

  it('cleans up even when pipeline fails', async () => {
    // Stage execution throws after clone succeeds
    mockRunStageWithRetry.mockRejectedValue(new Error('Unexpected'))

    const { input } = seedTestPipelineRun()
    await executePipeline(input)

    // Clone was cleaned up
    expect(mockCleanupClone).toHaveBeenCalledWith('/tmp/test-clone-dir')
  })
})
