/**
 * Agent SSE streaming route.
 *
 * GET  /stream — SSE endpoint for agent loop streaming
 * POST /send   — JSON body alternative that opens SSE stream
 *
 * Accepts a prompt (and optional sessionId for resume), runs the
 * agent loop, streams events via SSE, and persists session metadata
 * to Drizzle on completion.
 */

import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { nanoid } from 'nanoid'
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client'
import { sessions, messages } from '../db/schema'
import { runAgentLoop } from '../agent/loop'

const agentApp = new Hono()

// ── GET /stream — SSE endpoint ──────────────────────────────────────────────

agentApp.get('/stream', async (c) => {
  const prompt = c.req.query('prompt')
  const sessionId = c.req.query('sessionId')

  if (!prompt && !sessionId) {
    return c.json({ error: 'prompt or sessionId required' }, 400)
  }

  return streamAgentLoop(c, prompt, sessionId)
})

// ── POST /send — JSON body alternative ──────────────────────────────────────

agentApp.post('/send', async (c) => {
  const body = await c.req.json<{ prompt?: string; sessionId?: string }>()
  const prompt = body.prompt
  const sessionId = body.sessionId

  if (!prompt && !sessionId) {
    return c.json({ error: 'prompt or sessionId required' }, 400)
  }

  return streamAgentLoop(c, prompt, sessionId)
})

// ── Stream Handler ──────────────────────────────────────────────────────────

async function streamAgentLoop(
  c: any,
  prompt: string | undefined,
  sessionId: string | undefined
) {
  // Look up existing session for resume, or create a new one
  let currentSessionId = sessionId
  let sdkSessionId: string | undefined
  let projectPath: string | undefined

  if (currentSessionId) {
    const session = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, currentSessionId))
      .get()

    if (session) {
      sdkSessionId = session.sdkSessionId ?? undefined
      projectPath = session.projectPath ?? undefined
    }
  }

  // Create new session if none provided
  if (!currentSessionId) {
    currentSessionId = nanoid()
    const title = prompt ? prompt.slice(0, 50) : null

    await db.insert(sessions)
      .values({
        id: currentSessionId,
        title,
        status: 'active',
        messageCount: 0,
        tokenUsage: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run()
  }

  // Insert user message record
  const userMessageId = nanoid()
  if (prompt) {
    await db.insert(messages)
      .values({
        id: userMessageId,
        sessionId: currentSessionId,
        role: 'user',
        content: prompt,
        hasToolCalls: false,
        createdAt: new Date(),
      })
      .run()
  }

  const effectivePrompt = prompt ?? 'Continue from where we left off.'
  const loopSessionId = currentSessionId

  return streamSSE(c, async (stream) => {
    let eventCounter = 0
    let assistantText = ''
    let resultCost: number | undefined
    let resultTokenUsage: number | undefined
    let resultSdkSessionId: string | undefined

    // Heartbeat interval (15s, matching existing SSE pattern)
    const heartbeatInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          data: '',
          event: 'heartbeat',
          id: '',
        })
      } catch {
        // Stream closed, cleanup handled below
      }
    }, 15000)

    try {
      for await (const event of runAgentLoop({
        prompt: effectivePrompt,
        sessionId: loopSessionId,
        sdkSessionId,
        projectPath,
      })) {
        eventCounter++

        // Patch result events with our session ID
        if (event.type === 'result') {
          resultSdkSessionId = event.sdkSessionId
          resultCost = event.cost
          resultTokenUsage = event.tokenUsage
          event.sessionId = loopSessionId
        }

        // Accumulate assistant text for message record
        if (event.type === 'text_delta') {
          assistantText += event.text
        }

        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
          id: String(eventCounter),
        })
      }
    } catch (err) {
      // Emit error event
      eventCounter++
      const errorMessage = err instanceof Error ? err.message : String(err)
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message: errorMessage }),
        event: 'error',
        id: String(eventCounter),
      })
    } finally {
      clearInterval(heartbeatInterval)

      // Persist session metadata updates
      try {
        const now = new Date()

        await db.update(sessions)
          .set({
            sdkSessionId: resultSdkSessionId ?? sdkSessionId,
            messageCount: sql`${sessions.messageCount} + 1`,
            tokenUsage: resultTokenUsage
              ? sql`${sessions.tokenUsage} + ${resultTokenUsage}`
              : sessions.tokenUsage,
            costUsd: resultCost !== undefined
              ? String(resultCost)
              : undefined,
            updatedAt: now,
            lastMessageAt: now,
          })
          .where(eq(sessions.id, loopSessionId))
          .run()

        // Insert assistant message summary
        if (assistantText) {
          await db.insert(messages)
            .values({
              id: nanoid(),
              sessionId: loopSessionId,
              role: 'assistant',
              content: assistantText.slice(0, 10000), // Truncate to avoid huge records
              hasToolCalls: false,
              createdAt: now,
            })
            .run()
        }
      } catch {
        // Best-effort metadata persistence — don't break the stream
      }
    }
  })
}

export default agentApp
