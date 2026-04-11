/**
 * Tests for operator request routes.
 *
 * POST /api/operator/request — create operator request (starts clarification)
 * GET /api/operator/history — session-scoped request history
 * GET /api/operator/request/:id — single request detail
 * POST /:requestId/clarify-answer — submit clarification answer
 * POST /:requestId/approve-brief — approve execution brief
 * POST /:requestId/reject-brief — reject brief, return to clarification
 * POST /:requestId/escalate — escalate request
 */

import { describe, it, expect, vi } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

// Mock pipeline spawner to avoid child_process.spawn in tests
vi.mock('../pipeline/spawner', () => ({
  spawnPipeline: vi.fn(() => ({ pid: 99999, outputDir: '/tmp/pipeline-test-mock' })),
}))

// Mock file watcher to avoid real filesystem polling
vi.mock('../pipeline/file-watcher', () => ({
  watchPipelineOutput: vi.fn(),
  stopWatching: vi.fn(),
  finalSweep: vi.fn(),
}))

// Mock clarifier and brief generator
vi.mock('../pipeline/clarifier', () => ({
  generateClarificationQuestion: vi.fn().mockResolvedValue({
    isComplete: false,
    question: 'What color scheme do you prefer?',
  }),
}))

vi.mock('../pipeline/brief-generator', () => ({
  generateExecutionBrief: vi.fn().mockResolvedValue({
    scope: ['Build landing page'],
    assumptions: ['Using existing design system'],
    acceptanceCriteria: ['Page loads in under 2s'],
  }),
}))

// Helper to seed a user directly in DB
async function seedUser(role: 'admin' | 'operator', email?: string) {
  const { db } = getTestDb()
  const id = nanoid()
  const userEmail = email ?? `${role}-${id}@test.com`
  await db.insert(schema.users).values({
    id,
    email: userEmail,
    role,
    source: 'tailscale',
  })
  return { id, email: userEmail, role }
}

// Helper to create a test app with mock auth
async function createTestApp(user: { id: string; email: string; role: string }) {
  const { default: operatorApp } = await import('../routes/operator')
  const { Hono } = await import('hono')
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('user' as any, { id: user.id, email: user.email, role: user.role, source: 'tailscale' })
    return next()
  })
  app.route('/operator', operatorApp)
  return app
}

// Helper to seed a request directly in DB
async function seedRequest(userId: string, overrides: Partial<typeof schema.operatorRequests.$inferInsert> = {}) {
  const { db } = getTestDb()
  const id = nanoid()
  await db.insert(schema.operatorRequests).values({
    id,
    userId,
    whatNeeded: 'Test request',
    whatGood: 'Test criteria',
    ...overrides,
  })
  return id
}

describe('POST /api/operator/request', () => {
  it('creates a request and starts clarification flow, returns 201', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)

    const res = await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatNeeded: 'Build a landing page',
        whatGood: 'Clean design with clear CTA',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.id).toBeDefined()
    // Status is 'clarifying' because pipeline no longer spawns immediately
    expect(body.status).toBe('clarifying')
    expect(body.question).toBeDefined()
  })

  it('returns 400 when whatNeeded is missing', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)

    const res = await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatGood: 'Something good',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 when whatGood is missing', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)

    const res = await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatNeeded: 'Something needed',
      }),
    })

    expect(res.status).toBe(400)
  })

  it('creates audit trail entry on request submission', async () => {
    const user = await seedUser('operator')
    const { db } = getTestDb()
    const app = await createTestApp(user)

    await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatNeeded: 'Fix the bug',
        whatGood: 'No more errors',
      }),
    })

    const auditRows = await db.select().from(schema.auditTrail)
    // 2 entries: request_submitted + clarification_question
    expect(auditRows.length).toBeGreaterThanOrEqual(2)
    const submitted = auditRows.find(r => r.action === 'request_submitted')
    expect(submitted).toBeDefined()
    expect(submitted!.userId).toBe(user.id)
    const clarification = auditRows.find(r => r.action === 'clarification_question')
    expect(clarification).toBeDefined()
  })
})

describe('POST /:requestId/clarify-answer', () => {
  it('accepts an answer and returns next question', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, {
      status: 'clarifying',
      clarificationData: JSON.stringify([{ question: 'What color?', answer: '' }]),
    })

    const res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Blue' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('clarifying')
  })

  it('returns 400 when request is not in clarifying state', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'briefing' })

    const res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Blue' }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 when answer is empty', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'clarifying' })

    const res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: '' }),
    })

    expect(res.status).toBe(400)
  })
})

describe('POST /:requestId/approve-brief', () => {
  it('approves brief and spawns pipeline', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, {
      status: 'briefing',
      briefData: JSON.stringify({ scope: ['test'], assumptions: ['test'], acceptanceCriteria: ['test'] }),
    })

    const res = await app.request(`/operator/${requestId}/approve-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('running')
    expect(body.pid).toBeDefined()
  })

  it('returns 400 when request is not in briefing state', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'clarifying' })

    const res = await app.request(`/operator/${requestId}/approve-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
  })
})

describe('POST /:requestId/reject-brief', () => {
  it('rejects brief and returns to clarification', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, {
      status: 'briefing',
      briefData: JSON.stringify({ scope: ['test'], assumptions: ['test'], acceptanceCriteria: ['test'] }),
    })

    const res = await app.request(`/operator/${requestId}/reject-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('clarifying')
  })
})

describe('POST /:requestId/escalate', () => {
  it('escalates from clarifying state', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'clarifying' })

    const res = await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('escalated')
  })

  it('escalates from briefing state', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'briefing' })

    const res = await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('escalated')
  })

  it('escalates from timeout state', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'timeout' })

    const res = await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('escalated')
  })

  it('returns 400 when trying to escalate from running state', async () => {
    const user = await seedUser('operator')
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'running' })

    const res = await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
  })

  it('creates audit trail entry for escalation', async () => {
    const user = await seedUser('operator')
    const { db } = getTestDb()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'clarifying' })

    await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const auditRows = await db.select().from(schema.auditTrail)
    const escalation = auditRows.find(r => r.action === 'escalated_to_ryan')
    expect(escalation).toBeDefined()
    expect(escalation!.requestId).toBe(requestId)
  })
})

describe('GET /api/operator/history', () => {
  it('returns only the operator\'s own requests (session isolation)', async () => {
    const operatorA = await seedUser('operator', 'alice@test.com')
    const operatorB = await seedUser('operator', 'bob@test.com')
    const { db } = getTestDb()

    // Seed requests for both operators
    await db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorA.id,
      whatNeeded: 'Alice request',
      whatGood: 'Alice good',
    })
    await db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorB.id,
      whatNeeded: 'Bob request',
      whatGood: 'Bob good',
    })

    const app = await createTestApp(operatorA)
    const res = await app.request('/operator/history')
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0].whatNeeded).toBe('Alice request')
  })

  it('returns all requests for admin users', async () => {
    const admin = await seedUser('admin', 'admin@test.com')
    const operatorA = await seedUser('operator', 'alice@test.com')
    const operatorB = await seedUser('operator', 'bob@test.com')
    const { db } = getTestDb()

    await db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorA.id,
      whatNeeded: 'Alice request',
      whatGood: 'Alice good',
    })
    await db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorB.id,
      whatNeeded: 'Bob request',
      whatGood: 'Bob good',
    })

    const app = await createTestApp(admin)
    const res = await app.request('/operator/history')
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body).toHaveLength(2)
  })
})

describe('GET /api/operator/request/:id', () => {
  it('returns request detail for the owner', async () => {
    const user = await seedUser('operator')
    const requestId = await seedRequest(user.id, { deadline: 'Friday' })

    const app = await createTestApp(user)
    const res = await app.request(`/operator/request/${requestId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toBe(requestId)
    expect(body.whatNeeded).toBe('Test request')
  })

  it('returns 403 when operator tries to access another user\'s request', async () => {
    const operatorA = await seedUser('operator', 'alice@test.com')
    const operatorB = await seedUser('operator', 'bob@test.com')
    const requestId = await seedRequest(operatorB.id)

    const app = await createTestApp(operatorA)
    const res = await app.request(`/operator/request/${requestId}`)
    expect(res.status).toBe(403)
  })
})
