import { db } from './client'
import { pipelineRuns } from './schema'
import { inArray } from 'drizzle-orm'

/**
 * Startup reconciliation: mark any RUNNING or PENDING pipeline runs as STALE.
 *
 * Called once at process startup to handle crash recovery. If the process
 * crashed while pipelines were in-flight, those runs will never complete.
 * Marking them STALE ensures they don't block UI or create confusion.
 */
export async function reconcileStaleRuns(): Promise<void> {
  try {
    const staleStatuses = ['RUNNING', 'PENDING']
    const result = await db
      .update(pipelineRuns)
      .set({ status: 'STALE', completedAt: new Date() })
      .where(inArray(pipelineRuns.status, staleStatuses))

    if (result.rowCount && result.rowCount > 0) {
      console.warn(
        `[reconcile] Marked ${result.rowCount} stale pipeline run(s) on startup`
      )
    }
  } catch (err) {
    console.warn('[reconcile] Failed to reconcile stale runs (DB may be unavailable):', (err as Error).message)
  }
}
