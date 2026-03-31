import { Mutex } from 'async-mutex'
import { db } from '../db/client'
import { pipelineRuns, stageResults, findings as findingsTable } from '../db/schema'
import { renderComment, renderSkeleton, COMMENT_MARKER_PREFIX } from './comment-renderer'
import type { FindingWithStage, StageData } from './comment-renderer'
import { eq } from 'drizzle-orm'
import type { Octokit } from '@octokit/rest'
import { logger } from '../lib/logger'

// ── Per-PR Mutex Map ─────────────────────────────────────────────────────────

const commentMutexes = new Map<string, Mutex>()

function getMutex(key: string): Mutex {
  let mutex = commentMutexes.get(key)
  if (!mutex) {
    mutex = new Mutex()
    commentMutexes.set(key, mutex)
  }
  return mutex
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CommentInput {
  octokit: Octokit
  owner: string
  repo: string
  prNumber: number
  runId: string
}

// ── Skeleton Comment ─────────────────────────────────────────────────────────

/**
 * Create the initial skeleton comment when a pipeline starts.
 * Per D-03: skeleton created at pipeline start.
 * Acquires per-PR mutex to prevent concurrent comment creation.
 */
export async function createSkeletonComment(input: CommentInput): Promise<void> {
  const { octokit, owner, repo, prNumber, runId } = input
  const mutexKey = `${owner}/${repo}:${prNumber}`

  await getMutex(mutexKey).runExclusive(async () => {
    const body = renderSkeleton(runId)

    const { data: created } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    })

    // Store the comment ID on the pipeline run
    db.update(pipelineRuns)
      .set({ commentId: created.id })
      .where(eq(pipelineRuns.id, runId))
      .run()

    logger.info(
      { runId, commentId: created.id },
      'Skeleton comment created'
    )
  })
}

// ── Update PR Comment ────────────────────────────────────────────────────────

/**
 * Update the PR comment with the latest pipeline results.
 * Per D-03/D-04: incremental update inside mutex.
 *
 * Fast path (D-05): if commentId is known, update directly.
 * Slow path: search existing comments for marker prefix, then update.
 * Fallback: create new comment if no existing one found.
 */
export async function updatePRComment(input: CommentInput): Promise<void> {
  const { octokit, owner, repo, prNumber, runId } = input
  const mutexKey = `${owner}/${repo}:${prNumber}`

  await getMutex(mutexKey).runExclusive(async () => {
    // Fetch pipeline run from DB
    const run = db.select().from(pipelineRuns).where(eq(pipelineRuns.id, runId)).get()
    if (!run) {
      logger.error({ runId }, 'Pipeline run not found for comment update')
      return
    }

    // Fetch stage results for this run
    const stages = db
      .select()
      .from(stageResults)
      .where(eq(stageResults.pipelineRunId, runId))
      .all()

    // Fetch findings for this run
    const allDbFindings = db
      .select()
      .from(findingsTable)
      .where(eq(findingsTable.pipelineRunId, runId))
      .all()

    // Build stage data for renderer
    const stageData: StageData[] = stages.map((s) => ({
      stage: s.stage,
      verdict: s.verdict,
      summary: s.summary ?? undefined,
    }))

    // Build findings with stage info by joining on stageResultId
    const stageMap = new Map(stages.map((s) => [s.id, s.stage]))
    const findingsWithStage: FindingWithStage[] = allDbFindings.map((f) => ({
      severity: f.severity as 'critical' | 'notable' | 'minor',
      category: f.category,
      title: f.title,
      description: f.description,
      filePath: f.filePath ?? undefined,
      lineStart: f.lineStart ?? undefined,
      lineEnd: f.lineEnd ?? undefined,
      suggestion: f.suggestion ?? undefined,
      codeSnippet: f.codeSnippet ?? undefined,
      stage: stageMap.get(f.stageResultId) || 'unknown',
    }))

    // Render the full comment body
    const body = renderComment({
      runId,
      stages: stageData,
      allFindings: findingsWithStage,
      headSha: run.headSha,
      durationMs: run.startedAt && run.completedAt
        ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
        : undefined,
    })

    // Fast path: commentId already known
    if (run.commentId) {
      await octokit.issues.updateComment({
        owner,
        repo,
        comment_id: run.commentId,
        body,
      })
      logger.info({ runId, commentId: run.commentId }, 'Comment updated (fast path)')
      return
    }

    // Slow path: search for existing comment with marker
    const { data: comments } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    })

    const markerString = `${COMMENT_MARKER_PREFIX}:${runId}`
    const existing = comments.find((c: any) => c.body?.includes(markerString))

    if (existing) {
      await octokit.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body,
      })

      // Store commentId for future fast path
      db.update(pipelineRuns)
        .set({ commentId: existing.id })
        .where(eq(pipelineRuns.id, runId))
        .run()

      logger.info({ runId, commentId: existing.id }, 'Comment updated (slow path)')
      return
    }

    // Fallback: create new comment (skeleton creation may have failed)
    const { data: created } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    })

    db.update(pipelineRuns)
      .set({ commentId: created.id })
      .where(eq(pipelineRuns.id, runId))
      .run()

    logger.info({ runId, commentId: created.id }, 'Comment created (fallback)')
  })
}
