import { Hono } from 'hono'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { db } from '../db/client'
import { sessions, messages } from '../db/schema'
import { eq, desc } from 'drizzle-orm'

const sessionsApp = new Hono()

// T-12-01: Validate session inputs with Zod
const createSessionSchema = z.object({
  title: z.string().max(200).optional(),
  projectPath: z.string().max(500).optional(),
})

// ── GET / -- List sessions ordered by lastMessageAt desc ──────────────────

sessionsApp.get('/', async (c) => {
  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      status: sessions.status,
      messageCount: sessions.messageCount,
      lastMessageAt: sessions.lastMessageAt,
      projectPath: sessions.projectPath,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .orderBy(desc(sessions.lastMessageAt))
    .all()

  return c.json({ sessions: rows })
})

// ── GET /:id -- Get session detail with recent messages (last 50) ─────────

sessionsApp.get('/:id', async (c) => {
  const id = c.req.param('id')

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get()

  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }

  const recentMessages = (await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      hasToolCalls: messages.hasToolCalls,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(desc(messages.createdAt))
    .limit(50)
    .all())
    // Reverse so oldest is first (we fetched last 50 in desc order)
    .reverse()

  return c.json({ session, messages: recentMessages })
})

// ── POST / -- Create new session ──────────────────────────────────────────

sessionsApp.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = createSessionSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400)
  }

  const id = nanoid()
  const now = new Date()

  await db.insert(sessions)
    .values({
      id,
      title: parsed.data.title ?? null,
      projectPath: parsed.data.projectPath ?? null,
      status: 'active',
      messageCount: 0,
      tokenUsage: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get()

  return c.json({ session }, 201)
})

export default sessionsApp
