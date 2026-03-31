import { Mutex } from 'async-mutex'
import { db, rawDb } from '../db/client'
import { pipelineRuns, stageResults, findings as findingsTable } from '../db/schema'
import { renderComment, renderSkeleton, COMMENT_MARKER_PREFIX } from './comment-renderer'
import type { FindingWithStage, StageData } from './comment-renderer'
import { findCrossRepoMatches, type CrossRepoMatch } from '../embeddings/search'
import { eq, isNotNull, isNull, and } from 'drizzle-orm'
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

    // Cross-repo intelligence: query vec_findings for similar findings in other repos.
    // Wrapped in try/catch -- failure should NEVER prevent the comment from rendering.
    let crossRepoMatches: CrossRepoMatch[] = []
    try {
      const repoFullName = `${owner}/${repo}`
      // For each finding that has an embedding in vec_findings, run KNN search
      const findingIds = allDbFindings.map((f) => f.id)
      if (findingIds.length > 0) {
        const placeholders = findingIds.map(() => '?').join(',')
        const embeddingRows = rawDb.prepare(`
          SELECT finding_id, embedding FROM vec_findings
          WHERE finding_id IN (${placeholders})
        `).all(...findingIds) as { finding_id: string; embedding: Buffer }[]

        const matchMap = new Map<string, CrossRepoMatch>()
        for (const row of embeddingRows) {
          const queryEmbedding = new Float32Array(
            row.embedding.buffer,
            row.embedding.byteOffset,
            row.embedding.byteLength / 4
          )
          const matches = findCrossRepoMatches(rawDb, queryEmbedding, repoFullName)
          for (const m of matches) {
            if (!matchMap.has(m.finding_id)) {
              matchMap.set(m.finding_id, m)
            }
          }
        }
        crossRepoMatches = Array.from(matchMap.values())
      }
    } catch (err) {
      logger.warn({ runId, err }, 'Cross-repo search failed, continuing without')
    }

    // Render the full comment body
    const body = renderComment({
      runId,
      stages: stageData,
      allFindings: findingsWithStage,
      headSha: run.headSha,
      durationMs: run.startedAt && run.completedAt
        ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
        : undefined,
      crossRepoMatches,
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

// ── Reaction Feedback Polling ───────────────────────────────────────────────

/**
 * Poll GitHub reactions on inline review comments and update finding feedback.
 * Called on next pipeline run for the same repo (not on a schedule for v1).
 */
export async function syncReactionFeedback(
  octokit: Octokit,
  owner: string,
  repo: string
): Promise<number> {
  // Find findings with inline comment IDs but no feedback yet
  const pendingFindings = db
    .select()
    .from(findingsTable)
    .where(
      and(
        isNotNull(findingsTable.ghReviewCommentId),
        isNull(findingsTable.feedbackVote)
      )
    )
    .all()

  let updated = 0

  for (const finding of pendingFindings) {
    try {
      const { data: reactions } = await octokit.reactions.listForPullRequestReviewComment({
        owner,
        repo,
        comment_id: finding.ghReviewCommentId!,
      })

      const thumbsUp = reactions.filter((r: any) => r.content === '+1').length
      const thumbsDown = reactions.filter((r: any) => r.content === '-1').length

      if (thumbsUp > thumbsDown) {
        db.update(findingsTable)
          .set({ feedbackVote: 'up', feedbackSource: 'github_reaction', feedbackAt: new Date() })
          .where(eq(findingsTable.id, finding.id))
          .run()
        updated++
      } else if (thumbsDown > thumbsUp) {
        db.update(findingsTable)
          .set({ feedbackVote: 'down', feedbackSource: 'github_reaction', feedbackAt: new Date() })
          .where(eq(findingsTable.id, finding.id))
          .run()
        updated++
      }
      // If equal or no reactions: skip
    } catch (err: any) {
      // Deleted comment returns 404 — skip gracefully
      if (err?.status === 404) continue
      logger.warn({ findingId: finding.id, err }, 'Failed to poll reactions')
    }
  }

  if (updated > 0) {
    logger.info({ owner, repo, updated }, 'Synced reaction feedback')
  }

  return updated
}
