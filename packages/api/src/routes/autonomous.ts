// ── Autonomous Execution Routes ──────────────────────────────────────────────
// POST /launch — Start autonomous GSD execution
// GET /stream/:runId — SSE stream of execution progress
// POST /:runId/gate-response — Resolve a decision gate
// GET /:runId/status — Get run status
// POST /:runId/cancel — Cancel a run

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { db } from '../db/client'
import { autonomousRuns, decisionGates } from '../db/schema'
import { GateManager } from '../autonomous/gate-manager'
import { runAutonomousExecution } from '../autonomous/executor'

const autonomousApp = new Hono()

// Singleton gate manager
const gateManager = new GateManager(db)

// ── Validation schemas ───────────────────────────────────────────────────────

const launchSchema = z.object({
  projectPath: z.string().min(1),
  ideationSessionId: z.string().optional(),
})

const gateResponseSchema = z.object({
  gateId: z.string().min(1),
  response: z.string().min(1),
})

// ── POST /launch ─────────────────────────────────────────────────────────────

autonomousApp.post('/launch', async (c) => {
  const body = await c.req.json()
  const parsed = launchSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  }

  const { projectPath, ideationSessionId } = parsed.data

  // T-15-06: Validate projectPath starts with HOME and exists on filesystem
  const home = homedir()
  const resolvedPath = resolve(projectPath)
  if (!resolvedPath.startsWith(home)) {
    return c.json({ error: 'projectPath must be within home directory' }, 403)
  }
  if (!existsSync(resolvedPath)) {
    return c.json({ error: 'projectPath does not exist on filesystem' }, 404)
  }

  // T-15-08: Check no other run is active
  try {
    gateManager.checkConcurrencyLimit()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Concurrent run limit reached'
    return c.json({ error: message }, 409)
  }

  const id = nanoid()

  db.insert(autonomousRuns).values({
    id,
    projectPath: resolvedPath,
    ideationSessionId: ideationSessionId || null,
    status: 'pending',
  }).run()

  return c.json({ id, projectPath: resolvedPath, status: 'pending' })
})

// ── GET /stream/:runId ───────────────────────────────────────────────────────

autonomousApp.get('/stream/:runId', (c) => {
  const runId = c.req.param('runId')

  return streamSSE(c, async (stream) => {
    // Load run from DB
    const run = db.select().from(autonomousRuns).where(eq(autonomousRuns.id, runId)).get()
    if (!run) {
      await stream.writeSSE({ data: JSON.stringify({ error: 'Run not found' }), event: 'error', id: '0' })
      return
    }

    // Build ideation context if ideationSessionId is set
    let ideationContext: string | undefined
    // Note: ideation artifacts table comes from Plan 01 — gracefully skip if not available
    if (run.ideationSessionId) {
      ideationContext = `Ideation session: ${run.ideationSessionId}`
    }

    let eventCounter = 0

    try {
      // Run autonomous execution and stream events
      for await (const event of runAutonomousExecution(
        runId,
        run.projectPath,
        db,
        gateManager,
        ideationContext,
      )) {
        eventCounter++
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
          id: String(eventCounter),
        })
      }
    } catch (error) {
      eventCounter++
      const message = error instanceof Error ? error.message : 'Unknown error'
      await stream.writeSSE({
        data: JSON.stringify({ type: 'autonomous:error', message }),
        event: 'autonomous:error',
        id: String(eventCounter),
      })
    }
  })
})

// ── POST /:runId/gate-response ───────────────────────────────────────────────

autonomousApp.post('/:runId/gate-response', async (c) => {
  const body = await c.req.json()
  const parsed = gateResponseSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  }

  const resolved = gateManager.resolveGate(parsed.data.gateId, parsed.data.response)

  if (!resolved) {
    return c.json({ error: 'Gate not found or already resolved' }, 404)
  }

  return c.json({ success: true })
})

// ── GET /:runId/status ───────────────────────────────────────────────────────

autonomousApp.get('/:runId/status', (c) => {
  const runId = c.req.param('runId')

  const run = db.select().from(autonomousRuns).where(eq(autonomousRuns.id, runId)).get()
  if (!run) {
    return c.json({ error: 'Run not found' }, 404)
  }

  // Count pending gates
  const pendingGates = gateManager.getPendingGates(runId)

  return c.json({
    id: run.id,
    status: run.status,
    totalPhases: run.totalPhases,
    completedPhases: run.completedPhases,
    totalCommits: run.totalCommits,
    pendingGates: pendingGates.length,
  })
})

// ── POST /:runId/cancel ──────────────────────────────────────────────────────

autonomousApp.post('/:runId/cancel', (c) => {
  const runId = c.req.param('runId')

  const run = db.select().from(autonomousRuns).where(eq(autonomousRuns.id, runId)).get()
  if (!run) {
    return c.json({ error: 'Run not found' }, 404)
  }

  // Update status to failed
  db.update(autonomousRuns)
    .set({ status: 'failed', completedAt: new Date() })
    .where(eq(autonomousRuns.id, runId))
    .run()

  // Cleanup pending gates
  gateManager.cleanup(runId)

  return c.json({ success: true })
})

export default autonomousApp
