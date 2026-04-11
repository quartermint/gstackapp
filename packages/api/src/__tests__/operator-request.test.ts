/**
 * Tests for operator request routes.
 *
 * POST /api/operator/request — create operator request
 * GET /api/operator/history — session-scoped request history
 * GET /api/operator/request/:id — single request detail
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
import * as schema from '../db/schema'

// Helper to seed a user directly in DB
function seedUser(role: 'admin' | 'operator', email?: string) {
  const { db } = getTestDb()
  const id = nanoid()
  const userEmail = email ?? `${role}-${id}@test.com`
  db.insert(schema.users).values({
    id,
    email: userEmail,
    role,
    source: 'tailscale',
  }).run()
  return { id, email: userEmail, role }
}

describe('POST /api/operator/request', () => {
  it('creates a request with valid body and returns 201', async () => {
    const user = seedUser('operator')
    const { db } = getTestDb()

    // Import operator app after DB is set up
    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    // Mount with mock auth context
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: user.id, email: user.email, role: user.role, source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

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
    expect(body.status).toBe('pending')

    // Verify DB row
    const rows = db.select().from(schema.operatorRequests).all()
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(user.id)
    expect(rows[0].whatNeeded).toBe('Build a landing page')
    expect(rows[0].whatGood).toBe('Clean design with clear CTA')
  })

  it('returns 400 when whatNeeded is missing', async () => {
    const user = seedUser('operator')

    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: user.id, email: user.email, role: user.role, source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

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
    const user = seedUser('operator')

    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: user.id, email: user.email, role: user.role, source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

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
    const user = seedUser('operator')
    const { db } = getTestDb()

    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: user.id, email: user.email, role: user.role, source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

    await app.request('/operator/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatNeeded: 'Fix the bug',
        whatGood: 'No more errors',
      }),
    })

    const auditRows = db.select().from(schema.auditTrail).all()
    expect(auditRows).toHaveLength(1)
    expect(auditRows[0].action).toBe('request_submitted')
    expect(auditRows[0].userId).toBe(user.id)
  })
})

describe('GET /api/operator/history', () => {
  it('returns only the operator\'s own requests (session isolation)', async () => {
    const operatorA = seedUser('operator', 'alice@test.com')
    const operatorB = seedUser('operator', 'bob@test.com')
    const { db } = getTestDb()

    // Seed requests for both operators
    db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorA.id,
      whatNeeded: 'Alice request',
      whatGood: 'Alice good',
    }).run()
    db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorB.id,
      whatNeeded: 'Bob request',
      whatGood: 'Bob good',
    }).run()

    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    // Request as operator A
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: operatorA.id, email: operatorA.email, role: 'operator', source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/history')
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body).toHaveLength(1)
    expect(body[0].whatNeeded).toBe('Alice request')
  })

  it('returns all requests for admin users', async () => {
    const admin = seedUser('admin', 'admin@test.com')
    const operatorA = seedUser('operator', 'alice@test.com')
    const operatorB = seedUser('operator', 'bob@test.com')
    const { db } = getTestDb()

    db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorA.id,
      whatNeeded: 'Alice request',
      whatGood: 'Alice good',
    }).run()
    db.insert(schema.operatorRequests).values({
      id: nanoid(),
      userId: operatorB.id,
      whatNeeded: 'Bob request',
      whatGood: 'Bob good',
    }).run()

    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: admin.id, email: admin.email, role: 'admin', source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/history')
    expect(res.status).toBe(200)
    const body = await res.json() as any[]
    expect(body).toHaveLength(2)
  })
})

describe('GET /api/operator/request/:id', () => {
  it('returns request detail for the owner', async () => {
    const user = seedUser('operator')
    const { db } = getTestDb()
    const requestId = nanoid()

    db.insert(schema.operatorRequests).values({
      id: requestId,
      userId: user.id,
      whatNeeded: 'My request',
      whatGood: 'My criteria',
      deadline: 'Friday',
    }).run()

    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: user.id, email: user.email, role: 'operator', source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request(`/operator/request/${requestId}`)
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.id).toBe(requestId)
    expect(body.whatNeeded).toBe('My request')
  })

  it('returns 403 when operator tries to access another user\'s request', async () => {
    const operatorA = seedUser('operator', 'alice@test.com')
    const operatorB = seedUser('operator', 'bob@test.com')
    const { db } = getTestDb()
    const requestId = nanoid()

    db.insert(schema.operatorRequests).values({
      id: requestId,
      userId: operatorB.id,
      whatNeeded: 'Bob request',
      whatGood: 'Bob good',
    }).run()

    const { default: operatorApp } = await import('../routes/operator')
    const { Hono } = await import('hono')

    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: operatorA.id, email: operatorA.email, role: 'operator', source: 'tailscale' })
      return next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request(`/operator/request/${requestId}`)
    expect(res.status).toBe(403)
  })
})
