// ── Decision Gate Manager ────────────────────────────────────────────────────
// Promise-based decision gate lifecycle: create gates that block the autonomous
// pipeline, resolve them when the user responds, and clean up on cancellation.
// Per D-09, D-10, D-11: gates pause the async generator until resolved.

import { eq, and, isNull } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { pipelineBus } from '../events/bus'
import { decisionGates, autonomousRuns } from '../db/schema'
import type * as schema from '../db/schema'

export interface GateInput {
  id: string
  autonomousRunId: string
  title: string
  description: string
  options: string // JSON string
  blocking: boolean
}

interface PendingGate {
  resolve: (response: string) => void
  reject: (error: Error) => void
  gate: GateInput
}

/**
 * Manages decision gates for autonomous execution.
 * Gates are Promise-based: createGate() returns a Promise that resolves
 * when resolveGate() is called with the matching gateId.
 */
export class GateManager {
  private pendingGates = new Map<string, PendingGate>()
  private db: BetterSQLite3Database<typeof schema>

  constructor(db: BetterSQLite3Database<typeof schema>) {
    this.db = db
  }

  /**
   * Create a decision gate. Inserts into DB and returns a Promise
   * that resolves with the user's response string when resolveGate() is called.
   */
  createGate(gate: GateInput): Promise<string> {
    // Insert into DB
    this.db.insert(decisionGates).values({
      id: gate.id,
      autonomousRunId: gate.autonomousRunId,
      title: gate.title,
      description: gate.description,
      options: gate.options,
      blocking: gate.blocking,
    }).run()

    // Create a Promise that blocks until resolved
    return new Promise<string>((resolve, reject) => {
      this.pendingGates.set(gate.id, { resolve, reject, gate })

      // Emit event for SSE consumers
      const parsedOptions = JSON.parse(gate.options) as Array<{ id: string; label: string }>
      pipelineBus.emit('pipeline:event', {
        type: 'autonomous:gate:created',
        gateId: gate.id,
        title: gate.title,
        description: gate.description,
        options: parsedOptions,
        blocking: gate.blocking,
      })
    })
  }

  /**
   * Resolve a pending gate with the user's response.
   * Returns true if gate was found and resolved, false otherwise.
   */
  resolveGate(gateId: string, response: string): boolean {
    const pending = this.pendingGates.get(gateId)
    if (!pending) return false

    // Update DB
    this.db.update(decisionGates)
      .set({ response, respondedAt: new Date() })
      .where(eq(decisionGates.id, gateId))
      .run()

    // Resolve the Promise (unblocks the async generator)
    pending.resolve(response)
    this.pendingGates.delete(gateId)

    // Emit event for SSE consumers
    pipelineBus.emit('pipeline:event', {
      type: 'autonomous:gate:resolved',
      gateId,
      response,
    })

    return true
  }

  /**
   * Get all unresolved gates for a specific autonomous run from the DB.
   */
  getPendingGates(runId: string): Array<typeof decisionGates.$inferSelect> {
    return this.db.select()
      .from(decisionGates)
      .where(
        and(
          eq(decisionGates.autonomousRunId, runId),
          isNull(decisionGates.response)
        )
      )
      .all()
  }

  /**
   * Reject all pending gates for a run (used on cancellation/error).
   */
  cleanup(runId: string): void {
    for (const [gateId, pending] of this.pendingGates.entries()) {
      if (pending.gate.autonomousRunId === runId) {
        pending.reject(new Error('Autonomous run cancelled'))
        this.pendingGates.delete(gateId)
      }
    }
  }

  /**
   * Check if there's already a running autonomous run.
   * Per T-15-08: limit to 1 concurrent run for resource exhaustion prevention.
   * Throws if a run is already active.
   */
  checkConcurrencyLimit(): void {
    const running = this.db.select()
      .from(autonomousRuns)
      .where(eq(autonomousRuns.status, 'running'))
      .all()

    if (running.length > 0) {
      throw new Error(`Autonomous run already active: ${running[0].id}. Only 1 concurrent run allowed.`)
    }
  }
}
