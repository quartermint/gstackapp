/**
 * Tests for operator request routes.
 *
 * POST /api/operator/request — create operator request
 * GET /api/operator/history — session-scoped request history
 * GET /api/operator/request/:id — single request detail
 */

import { describe, it, expect, vi } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
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

describe('POST /api/operator/request', () => {
  it('creates a request with valid body and returns 201', async () => {
    const user = await seedUser('operator')
    const { db } = getTestDb()
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
    // Status is 'running' because pipeline spawns immediately after creation
    expect(body.status).toBe('running')

    // Verify DB row
    const rows = await db.select().from(schema.operatorRequests)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(user.id)
    expect(rows[0].whatNeeded).toBe('Build a landing page')
    expect(rows[0].whatGood).toBe('Clean design with clear CTA')
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
    // 2 entries: request_submitted + pipeline_spawned
    expect(auditRows).toHaveLength(2)
    const submitted = auditRows.find(r => r.action === 'request_submitted')
    expect(submitted).toBeDefined()
    expect(submitted!.userId).toBe(user.id)
    const spawned = auditRows.find(r => r.action === 'pipeline_spawned')
    expect(spawned).toBeDefined()
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
    const { db } = getTestDb()
    const requestId = nanoid()

    await db.insert(schema.operatorRequests).values({
      id: requestId,
      userId: user.id,
      whatNeeded: 'My request',
      whatGood: 'My criteria',
      deadline: 'Friday',
    })

    const app = await createTestApp(user)
    const res = await app.request(`/operator/request/${requestId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toBe(requestId)
    expect(body.whatNeeded).toBe('My request')
  })

  it('returns 403 when operator tries to access another user\'s request', async () => {
    const operatorA = await seedUser('operator', 'alice@test.com')
    const operatorB = await seedUser('operator', 'bob@test.com')
    const { db } = getTestDb()
    const requestId = nanoid()

    await db.insert(schema.operatorRequests).values({
      id: requestId,
      userId: operatorB.id,
      whatNeeded: 'Bob request',
      whatGood: 'Bob good',
    })

    const app = await createTestApp(operatorA)
    const res = await app.request(`/operator/request/${requestId}`)
    expect(res.status).toBe(403)
  })
})
