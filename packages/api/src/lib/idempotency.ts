import { db } from '../db/client'
import { pipelineRuns, pullRequests, reviewUnits } from '../db/schema'
import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'

/**
 * Upsert a pull request record. If the PR already exists (same repo + number),
 * update the head SHA, title, and updatedAt timestamp.
 *
 * Returns the autoIncrement primary key ID of the pull request.
 */
export async function ensurePullRequest(params: {
  repoId: number
  number: number
  title: string
  authorLogin: string
  headSha: string
  baseBranch: string
}): Promise<number> {
  const result = await db
    .insert(pullRequests)
    .values({
      repoId: params.repoId,
      number: params.number,
      title: params.title,
      authorLogin: params.authorLogin,
      headSha: params.headSha,
      baseBranch: params.baseBranch,
    })
    .onConflictDoUpdate({
      target: [pullRequests.repoId, pullRequests.number],
      set: {
        headSha: params.headSha,
        title: params.title,
        updatedAt: new Date(),
      },
    })
    .returning({ id: pullRequests.id })

  return result[0].id
}

/**
 * Upsert a review unit record. Uses INSERT with ON CONFLICT UPDATE
 * on the dedup index (repo_id, type, head_sha).
 * Returns the primary key ID of the review unit.
 */
export async function ensureReviewUnit(params: {
  repoId: number
  type: 'pr' | 'push'
  title: string
  authorLogin: string
  headSha: string
  baseSha?: string
  ref?: string
  prNumber?: number
}): Promise<number> {
  await db.insert(reviewUnits)
    .values({
      repoId: params.repoId,
      type: params.type,
      title: params.title,
      authorLogin: params.authorLogin,
      headSha: params.headSha,
      baseSha: params.baseSha,
      ref: params.ref,
      prNumber: params.prNumber,
    })
    .onConflictDoUpdate({
      target: [reviewUnits.repoId, reviewUnits.type, reviewUnits.headSha],
      set: {
        title: params.title,
        updatedAt: new Date(),
      },
    })

  const rows = await db.select({ id: reviewUnits.id })
    .from(reviewUnits)
    .where(
      and(
        eq(reviewUnits.repoId, params.repoId),
        eq(reviewUnits.type, params.type),
        eq(reviewUnits.headSha, params.headSha),
      )
    )

  return rows[0].id
}

/**
 * Atomically create a pipeline run using INSERT ON CONFLICT DO NOTHING
 * on the delivery_id unique constraint.
 *
 * CRITICAL: Uses atomic insert-or-ignore to prevent duplicate pipeline runs
 * from duplicate webhook deliveries. Never use query-then-insert (race condition).
 *
 * Returns { created: true, runId } if a new row was inserted,
 * or { created: false, runId: '' } if the delivery was already processed.
 */
export async function tryCreatePipelineRun(params: {
  deliveryId: string
  prId?: number
  reviewUnitId?: number
  installationId: number
  headSha: string
}): Promise<{ created: boolean; runId: string }> {
  const runId = nanoid()

  // Atomic insert-or-ignore via ON CONFLICT DO NOTHING on delivery_id unique index
  const result = await db
    .insert(pipelineRuns)
    .values({
      id: runId,
      deliveryId: params.deliveryId,
      prId: params.prId,
      reviewUnitId: params.reviewUnitId,
      installationId: params.installationId,
      headSha: params.headSha,
      status: 'PENDING',
    })
    .onConflictDoNothing()

  // PGlite returns { affectedRows }, neon-http returns { rowCount }
  const affected = (result as any).rowCount ?? (result as any).affectedRows ?? 0
  const created = affected > 0

  // If onConflictDoNothing didn't insert, check if we can verify by querying
  if (!created) {
    // Verify the delivery already exists
    const existing = await db.select({ id: pipelineRuns.id })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.deliveryId, params.deliveryId))
    if (existing.length === 0) {
      // Insert actually succeeded but rowCount wasn't reported
      return { created: true, runId }
    }
  }

  return {
    created,
    runId: created ? runId : '',
  }
}
