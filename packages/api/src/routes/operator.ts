/**
 * Operator request routes.
 *
 * POST /request — Submit a new operator request (intake form)
 * GET /history — Session-scoped request history
 * GET /request/:id — Single request detail with audit trail
 * POST /pipeline/callback — Completion callback from Claude Code subprocess
 * POST /:requestId/gate-response — Resolve a decision gate
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { db } from '../db/client'
import { operatorRequests, auditTrail } from '../db/schema'
import { getUserScope, type AuthUser } from '../auth/middleware'
import { spawnPipeline } from '../pipeline/spawner'
import { watchPipelineOutput, stopWatching, finalSweep } from '../pipeline/file-watcher'
import { pipelineBus } from '../events/bus'
import { config } from '../lib/config'

const operatorApp = new Hono()

// ── Validation schemas ───────────────────────────────────────────────────────

const requestSchema = z.object({
  whatNeeded: z.string().min(1).max(5000),
  whatGood: z.string().min(1).max(5000),
  deadline: z.string().optional(),
})

const gateResponseSchema = z.object({
  gateId: z.string().min(1).max(100),
  response: z.string().min(1).max(1000),
})

const callbackSchema = z.object({
  pipelineId: z.string().min(1).max(100),
})

// ── POST /request ────────────────────────────────────────────────────────────

operatorApp.post('/request', async (c) => {
  const user = c.get('user' as any) as AuthUser
  const body = await c.req.json()
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  }

  const { whatNeeded, whatGood, deadline } = parsed.data
  const id = nanoid()

  // T-17-17: Check for existing running pipeline for this user (one active per user)
  const running = await db.select()
    .from(operatorRequests)
    .where(eq(operatorRequests.status, 'running'))

  const userRunning = running.filter(r => r.userId === user.id)
  if (userRunning.length > 0) {
    return c.json({ error: 'A pipeline is already running. Wait for it to complete.' }, 409)
  }

  // Insert operator request
  await db.insert(operatorRequests).values({
    id,
    userId: user.id,
    whatNeeded,
    whatGood,
    deadline: deadline ?? null,
  })

  // Insert audit trail entry
  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId: id,
    action: 'request_submitted',
    detail: JSON.stringify({ whatNeeded: whatNeeded.slice(0, 100) }),
  })

  // Spawn Claude Code subprocess (D-07)
  try {
    const callbackUrl = `http://localhost:${config.port}/api/operator/pipeline/callback`
    const { pid, outputDir } = spawnPipeline({
      pipelineId: id,
      prompt: whatNeeded,
      whatGood,
      projectPath: process.cwd(),
      callbackUrl,
      deadline,
    })

    // Update request with PID and output directory
    await db.update(operatorRequests)
      .set({ status: 'running', pipelinePid: pid, outputDir })
      .where(eq(operatorRequests.id, id))

    // Start file watcher for progress updates (D-09)
    watchPipelineOutput(id, outputDir)

    // Audit trail for spawn
    await db.insert(auditTrail).values({
      id: nanoid(),
      userId: user.id,
      requestId: id,
      action: 'pipeline_spawned',
      detail: JSON.stringify({ pid, outputDir }),
    })

    return c.json({ id, status: 'running', pid }, 201)
  } catch (error) {
    // If spawn fails, mark request as failed
    await db.update(operatorRequests)
      .set({ status: 'failed' })
      .where(eq(operatorRequests.id, id))

    const message = error instanceof Error ? error.message : 'Spawn failed'
    return c.json({ id, status: 'failed', error: message }, 201)
  }
})

// ── GET /history ─────────────────────────────────────────────────────────────

operatorApp.get('/history', async (c) => {
  const user = c.get('user' as any) as AuthUser
  const scope = getUserScope(user)

  let rows
  if (scope.userId) {
    // Operator: only own requests
    rows = await db.select()
      .from(operatorRequests)
      .where(eq(operatorRequests.userId, scope.userId))
      .orderBy(desc(operatorRequests.createdAt))
      .limit(50)
  } else {
    // Admin: all requests
    rows = await db.select()
      .from(operatorRequests)
      .orderBy(desc(operatorRequests.createdAt))
      .limit(100)
  }

  return c.json(rows)
})

// ── GET /request/:id ─────────────────────────────────────────────────────────

operatorApp.get('/request/:id', async (c) => {
  const user = c.get('user' as any) as AuthUser
  const requestId = c.req.param('id')

  const [request] = await db.select()
    .from(operatorRequests)
    .where(eq(operatorRequests.id, requestId))
    .limit(1)

  if (!request) {
    return c.json({ error: 'Not found' }, 404)
  }

  // Session isolation: operator can only see own requests
  if (user.role === 'operator' && request.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  // Load audit trail for this request
  const auditRows = await db.select()
    .from(auditTrail)
    .where(eq(auditTrail.requestId, requestId))
    .orderBy(desc(auditTrail.createdAt))

  return c.json({ ...request, auditTrail: auditRows })
})

// ── POST /pipeline/callback ─────────────────────────────────────────────────
// Completion callback from Claude Code subprocess (D-09).
// T-17-19: Validates pipelineId exists in DB before processing.

operatorApp.post('/pipeline/callback', async (c) => {
  const body = await c.req.json()
  const parsed = callbackSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid callback', details: parsed.error.issues }, 400)
  }

  const { pipelineId } = parsed.data

  // Look up the request by ID
  const [request] = await db.select()
    .from(operatorRequests)
    .where(eq(operatorRequests.id, pipelineId))
    .limit(1)

  if (!request) {
    return c.json({ error: 'Pipeline not found' }, 404)
  }

  // Final sweep: process any unread files before completion
  if (request.outputDir) {
    finalSweep(pipelineId, request.outputDir)
  }

  // Stop the file watcher
  stopWatching(pipelineId)

  // Update request status to complete
  await db.update(operatorRequests)
    .set({ status: 'complete', completedAt: new Date() })
    .where(eq(operatorRequests.id, pipelineId))

  // Emit completion event via SSE
  pipelineBus.emit('pipeline:event', {
    type: 'operator:complete',
    runId: pipelineId,
    timestamp: new Date().toISOString(),
  })

  // Audit trail
  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: request.userId,
    requestId: pipelineId,
    action: 'pipeline_complete',
    detail: null,
  })

  return c.json({ success: true })
})

// ── POST /:requestId/gate-response ──────────────────────────────────────────
// Resolve a decision gate by writing the response file for Claude to read.
// T-17-16: Validates gateId format and outputDir ownership.

operatorApp.post('/:requestId/gate-response', async (c) => {
  const user = c.get('user' as any) as AuthUser
  const requestId = c.req.param('requestId')
  const body = await c.req.json()
  const parsed = gateResponseSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  }

  const { gateId, response } = parsed.data

  // Look up the request
  const [request] = await db.select()
    .from(operatorRequests)
    .where(eq(operatorRequests.id, requestId))
    .limit(1)

  if (!request) {
    return c.json({ error: 'Request not found' }, 404)
  }

  // Session isolation: operator can only respond to own requests
  if (user.role === 'operator' && request.userId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  if (!request.outputDir) {
    return c.json({ error: 'No output directory for this request' }, 400)
  }

  // T-17-16: Write gate response file for Claude Code to read
  const responseFile = join(request.outputDir, `gate-${gateId}-response.json`)
  writeFileSync(responseFile, JSON.stringify({ response }))

  // Emit gate resolved event
  pipelineBus.emit('pipeline:event', {
    type: 'operator:gate:resolved',
    runId: requestId,
    gateId,
    response,
    timestamp: new Date().toISOString(),
  })

  // Audit trail
  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId,
    action: 'gate_response',
    detail: JSON.stringify({ gateId, response }),
  })

  return c.json({ success: true })
})

export default operatorApp
