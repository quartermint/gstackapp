/**
 * Operator request routes.
 *
 * POST /request — Submit a new operator request (starts clarification flow)
 * GET /history — Session-scoped request history
 * GET /request/:id — Single request detail with audit trail
 * POST /:requestId/clarify-answer — Submit answer to clarification question
 * POST /:requestId/approve-brief — Approve execution brief, spawn pipeline
 * POST /:requestId/reject-brief — Reject brief, return to clarification
 * POST /:requestId/escalate — Escalate request to admin
 * POST /pipeline/callback — Completion callback from Claude Code subprocess
 * POST /:requestId/gate-response — Resolve a decision gate
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { writeFileSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import { db } from '../db/client'
import { operatorRequests, auditTrail } from '../db/schema'
import { getUserScope, type AuthUser } from '../auth/middleware'
import { spawnPipeline } from '../pipeline/spawner'
import { watchPipelineOutput, stopWatching, finalSweep } from '../pipeline/file-watcher'
import { transitionRequest } from '../pipeline/state-machine'
import { generateClarificationQuestion } from '../pipeline/clarifier'
import { generateExecutionBrief } from '../pipeline/brief-generator'
import { startTimeoutMonitor, clearTimeoutMonitor } from '../pipeline/timeout-monitor'
import { pipelineBus } from '../events/bus'
import { config } from '../lib/config'

const operatorApp = new Hono()

// ── Validation schemas ───────────────────────────────────────────────────────

const requestSchema = z.object({
  whatNeeded: z.string().min(1).max(5000),
  whatGood: z.string().min(1).max(5000),
  deadline: z.string().optional(),
})

const clarifyAnswerSchema = z.object({
  answer: z.string().min(1).max(5000),
})

const gateResponseSchema = z.object({
  gateId: z.string().min(1).max(100),
  response: z.string().min(1).max(1000),
})

const callbackSchema = z.object({
  pipelineId: z.string().min(1).max(100),
})

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUser(c: any): AuthUser {
  return c.get('user' as any) as AuthUser
}

/**
 * Verify the request exists and the user has access.
 * Returns the request or null (with error response set).
 */
async function loadAndVerifyRequest(c: any, requestId: string) {
  const user = getUser(c)
  const [request] = await db.select()
    .from(operatorRequests)
    .where(eq(operatorRequests.id, requestId))
    .limit(1)

  if (!request) {
    return null
  }

  // Session isolation: operator can only access own requests (T-18-03, T-18-06)
  if (user.role === 'operator' && request.userId !== user.id) {
    return null
  }

  return request
}

// ── POST /request ────────────────────────────────────────────────────────────
// Creates request and starts clarification flow (no longer spawns pipeline directly).

operatorApp.post('/request', async (c) => {
  const user = getUser(c)
  const body = await c.req.json()
  const parsed = requestSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  }

  const { whatNeeded, whatGood, deadline } = parsed.data
  const id = nanoid()

  // Insert operator request with pending status
  await db.insert(operatorRequests).values({
    id,
    userId: user.id,
    whatNeeded,
    whatGood,
    deadline: deadline ?? null,
  })

  // Audit trail: request submitted
  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId: id,
    action: 'request_submitted',
    detail: JSON.stringify({ whatNeeded: whatNeeded.slice(0, 100) }),
  })

  // Transition to clarifying
  await transitionRequest(id, 'clarifying')

  // Generate first clarification question
  const ctx = { whatNeeded, whatGood, deadline, previousQA: [] }

  try {
    const result = await generateClarificationQuestion(ctx)

    if (result.isComplete) {
      // Request is clear enough — skip to brief generation
      await transitionRequest(id, 'briefing')

      const brief = await generateExecutionBrief(ctx)
      await db.update(operatorRequests)
        .set({ briefData: JSON.stringify(brief) })
        .where(eq(operatorRequests.id, id))

      pipelineBus.emit('pipeline:event', {
        type: 'operator:brief:generated',
        runId: id,
        result: brief,
        timestamp: new Date().toISOString(),
      })

      await db.insert(auditTrail).values({
        id: nanoid(),
        userId: user.id,
        requestId: id,
        action: 'brief_generated',
        detail: JSON.stringify({ skippedClarification: true }),
      })

      return c.json({ id, status: 'briefing', brief }, 201)
    }

    // Store first question in clarificationData
    const clarificationData = [{ question: result.question, answer: '' }]
    await db.update(operatorRequests)
      .set({ clarificationData: JSON.stringify(clarificationData) })
      .where(eq(operatorRequests.id, id))

    pipelineBus.emit('pipeline:event', {
      type: 'operator:clarification:question',
      runId: id,
      message: result.question,
      result: { questionNumber: 1 },
      timestamp: new Date().toISOString(),
    })

    await db.insert(auditTrail).values({
      id: nanoid(),
      userId: user.id,
      requestId: id,
      action: 'clarification_question',
      detail: JSON.stringify({ question: result.question, questionNumber: 1 }),
    })

    return c.json({ id, status: 'clarifying', question: result.question }, 201)
  } catch (error) {
    // If clarification fails, still return the created request
    const message = error instanceof Error ? error.message : 'Clarification failed'
    pipelineBus.emit('pipeline:event', {
      type: 'operator:error',
      runId: id,
      message,
      timestamp: new Date().toISOString(),
    })

    return c.json({ id, status: 'clarifying', error: message }, 201)
  }
})

// ── POST /:requestId/clarify-answer ─────────────────────────────────────────
// Submit an answer to a clarification question (T-18-02, T-18-04, T-18-05).

operatorApp.post('/:requestId/clarify-answer', async (c) => {
  const user = getUser(c)
  const requestId = c.req.param('requestId')
  const body = await c.req.json()
  const parsed = clarifyAnswerSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid answer', details: parsed.error.issues }, 400)
  }

  const request = await loadAndVerifyRequest(c, requestId)
  if (!request) {
    return c.json({ error: 'Not found or forbidden' }, 404)
  }

  if (request.status !== 'clarifying') {
    return c.json({ error: 'Request is not in clarifying state' }, 400)
  }

  // Parse existing clarification data
  const previousData: Array<{ question: string; answer: string }> =
    request.clarificationData ? JSON.parse(request.clarificationData) : []

  // Update the last unanswered question with the answer
  const lastEntry = previousData[previousData.length - 1]
  if (lastEntry && !lastEntry.answer) {
    lastEntry.answer = parsed.data.answer
  } else {
    // Shouldn't happen, but handle gracefully
    previousData.push({ question: '', answer: parsed.data.answer })
  }

  // Save updated Q&A
  await db.update(operatorRequests)
    .set({ clarificationData: JSON.stringify(previousData) })
    .where(eq(operatorRequests.id, requestId))

  // Audit trail
  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId,
    action: 'clarification_answer',
    detail: JSON.stringify({ answer: parsed.data.answer.slice(0, 100) }),
  })

  const completedQA = previousData.filter(q => q.answer)
  const ctx = {
    whatNeeded: request.whatNeeded,
    whatGood: request.whatGood,
    deadline: request.deadline ?? undefined,
    previousQA: completedQA,
  }

  // T-18-05: Max 5 questions enforced
  if (completedQA.length >= 5) {
    // Force transition to briefing after 5 answers
    await transitionRequest(requestId, 'briefing')

    try {
      const brief = await generateExecutionBrief(ctx)
      await db.update(operatorRequests)
        .set({ briefData: JSON.stringify(brief) })
        .where(eq(operatorRequests.id, requestId))

      pipelineBus.emit('pipeline:event', {
        type: 'operator:brief:generated',
        runId: requestId,
        result: brief,
        timestamp: new Date().toISOString(),
      })

      // OP-10: Emit error if scope might still be ambiguous after max questions
      pipelineBus.emit('pipeline:event', {
        type: 'operator:error',
        runId: requestId,
        message: 'Maximum clarification questions reached. Brief generated with available context.',
        result: { errorType: 'ambiguous-scope' },
        timestamp: new Date().toISOString(),
      })

      return c.json({ status: 'briefing', brief, maxQuestionsReached: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Brief generation failed'
      return c.json({ status: 'briefing', error: message, maxQuestionsReached: true })
    }
  }

  // Generate next clarification question
  try {
    const result = await generateClarificationQuestion(ctx)

    if (result.isComplete) {
      // Clarification complete — generate brief
      await transitionRequest(requestId, 'briefing')

      const brief = await generateExecutionBrief(ctx)
      await db.update(operatorRequests)
        .set({ briefData: JSON.stringify(brief) })
        .where(eq(operatorRequests.id, requestId))

      pipelineBus.emit('pipeline:event', {
        type: 'operator:brief:generated',
        runId: requestId,
        result: brief,
        timestamp: new Date().toISOString(),
      })

      return c.json({ status: 'briefing', brief })
    }

    // Store next question
    previousData.push({ question: result.question, answer: '' })
    await db.update(operatorRequests)
      .set({ clarificationData: JSON.stringify(previousData) })
      .where(eq(operatorRequests.id, requestId))

    pipelineBus.emit('pipeline:event', {
      type: 'operator:clarification:question',
      runId: requestId,
      message: result.question,
      result: { questionNumber: previousData.length },
      timestamp: new Date().toISOString(),
    })

    return c.json({ status: 'clarifying', question: result.question, questionNumber: previousData.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Clarification failed'
    return c.json({ status: 'clarifying', error: message })
  }
})

// ── POST /:requestId/approve-brief ──────────────────────────────────────────
// Approve the execution brief and spawn the pipeline (T-18-03).

operatorApp.post('/:requestId/approve-brief', async (c) => {
  const user = getUser(c)
  const requestId = c.req.param('requestId')

  const request = await loadAndVerifyRequest(c, requestId)
  if (!request) {
    return c.json({ error: 'Not found or forbidden' }, 404)
  }

  if (request.status !== 'briefing') {
    return c.json({ error: 'Request is not in briefing state' }, 400)
  }

  // Transition: briefing -> approved
  await transitionRequest(requestId, 'approved')

  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId,
    action: 'brief_approved',
    detail: null,
  })

  // Spawn pipeline (moved from POST /request)
  try {
    const callbackUrl = `http://localhost:${config.port}/api/operator/pipeline/callback`
    const { pid, outputDir } = spawnPipeline({
      pipelineId: requestId,
      prompt: request.whatNeeded,
      whatGood: request.whatGood,
      projectPath: process.cwd(),
      callbackUrl,
      deadline: request.deadline ?? undefined,
    })

    // Transition: approved -> running
    await transitionRequest(requestId, 'running')

    await db.update(operatorRequests)
      .set({ pipelinePid: pid, outputDir })
      .where(eq(operatorRequests.id, requestId))

    // Start file watcher for progress updates
    watchPipelineOutput(requestId, outputDir)

    // Start timeout monitor (OP-08: 5-minute timeout detection)
    startTimeoutMonitor(requestId)

    await db.insert(auditTrail).values({
      id: nanoid(),
      userId: user.id,
      requestId,
      action: 'pipeline_spawned',
      detail: JSON.stringify({ pid, outputDir }),
    })

    pipelineBus.emit('pipeline:event', {
      type: 'operator:brief:approved',
      runId: requestId,
      timestamp: new Date().toISOString(),
    })

    return c.json({ status: 'running', pid })
  } catch (error) {
    // OP-11: Detect provider exhaustion on spawn failure
    const message = error instanceof Error ? error.message : 'Spawn failed'
    const isProviderExhaustion = /provider|rate limit|overloaded|capacity/i.test(message)

    if (isProviderExhaustion) {
      await transitionRequest(requestId, 'failed')

      pipelineBus.emit('pipeline:event', {
        type: 'operator:error',
        runId: requestId,
        errorType: 'provider-exhaustion',
        message: 'Temporarily unavailable. The AI service is currently at capacity. Your request has been saved and can be retried later.',
        timestamp: new Date().toISOString(),
      })

      await db.insert(auditTrail).values({
        id: nanoid(),
        userId: user.id,
        requestId,
        action: 'provider_exhaustion',
        detail: JSON.stringify({ error: message }),
      })

      return c.json({ status: 'failed', error: message, retryable: true }, 503)
    }

    return c.json({ status: 'approved', error: message }, 500)
  }
})

// ── POST /:requestId/reject-brief ──────────────────────────────────────────
// Reject the execution brief and return to clarification.

operatorApp.post('/:requestId/reject-brief', async (c) => {
  const user = getUser(c)
  const requestId = c.req.param('requestId')

  const request = await loadAndVerifyRequest(c, requestId)
  if (!request) {
    return c.json({ error: 'Not found or forbidden' }, 404)
  }

  if (request.status !== 'briefing') {
    return c.json({ error: 'Request is not in briefing state' }, 400)
  }

  // Transition: briefing -> clarifying
  await transitionRequest(requestId, 'clarifying')

  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId,
    action: 'brief_rejected',
    detail: null,
  })

  // Generate new clarification question with existing context
  const previousData: Array<{ question: string; answer: string }> =
    request.clarificationData ? JSON.parse(request.clarificationData) : []
  const completedQA = previousData.filter(q => q.answer)

  try {
    const result = await generateClarificationQuestion({
      whatNeeded: request.whatNeeded,
      whatGood: request.whatGood,
      deadline: request.deadline ?? undefined,
      previousQA: completedQA,
    })

    if (!result.isComplete) {
      previousData.push({ question: result.question, answer: '' })
      await db.update(operatorRequests)
        .set({ clarificationData: JSON.stringify(previousData) })
        .where(eq(operatorRequests.id, requestId))

      pipelineBus.emit('pipeline:event', {
        type: 'operator:clarification:question',
        runId: requestId,
        message: result.question,
        result: { questionNumber: previousData.length },
        timestamp: new Date().toISOString(),
      })
    }

    return c.json({ status: 'clarifying', question: result.question })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Clarification failed'
    return c.json({ status: 'clarifying', error: message })
  }
})

// ── POST /:requestId/escalate ──────────────────────────────────────────────
// Escalate request to admin (T-18-06).

operatorApp.post('/:requestId/escalate', async (c) => {
  const user = getUser(c)
  const requestId = c.req.param('requestId')

  const request = await loadAndVerifyRequest(c, requestId)
  if (!request) {
    return c.json({ error: 'Not found or forbidden' }, 404)
  }

  // Only allow escalation from clarifying, briefing, or timeout
  const escalatable = ['clarifying', 'briefing', 'timeout']
  if (!escalatable.includes(request.status)) {
    return c.json({ error: `Cannot escalate from ${request.status} state` }, 400)
  }

  await transitionRequest(requestId, 'escalated')

  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId,
    action: 'escalated_to_ryan',
    detail: JSON.stringify({ fromStatus: request.status }),
  })

  return c.json({ status: 'escalated' })
})

// ── GET /history ─────────────────────────────────────────────────────────────

operatorApp.get('/history', async (c) => {
  const user = getUser(c)
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
  const user = getUser(c)
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

  // Clear timeout monitor before completion (OP-08)
  clearTimeoutMonitor(pipelineId)

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
  const user = getUser(c)
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
  // CR-02: Sanitize gateId to prevent path traversal
  const safeGateId = basename(gateId)
  if (!/^[\w-]+$/.test(safeGateId)) {
    return c.json({ error: 'Invalid gateId format' }, 400)
  }
  const responseFile = join(request.outputDir, `gate-${safeGateId}-response.json`)
  // Verify resolved path stays within outputDir
  if (!resolve(responseFile).startsWith(resolve(request.outputDir))) {
    return c.json({ error: 'Invalid gate response path' }, 400)
  }
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

// ── POST /:requestId/retry-timeout ─────────────────────────────────────────
// Retry a timed-out request (OP-08). Re-starts timeout monitor.
// T-18-08: Validates status is 'timeout' before allowing retry.

operatorApp.post('/:requestId/retry-timeout', async (c) => {
  const user = getUser(c)
  const requestId = c.req.param('requestId')

  const request = await loadAndVerifyRequest(c, requestId)
  if (!request) {
    return c.json({ error: 'Not found or forbidden' }, 404)
  }

  if (request.status !== 'timeout') {
    return c.json({ error: 'Request is not in timeout state' }, 400)
  }

  // Transition: timeout -> running
  await transitionRequest(requestId, 'running')

  // Check if process is still alive
  let processAlive = false
  if (request.pipelinePid) {
    try {
      process.kill(request.pipelinePid, 0)
      processAlive = true
    } catch {
      processAlive = false
    }
  }

  if (processAlive) {
    // Process still running — restart timeout monitor
    startTimeoutMonitor(requestId)
  } else {
    // Process died — re-spawn pipeline
    try {
      const callbackUrl = `http://localhost:${config.port}/api/operator/pipeline/callback`
      const { pid, outputDir } = spawnPipeline({
        pipelineId: requestId,
        prompt: request.whatNeeded,
        whatGood: request.whatGood,
        projectPath: process.cwd(),
        callbackUrl,
        deadline: request.deadline ?? undefined,
      })

      await db.update(operatorRequests)
        .set({ pipelinePid: pid, outputDir })
        .where(eq(operatorRequests.id, requestId))

      watchPipelineOutput(requestId, outputDir)
      startTimeoutMonitor(requestId)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Re-spawn failed'
      return c.json({ error: message }, 500)
    }
  }

  await db.insert(auditTrail).values({
    id: nanoid(),
    userId: user.id,
    requestId,
    action: 'retry_timeout',
    detail: JSON.stringify({ processAlive }),
  })

  return c.json({ status: 'running' })
})

// ── POST /:requestId/retry ─────────────────────────────────────────────────
// Retry a failed request due to provider exhaustion (OP-11).
// T-18-10: Validates status is 'failed' and audit trail shows provider_exhaustion.

operatorApp.post('/:requestId/retry', async (c) => {
  const user = getUser(c)
  const requestId = c.req.param('requestId')

  const request = await loadAndVerifyRequest(c, requestId)
  if (!request) {
    return c.json({ error: 'Not found or forbidden' }, 404)
  }

  if (request.status !== 'failed') {
    return c.json({ error: 'Request is not in failed state' }, 400)
  }

  // T-18-10: Verify failure was provider_exhaustion via audit trail
  const auditRows = await db.select()
    .from(auditTrail)
    .where(eq(auditTrail.requestId, requestId))

  const hasProviderExhaustion = auditRows.some(
    row => row.action === 'provider_exhaustion'
  )

  if (!hasProviderExhaustion) {
    return c.json({ error: 'Only provider exhaustion failures can be retried' }, 400)
  }

  // Transition: failed -> approved (re-enter approval flow)
  await transitionRequest(requestId, 'approved')

  // Re-attempt spawn
  try {
    const callbackUrl = `http://localhost:${config.port}/api/operator/pipeline/callback`
    const { pid, outputDir } = spawnPipeline({
      pipelineId: requestId,
      prompt: request.whatNeeded,
      whatGood: request.whatGood,
      projectPath: process.cwd(),
      callbackUrl,
      deadline: request.deadline ?? undefined,
    })

    await transitionRequest(requestId, 'running')

    await db.update(operatorRequests)
      .set({ pipelinePid: pid, outputDir })
      .where(eq(operatorRequests.id, requestId))

    watchPipelineOutput(requestId, outputDir)
    startTimeoutMonitor(requestId)

    await db.insert(auditTrail).values({
      id: nanoid(),
      userId: user.id,
      requestId,
      action: 'retry_queued',
      detail: JSON.stringify({ pid, outputDir }),
    })

    return c.json({ status: 'running' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Re-spawn failed'
    return c.json({ error: message }, 500)
  }
})

export default operatorApp
