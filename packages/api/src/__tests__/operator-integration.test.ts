/**
 * Integration tests for the full operator clarify-approve-complete flow.
 *
 * Tests end-to-end scenarios with mocked Claude API and pipeline spawner.
 * Verifies state transitions, audit trail completeness, and error paths.
 */

import { describe, it, expect, vi } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema'

// Mock pipeline spawner
vi.mock('../pipeline/spawner', () => ({
  spawnPipeline: vi.fn(() => ({ pid: 88888, outputDir: '/tmp/pipeline-integration-test' })),
}))

// Mock file watcher
vi.mock('../pipeline/file-watcher', () => ({
  watchPipelineOutput: vi.fn(),
  stopWatching: vi.fn(),
  finalSweep: vi.fn(),
}))

// Track call count for clarifier to simulate multi-question flow
let clarifierCallCount = 0

vi.mock('../pipeline/clarifier', () => ({
  generateClarificationQuestion: vi.fn().mockImplementation(() => {
    clarifierCallCount++
    // After 2 answers (3rd call = initial + 2 answers), mark complete
    if (clarifierCallCount >= 3) {
      return Promise.resolve({ isComplete: true, question: '' })
    }
    return Promise.resolve({
      isComplete: false,
      question: `Clarification question #${clarifierCallCount}`,
    })
  }),
}))

vi.mock('../pipeline/brief-generator', () => ({
  generateExecutionBrief: vi.fn().mockResolvedValue({
    scope: ['Build full feature'],
    assumptions: ['Design system available'],
    acceptanceCriteria: ['All tests pass', 'Performance under 2s'],
  }),
}))

// Mock timeout monitor
vi.mock('../pipeline/timeout-monitor', () => ({
  startTimeoutMonitor: vi.fn(),
  clearTimeoutMonitor: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

async function seedUser(role: 'admin' | 'operator' = 'operator', email?: string) {
  const { db } = getTestDb()
  const id = nanoid()
  const userEmail = email ?? `integ-${id}@test.com`
  await db.insert(schema.users).values({
    id,
    email: userEmail,
    role,
    source: 'tailscale',
  })
  return { id, email: userEmail, role }
}

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

async function seedRequest(userId: string, overrides: Partial<typeof schema.operatorRequests.$inferInsert> = {}) {
  const { db } = getTestDb()
  const id = nanoid()
  await db.insert(schema.operatorRequests).values({
    id,
    userId,
    whatNeeded: 'Integration test request',
    whatGood: 'Integration test criteria',
    ...overrides,
  })
  return id
}

// ── Full flow test ─────────────────────────────────────────────────────────

describe('Full operator flow: submit -> clarify -> approve -> complete', () => {
  it('produces correct state transitions and audit trail', async () => {
    // Reset clarifier call count
    clarifierCallCount = 0

    const user = await seedUser()
    const app = await createTestApp(user)
    const { db } = getTestDb()

    // Step 1: Submit request
    const submitRes = await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatNeeded: 'Build a user dashboard',
        whatGood: 'Clean, responsive, fast',
      }),
    })

    expect(submitRes.status).toBe(201)
    const submitBody = await submitRes.json() as any
    expect(submitBody.status).toBe('clarifying')
    expect(submitBody.question).toBeDefined()
    const requestId = submitBody.id

    // Step 2: Answer first clarification question
    const answer1Res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'I want charts and tables' }),
    })

    expect(answer1Res.status).toBe(200)
    const answer1Body = await answer1Res.json() as any
    expect(answer1Body.status).toBe('clarifying')
    expect(answer1Body.question).toBeDefined()

    // Step 3: Answer second question — clarifier returns isComplete
    const answer2Res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'React with Tailwind' }),
    })

    expect(answer2Res.status).toBe(200)
    const answer2Body = await answer2Res.json() as any
    expect(answer2Body.status).toBe('briefing')
    expect(answer2Body.brief).toBeDefined()

    // Step 4: Approve brief
    const approveRes = await app.request(`/operator/${requestId}/approve-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(approveRes.status).toBe(200)
    const approveBody = await approveRes.json() as any
    expect(approveBody.status).toBe('running')
    expect(approveBody.pid).toBeDefined()

    // Step 5: Verify audit trail has all expected entries
    const entries = await db.select()
      .from(schema.auditTrail)
      .where(eq(schema.auditTrail.requestId, requestId))

    const actions = entries.map(e => e.action).sort()

    // Expected: request_submitted, clarification_question (initial),
    //           clarification_answer (x2), brief_approved, pipeline_spawned
    expect(actions).toContain('request_submitted')
    expect(actions).toContain('clarification_question')
    expect(actions).toContain('clarification_answer')
    expect(actions).toContain('brief_approved')
    expect(actions).toContain('pipeline_spawned')

    // Should have at least 7 entries
    // request_submitted + clarification_question (initial) + clarification_answer + clarification_answer + brief_approved + pipeline_spawned = 6 minimum
    expect(entries.length).toBeGreaterThanOrEqual(6)

    // All entries should have the correct requestId
    expect(entries.every(e => e.requestId === requestId)).toBe(true)

    // All entries should have the correct userId
    expect(entries.every(e => e.userId === user.id)).toBe(true)

    // All entries should have non-null createdAt
    expect(entries.every(e => e.createdAt !== null)).toBe(true)
  })
})

// ── Error path tests ───────────────────────────────────────────────────────

describe('Error paths: invalid state transitions', () => {
  it('returns 400 when submitting answer to a non-clarifying request', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'briefing' })

    const res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Some answer' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toContain('not in clarifying')
  })

  it('returns 400 when approving brief in non-briefing state', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'clarifying' })

    const res = await app.request(`/operator/${requestId}/approve-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toContain('not in briefing')
  })

  it('returns 400 when escalating from complete status', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'complete' })

    const res = await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
    const body = await res.json() as any
    expect(body.error).toBeDefined()
  })

  it('returns 400 when escalating from running status', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'running' })

    const res = await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(400)
  })
})

describe('Error paths: cross-user access', () => {
  it('returns 404 when operator tries to clarify another user\'s request', async () => {
    const userA = await seedUser('operator', 'userA@test.com')
    const userB = await seedUser('operator', 'userB@test.com')
    const requestId = await seedRequest(userB.id, {
      status: 'clarifying',
      clarificationData: JSON.stringify([{ question: 'Q?', answer: '' }]),
    })

    const app = await createTestApp(userA)
    const res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Unauthorized answer' }),
    })

    // loadAndVerifyRequest returns null for cross-user access -> 404
    expect(res.status).toBe(404)
  })

  it('returns 403 when operator tries to view another user\'s request detail', async () => {
    const userA = await seedUser('operator', 'viewerA@test.com')
    const userB = await seedUser('operator', 'viewerB@test.com')
    const requestId = await seedRequest(userB.id)

    const app = await createTestApp(userA)
    const res = await app.request(`/operator/request/${requestId}`)

    expect(res.status).toBe(403)
  })
})
