/**
 * Audit trail tests for operator request routes.
 *
 * Verifies each API route creates the correct audit trail entry with:
 * - correct action type
 * - correct requestId
 * - correct userId
 * - valid detail JSON
 * - non-null createdAt timestamp
 */

import { describe, it, expect, vi } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
import { mkdirSync } from 'node:fs'
import * as schema from '../db/schema'

// Mock pipeline spawner
vi.mock('../pipeline/spawner', () => ({
  spawnPipeline: vi.fn(() => ({ pid: 99999, outputDir: '/tmp/pipeline-audit-test' })),
}))

// Mock file watcher
vi.mock('../pipeline/file-watcher', () => ({
  watchPipelineOutput: vi.fn(),
  stopWatching: vi.fn(),
  finalSweep: vi.fn(),
}))

// Mock clarifier — returns question by default
vi.mock('../pipeline/clarifier', () => ({
  generateClarificationQuestion: vi.fn().mockResolvedValue({
    isComplete: false,
    question: 'What color scheme do you prefer?',
  }),
}))

// Mock brief generator
vi.mock('../pipeline/brief-generator', () => ({
  generateExecutionBrief: vi.fn().mockResolvedValue({
    scope: ['Build landing page'],
    assumptions: ['Using existing design system'],
    acceptanceCriteria: ['Page loads in under 2s'],
  }),
}))

// Mock timeout monitor
vi.mock('../pipeline/timeout-monitor', () => ({
  startTimeoutMonitor: vi.fn(),
  clearTimeoutMonitor: vi.fn(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────

async function seedUser(role: 'admin' | 'operator' = 'operator') {
  const { db } = getTestDb()
  const id = nanoid()
  await db.insert(schema.users).values({
    id,
    email: `audit-${id}@test.com`,
    role,
    source: 'tailscale',
  })
  return { id, email: `audit-${id}@test.com`, role }
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
    whatNeeded: 'Build a dashboard',
    whatGood: 'Fast and pretty',
    ...overrides,
  })
  return id
}

function getAuditEntries() {
  const { db } = getTestDb()
  return db.select().from(schema.auditTrail)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Audit trail: request_submitted', () => {
  it('creates audit entry with action=request_submitted on POST /request', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)

    const res = await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatNeeded: 'Fix the login', whatGood: 'No errors' }),
    })

    expect(res.status).toBe(201)
    const entries = await getAuditEntries()
    const submitted = entries.find(e => e.action === 'request_submitted')
    expect(submitted).toBeDefined()
    expect(submitted!.userId).toBe(user.id)
    expect(submitted!.requestId).toBeDefined()
    expect(submitted!.createdAt).toBeTruthy()
    const detail = JSON.parse(submitted!.detail!)
    expect(detail.whatNeeded).toBeDefined()
  })
})

describe('Audit trail: clarification_question', () => {
  it('creates audit entry with action=clarification_question on POST /request', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)

    await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatNeeded: 'Build a dashboard', whatGood: 'Clean UI' }),
    })

    const entries = await getAuditEntries()
    const question = entries.find(e => e.action === 'clarification_question')
    expect(question).toBeDefined()
    expect(question!.userId).toBe(user.id)
    expect(question!.createdAt).toBeTruthy()
    const detail = JSON.parse(question!.detail!)
    expect(detail.question).toBeDefined()
    expect(detail.questionNumber).toBe(1)
  })
})

describe('Audit trail: clarification_answer', () => {
  it('creates audit entry with action=clarification_answer on POST /:id/clarify-answer', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, {
      status: 'clarifying',
      clarificationData: JSON.stringify([{ question: 'What color?', answer: '' }]),
    })

    const res = await app.request(`/operator/${requestId}/clarify-answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer: 'Blue and white' }),
    })

    expect(res.status).toBe(200)
    const entries = await getAuditEntries()
    const answer = entries.find(e => e.action === 'clarification_answer')
    expect(answer).toBeDefined()
    expect(answer!.userId).toBe(user.id)
    expect(answer!.requestId).toBe(requestId)
    expect(answer!.createdAt).toBeTruthy()
    const detail = JSON.parse(answer!.detail!)
    expect(detail.answer).toBeDefined()
  })
})

describe('Audit trail: brief_approved', () => {
  it('creates audit entry with action=brief_approved on POST /:id/approve-brief', async () => {
    const user = await seedUser()
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
    const entries = await getAuditEntries()
    const approved = entries.find(e => e.action === 'brief_approved')
    expect(approved).toBeDefined()
    expect(approved!.userId).toBe(user.id)
    expect(approved!.requestId).toBe(requestId)
    expect(approved!.createdAt).toBeTruthy()
  })
})

describe('Audit trail: pipeline_spawned', () => {
  it('creates audit entry with action=pipeline_spawned on POST /:id/approve-brief', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, {
      status: 'briefing',
      briefData: JSON.stringify({ scope: ['test'], assumptions: ['test'], acceptanceCriteria: ['test'] }),
    })

    await app.request(`/operator/${requestId}/approve-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const entries = await getAuditEntries()
    const spawned = entries.find(e => e.action === 'pipeline_spawned')
    expect(spawned).toBeDefined()
    expect(spawned!.userId).toBe(user.id)
    expect(spawned!.requestId).toBe(requestId)
    expect(spawned!.createdAt).toBeTruthy()
    const detail = JSON.parse(spawned!.detail!)
    expect(detail.pid).toBeDefined()
    expect(detail.outputDir).toBeDefined()
  })
})

describe('Audit trail: brief_rejected', () => {
  it('creates audit entry with action=brief_rejected on POST /:id/reject-brief', async () => {
    const user = await seedUser()
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
    const entries = await getAuditEntries()
    const rejected = entries.find(e => e.action === 'brief_rejected')
    expect(rejected).toBeDefined()
    expect(rejected!.userId).toBe(user.id)
    expect(rejected!.requestId).toBe(requestId)
    expect(rejected!.createdAt).toBeTruthy()
  })
})

describe('Audit trail: escalated_to_ryan', () => {
  it('creates audit entry with action=escalated_to_ryan on POST /:id/escalate', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const requestId = await seedRequest(user.id, { status: 'clarifying' })

    const res = await app.request(`/operator/${requestId}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(res.status).toBe(200)
    const entries = await getAuditEntries()
    const escalated = entries.find(e => e.action === 'escalated_to_ryan')
    expect(escalated).toBeDefined()
    expect(escalated!.userId).toBe(user.id)
    expect(escalated!.requestId).toBe(requestId)
    expect(escalated!.createdAt).toBeTruthy()
    const detail = JSON.parse(escalated!.detail!)
    expect(detail.fromStatus).toBe('clarifying')
  })
})

describe('Audit trail: gate_response', () => {
  it('creates audit entry with action=gate_response on POST /:id/gate-response', async () => {
    const user = await seedUser()
    const app = await createTestApp(user)
    const gateDir = `/tmp/gate-test-${nanoid()}`
    mkdirSync(gateDir, { recursive: true })
    const requestId = await seedRequest(user.id, {
      status: 'running',
      outputDir: gateDir,
    })

    const res = await app.request(`/operator/${requestId}/gate-response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gateId: 'gate-1', response: 'approve' }),
    })

    expect(res.status).toBe(200)
    const entries = await getAuditEntries()
    const gate = entries.find(e => e.action === 'gate_response')
    expect(gate).toBeDefined()
    expect(gate!.userId).toBe(user.id)
    expect(gate!.requestId).toBe(requestId)
    expect(gate!.createdAt).toBeTruthy()
    const detail = JSON.parse(gate!.detail!)
    expect(detail.gateId).toBe('gate-1')
    expect(detail.response).toBe('approve')
  })
})

describe('Audit trail: brief_generated', () => {
  it('creates audit entry with action=brief_generated when clarification is skipped', async () => {
    // Override the mock to return isComplete: true (skips clarification)
    const { generateClarificationQuestion } = await import('../pipeline/clarifier')
    vi.mocked(generateClarificationQuestion).mockResolvedValueOnce({
      isComplete: true,
      question: '',
    })

    const user = await seedUser()
    const app = await createTestApp(user)

    const res = await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatNeeded: 'Simple fix', whatGood: 'Works correctly' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as any
    expect(body.status).toBe('briefing')

    const entries = await getAuditEntries()
    const generated = entries.find(e => e.action === 'brief_generated')
    expect(generated).toBeDefined()
    expect(generated!.userId).toBe(user.id)
    expect(generated!.createdAt).toBeTruthy()
    const detail = JSON.parse(generated!.detail!)
    expect(detail.skippedClarification).toBe(true)
  })
})
