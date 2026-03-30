import { db } from '../db/client'
import { pipelineRuns, stageResults, findings as findingsTable } from '../db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { cloneRepo, cleanupClone } from './clone'
import { runStageWithRetry } from './stage-runner'
import { shouldRunStage } from './filter'
import { getInstallationOctokit } from '../github/auth'
import { logger } from '../lib/logger'
import type { Stage } from '@gstackapp/shared'
import type { StageOutput } from './stage-runner'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PipelineInput {
  runId: string
  installationId: number
  repoFullName: string   // owner/repo
  prNumber: number
  headSha: string
  headRef: string        // branch name for clone
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
  db.update(pipelineRuns)
    .set({ status: 'RUNNING', startedAt: new Date() })
    .where(eq(pipelineRuns.id, input.runId))
    .run()

  logger.info(
    { runId: input.runId, repo: input.repoFullName, pr: input.prNumber },
    'Pipeline RUNNING'
  )

  let clonePath: string | null = null

  try {
    // Fetch PR changed files from GitHub API
    const octokit = getInstallationOctokit(input.installationId)
    const [owner, repo] = input.repoFullName.split('/')
    const { data: prFiles } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: input.prNumber,
    })

    const mappedFiles = prFiles.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    }))

    // D-08/D-09: Smart filtering -- determine which stages to run
    const stagesToRun = ALL_STAGES.filter((stage) =>
      shouldRunStage(stage, mappedFiles)
    )

    logger.info(
      { runId: input.runId, stagesToRun, skipped: ALL_STAGES.filter((s) => !stagesToRun.includes(s)) },
      'Stage filtering complete'
    )

    // Clone only if at least one stage will run
    if (stagesToRun.length > 0) {
      clonePath = await cloneRepo(
        input.installationId,
        input.repoFullName,
        input.headRef
      )
    }

    // Create stage_result records for ALL 5 stages
    // Stages that will run get verdict 'RUNNING', skipped stages get 'SKIP'
    const stageResultIds = new Map<string, string>()
    for (const stage of ALL_STAGES) {
      const stageId = nanoid()
      stageResultIds.set(stage, stageId)
      db.insert(stageResults)
        .values({
          id: stageId,
          pipelineRunId: input.runId,
          stage,
          verdict: stagesToRun.includes(stage) ? 'RUNNING' : 'SKIP',
        })
        .run()
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
          prNumber: input.prNumber,
          headSha: input.headSha,
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
        db.update(stageResults)
          .set({
            verdict: output.verdict,
            summary: output.summary,
            tokenUsage: output.tokenUsage,
            durationMs: output.durationMs,
            completedAt: new Date(),
          })
          .where(
            and(
              eq(stageResults.pipelineRunId, input.runId),
              eq(stageResults.stage, stage)
            )
          )
          .run()

        // Insert each finding
        for (const finding of output.findings) {
          db.insert(findingsTable)
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
            .run()
        }

        logger.info(
          { stage, verdict: output.verdict, findings: output.findings.length },
          'Stage result persisted'
        )
      } else {
        // Promise rejected -- mark as FLAG with error
        db.update(stageResults)
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
          .run()

        logger.error(
          { stage, error: result.reason?.message },
          'Stage promise rejected'
        )
      }
    }

    // Set COMPLETED status
    db.update(pipelineRuns)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(pipelineRuns.id, input.runId))
      .run()

    logger.info({ runId: input.runId }, 'Pipeline COMPLETED')
  } catch (err) {
    // Orchestrator-level failure -- set FAILED status
    db.update(pipelineRuns)
      .set({ status: 'FAILED', completedAt: new Date() })
      .where(eq(pipelineRuns.id, input.runId))
      .run()

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
