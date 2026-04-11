import { db } from '../db/client'
import { pipelineRuns, stageResults, findings as findingsTable } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { cloneRepo, cleanupClone } from './clone'
import { runStageWithRetry } from './stage-runner'
import { shouldRunStage } from './filter'
import { getInstallationOctokit } from '../github/auth'
import { createSkeletonComment, updatePRComment, postCommitComment } from '../github/comment'
import { logger } from '../lib/logger'
import { pipelineBus } from '../events/bus'
import { embedPipelineFindings } from '../embeddings'
import type { Stage } from '@gstackapp/shared'
import type { StageOutput } from './stage-runner'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PipelineInput {
  runId: string
  installationId: number
  repoFullName: string   // owner/repo
  headSha: string
  type: 'pr' | 'push'
  // PR-specific
  prNumber?: number
  headRef?: string       // branch name for clone
  // Push-specific
  baseSha?: string
  ref?: string           // 'refs/heads/main'
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_STAGES: Stage[] = ['ceo', 'eng', 'design', 'qa', 'security']

// ── Pipeline Execution ───────────────────────────────────────────────────────

/**
 * Execute the full pipeline lifecycle for a PR review.
 *
 * Lifecycle: RUNNING -> clone -> fan-out stages -> fan-in results -> COMPLETED/FAILED
 *
 * 1. Set RUNNING status immediately (PIPE-09: crash recovery)
 * 2. Fetch PR changed files from GitHub API
 * 3. Filter stages (D-08/D-09: skip CEO/Design when irrelevant)
 * 4. Clone repo for AI code reading
 * 5. Fan out all stages in parallel via Promise.allSettled (PIPE-02)
 * 6. Fan in: persist each stage result and findings to DB
 * 7. Set COMPLETED status
 * 8. Cleanup clone directory in finally block
 */
export async function executePipeline(input: PipelineInput): Promise<void> {
  // PIPE-09: Set RUNNING status before anything else
  await db.update(pipelineRuns)
    .set({ status: 'RUNNING', startedAt: new Date() })
    .where(eq(pipelineRuns.id, input.runId))

  // Emit pipeline:started event for SSE clients
  pipelineBus.emit('pipeline:event', {
    type: 'pipeline:started',
    runId: input.runId,
    timestamp: new Date().toISOString(),
  })

  logger.info(
    { runId: input.runId, repo: input.repoFullName, type: input.type, pr: input.prNumber },
    'Pipeline RUNNING'
  )

  let clonePath: string | null = null

  try {
    // Fetch changed files based on review type
    const octokit = getInstallationOctokit(input.installationId)
    const [owner, repo] = input.repoFullName.split('/')

    let mappedFiles: Array<{
      filename: string
      status: string
      additions: number
      deletions: number
      patch?: string
    }>

    if (input.type === 'pr' && input.prNumber) {
      const { data: prFiles } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: input.prNumber,
      })
      mappedFiles = prFiles.map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }))
    } else if (input.type === 'push' && input.baseSha) {
      const { data: comparison } = await octokit.repos.compareCommits({
        owner,
        repo,
        base: input.baseSha,
        head: input.headSha,
      })
      mappedFiles = (comparison.files ?? []).map((f) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }))
    } else {
      throw new Error(`Invalid pipeline input: type=${input.type}`)
    }

    // Post skeleton comment (PR only — push comments are posted at completion)
    if (input.type === 'pr' && input.prNumber) {
      const commentInput = { octokit, owner, repo, prNumber: input.prNumber, runId: input.runId }
      await createSkeletonComment(commentInput).catch((err) => {
        logger.error({ runId: input.runId, error: (err as Error).message }, 'Skeleton comment failed (non-fatal)')
      })
    }

    // D-08/D-09: Smart filtering -- determine which stages to run
    const stagesToRun = ALL_STAGES.filter((stage) =>
      shouldRunStage(stage, mappedFiles)
    )

    logger.info(
      { runId: input.runId, stagesToRun, skipped: ALL_STAGES.filter((s) => !stagesToRun.includes(s)) },
      'Stage filtering complete'
    )

    // Clone only if at least one stage will run
    const cloneRef = input.headRef ?? input.ref?.replace('refs/heads/', '') ?? 'main'
    if (stagesToRun.length > 0) {
      clonePath = await cloneRepo(
        input.installationId,
        input.repoFullName,
        cloneRef
      )
    }

    // Create stage_result records for ALL 5 stages
    // Stages that will run get verdict 'RUNNING', skipped stages get 'SKIP'
    const stageResultIds = new Map<string, string>()
    for (const stage of ALL_STAGES) {
      const stageId = nanoid()
      stageResultIds.set(stage, stageId)
      await db.insert(stageResults)
        .values({
          id: stageId,
          pipelineRunId: input.runId,
          stage,
          verdict: stagesToRun.includes(stage) ? 'RUNNING' : 'SKIP',
        })
    }

    // Emit stage:running for all stages that will execute
    for (const stage of stagesToRun) {
      pipelineBus.emit('pipeline:event', {
        type: 'stage:running',
        runId: input.runId,
        stage,
        timestamp: new Date().toISOString(),
      })
    }

    // PIPE-02: Fan out with Promise.allSettled (parallel execution)
    const results = await Promise.allSettled(
      stagesToRun.map((stage) =>
        runStageWithRetry({
          stage,
          runId: input.runId,
          clonePath: clonePath!,
          prFiles: mappedFiles,
          repoFullName: input.repoFullName,
          headSha: input.headSha,
          type: input.type,
          prNumber: input.prNumber,
          baseSha: input.baseSha,
        })
      )
    )

    // Fan in: persist results to database
    for (let i = 0; i < stagesToRun.length; i++) {
      const stage = stagesToRun[i]
      const result = results[i]

      if (result.status === 'fulfilled') {
        const output: StageOutput = result.value

        // Update stage_result with actual results
        await db.update(stageResults)
          .set({
            verdict: output.verdict,
            summary: output.summary,
            tokenUsage: output.tokenUsage,
            durationMs: output.durationMs,
            providerModel: output.providerModel,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(stageResults.pipelineRunId, input.runId),
              eq(stageResults.stage, stage)
            )
          )

        // Insert each finding
        for (const finding of output.findings) {
          await db.insert(findingsTable)
            .values({
              id: nanoid(),
              stageResultId: stageResultIds.get(stage)!,
              pipelineRunId: input.runId,
              severity: finding.severity,
              category: finding.category,
              title: finding.title,
              description: finding.description,
              filePath: finding.filePath,
              lineStart: finding.lineStart,
              lineEnd: finding.lineEnd,
              suggestion: finding.suggestion,
              codeSnippet: finding.codeSnippet,
            })
        }

        // Emit stage:completed for fulfilled stages
        pipelineBus.emit('pipeline:event', {
          type: 'stage:completed',
          runId: input.runId,
          stage,
          verdict: output.verdict,
          timestamp: new Date().toISOString(),
        })

        logger.info(
          { stage, verdict: output.verdict, findings: output.findings.length },
          'Stage result persisted'
        )
      } else {
        // Promise rejected -- mark as FLAG with error
        await db.update(stageResults)
          .set({
            verdict: 'FLAG',
            error: result.reason?.message ?? 'Unknown error',
            completedAt: new Date(),
          })
          .where(
            and(
              eq(stageResults.pipelineRunId, input.runId),
              eq(stageResults.stage, stage)
            )
          )

        // Emit stage:completed for rejected stages (with FLAG verdict)
        pipelineBus.emit('pipeline:event', {
          type: 'stage:completed',
          runId: input.runId,
          stage,
          verdict: 'FLAG',
          timestamp: new Date().toISOString(),
        })

        logger.error(
          { stage, error: result.reason?.message },
          'Stage promise rejected'
        )
      }
    }

    // Set COMPLETED status
    await db.update(pipelineRuns)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(pipelineRuns.id, input.runId))

    // Post review comment based on type
    if (input.type === 'pr' && input.prNumber) {
      const commentInput = { octokit, owner, repo, prNumber: input.prNumber, runId: input.runId }
      await updatePRComment(commentInput).catch((err) => {
        logger.error({ runId: input.runId, error: (err as Error).message }, 'Final comment update failed (non-fatal)')
      })
    } else if (input.type === 'push') {
      await postCommitComment({ octokit, owner, repo, commitSha: input.headSha, runId: input.runId }).catch((err) => {
        logger.error({ runId: input.runId, error: (err as Error).message }, 'Commit comment failed (non-fatal)')
      })
    }

    // Embed findings for cross-repo intelligence (XREP-01)
    // Fire-and-forget: embedding failure must NOT block pipeline completion or PR comment
    embedPipelineFindings(input.runId, input.repoFullName).catch((err) => {
      logger.error(
        { runId: input.runId, error: (err as Error).message },
        'Finding embedding failed (non-fatal)'
      )
    })

    // Emit pipeline:completed for SSE clients
    pipelineBus.emit('pipeline:event', {
      type: 'pipeline:completed',
      runId: input.runId,
      timestamp: new Date().toISOString(),
    })

    logger.info({ runId: input.runId }, 'Pipeline COMPLETED')
  } catch (err) {
    // Orchestrator-level failure -- set FAILED status
    await db.update(pipelineRuns)
      .set({ status: 'FAILED', completedAt: new Date() })
      .where(eq(pipelineRuns.id, input.runId))

    // Emit pipeline:failed for SSE clients
    pipelineBus.emit('pipeline:event', {
      type: 'pipeline:failed',
      runId: input.runId,
      timestamp: new Date().toISOString(),
    })

    logger.error(
      { runId: input.runId, error: (err as Error).message },
      'Pipeline FAILED'
    )
  } finally {
    // Always clean up clone directory
    if (clonePath) {
      await cleanupClone(clonePath)
    }
  }
}
