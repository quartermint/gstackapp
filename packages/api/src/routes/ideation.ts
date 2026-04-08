/**
 * Ideation API routes.
 *
 * POST /start           — Create a new ideation session
 * GET  /stream/:sessionId — SSE stream of ideation pipeline events
 * GET  /artifacts/:sessionId — List artifacts for a session
 * GET  /:sessionId      — Get ideation session state
 *
 * Per D-04: Hono endpoints wrap ideation pipeline, stream via SSE.
 * Per D-08: No repo required — idea-first ideation.
 * Per T-15-01: Validates idea with Zod schema (min 1, max 5000 chars).
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '../db/client'
import { ideationSessions, ideationArtifacts } from '../db/schema'
import { ideationStartSchema } from '@gstackapp/shared'
import {
  runIdeationPipeline,
  type IdeationPipeline,
} from '../ideation/orchestrator'

const ideationApp = new Hono()

// ── POST /start — Create ideation session ──────────────────────────────────

ideationApp.post('/start', async (c) => {
  const body = await c.req.json()

  // T-15-01: Validate input with Zod schema
  const parsed = ideationStartSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      400
    )
  }

  const id = nanoid()

  db.insert(ideationSessions)
    .values({
      id,
      userIdea: parsed.data.idea,
      status: 'pending',
    })
    .run()

  return c.json({
    id,
    userIdea: parsed.data.idea,
    status: 'pending',
  })
})

// ── GET /stream/:sessionId — SSE pipeline stream ───────────────────────────

ideationApp.get('/stream/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  // Load ideation session from DB
  const session = db
    .select()
    .from(ideationSessions)
    .where(eq(ideationSessions.id, sessionId))
    .get()

  if (!session) {
    return c.json({ error: 'Ideation session not found' }, 404)
  }

  if (session.status === 'complete') {
    return c.json({ error: 'Pipeline already completed' }, 400)
  }

  if (session.status === 'running') {
    return c.json({ error: 'Pipeline already running' }, 409)
  }

  if (session.status === 'failed') {
    return c.json({ error: 'Pipeline failed — start a new session to retry' }, 410)
  }

  // Build pipeline object
  const pipeline: IdeationPipeline = {
    id: sessionId,
    sessionId,
    userIdea: session.userIdea,
    stages: new Map(),
    artifacts: new Map(),
    status: 'running',
  }

  // Load any existing artifacts (for resume scenarios)
  const existingArtifacts = db
    .select()
    .from(ideationArtifacts)
    .where(eq(ideationArtifacts.ideationSessionId, sessionId))
    .all()

  for (const artifact of existingArtifacts) {
    pipeline.artifacts.set(artifact.stage, artifact.artifactPath)
  }

  return streamSSE(c, async (stream) => {
    let eventCounter = 0

    // Heartbeat interval (15s, matching existing SSE pattern from agent.ts)
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          data: '',
          event: 'heartbeat',
          id: '',
        })
      } catch {
        // Stream closed
      }
    }, 15000)

    try {
      for await (const event of runIdeationPipeline(pipeline)) {
        eventCounter++
        await stream.writeSSE({
          data: JSON.stringify(event),
          id: String(eventCounter),
        })
      }
    } catch (err) {
      eventCounter++
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[ideation-stream] Pipeline error:', errorMessage)
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message: errorMessage }),
        event: 'error',
        id: String(eventCounter),
      })
    } finally {
      clearInterval(heartbeatInterval)
    }
  })
})

// ── GET /artifacts/:sessionId — List artifacts ─────────────────────────────

ideationApp.get('/artifacts/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  const artifacts = db
    .select()
    .from(ideationArtifacts)
    .where(eq(ideationArtifacts.ideationSessionId, sessionId))
    .all()

  return c.json(
    artifacts.map((a) => ({
      id: a.id,
      stage: a.stage,
      title: a.title,
      excerpt: a.excerpt,
      artifactPath: a.artifactPath,
      createdAt: a.createdAt?.toISOString() ?? null,
    }))
  )
})

// ── GET /:sessionId — Session state ────────────────────────────────────────

ideationApp.get('/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')

  const session = db
    .select()
    .from(ideationSessions)
    .where(eq(ideationSessions.id, sessionId))
    .get()

  if (!session) {
    return c.json({ error: 'Ideation session not found' }, 404)
  }

  const artifacts = db
    .select()
    .from(ideationArtifacts)
    .where(eq(ideationArtifacts.ideationSessionId, sessionId))
    .all()

  return c.json({
    id: session.id,
    userIdea: session.userIdea,
    status: session.status,
    currentStage: session.currentStage,
    artifacts: artifacts.map((a) => ({
      id: a.id,
      stage: a.stage,
      title: a.title,
      excerpt: a.excerpt,
      artifactPath: a.artifactPath,
      createdAt: a.createdAt?.toISOString() ?? null,
    })),
  })
})

export default ideationApp
