/**
 * Operator request routes.
 *
 * POST /request — Submit a new operator request (intake form)
 * GET /history — Session-scoped request history
 * GET /request/:id — Single request detail with audit trail
 */

import { Hono } from 'hono'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client'
import { operatorRequests, auditTrail } from '../db/schema'
import { getUserScope, type AuthUser } from '../auth/middleware'

const operatorApp = new Hono()

// ── Validation schemas ───────────────────────────────────────────────────────

const requestSchema = z.object({
  whatNeeded: z.string().min(1).max(5000),
  whatGood: z.string().min(1).max(5000),
  deadline: z.string().optional(),
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

  return c.json({ id, status: 'pending' }, 201)
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

export default operatorApp
