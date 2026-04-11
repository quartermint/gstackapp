/**
 * Tests for provider exhaustion detection and retry routes.
 *
 * Validates OP-11: Provider exhaustion saves request for retry.
 * Validates retry-timeout and retry routes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nanoid } from 'nanoid'
import { getTestDb } from './helpers/test-db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'

// Track emitted events
const emittedEvents: any[] = []
vi.mock('../events/bus', () => ({
  pipelineBus: {
    emit: vi.fn((_event: string, data: any) => {
      emittedEvents.push(data)
    }),
    on: vi.fn(),
    removeListener: vi.fn(),
    setMaxListeners: vi.fn(),
  },
}))

// Mock spawner
vi.mock('../pipeline/spawner', () => ({
  spawnPipeline: vi.fn(() => ({ pid: 99999, outputDir: '/tmp/pipeline-mock' })),
}))

// Mock file watcher
vi.mock('../pipeline/file-watcher', () => ({
  watchPipelineOutput: vi.fn(),
  stopWatching: vi.fn(),
  finalSweep: vi.fn(),
}))

// Mock clarifier and brief generator
vi.mock('../pipeline/clarifier', () => ({
  generateClarificationQuestion: vi.fn().mockResolvedValue({ isComplete: true }),
}))

vi.mock('../pipeline/brief-generator', () => ({
  generateExecutionBrief: vi.fn().mockResolvedValue({
    scope: ['test scope'],
    assumptions: ['test assumption'],
    acceptanceCriteria: ['test criteria'],
  }),
}))

// Mock timeout monitor
vi.mock('../pipeline/timeout-monitor', () => ({
  startTimeoutMonitor: vi.fn(),
  clearTimeoutMonitor: vi.fn(),
}))

// Helper to seed a user + request
async function seedRequest(status: string = 'running', extra: Record<string, any> = {}) {
  const { db } = getTestDb()
  const userId = nanoid()
  const requestId = nanoid()

  await db.insert(schema.users).values({
    id: userId,
    email: `test-${userId}@test.com`,
    role: 'admin',
    source: 'tailscale',
  })

  await db.insert(schema.operatorRequests).values({
    id: requestId,
    userId,
    whatNeeded: 'Test request',
    whatGood: 'Test criteria',
    status,
    pipelinePid: 12345,
    outputDir: '/tmp/pipeline-test-123',
    ...extra,
  })

  return { userId, requestId }
}

// Helper to seed audit trail entries
async function seedAuditEntry(userId: string, requestId: string, action: string, detail?: string) {
  const { db } = getTestDb()
  await db.insert(schema.auditTrail).values({
    id: nanoid(),
    userId,
    requestId,
    action,
    detail: detail ?? null,
  })
}

describe('provider exhaustion detection', () => {
  beforeEach(() => {
    emittedEvents.length = 0
  })

  it('emits operator:error with provider-exhaustion errorType on spawn failure', async () => {
    // This test validates that when spawnPipeline throws a provider-related error,
    // the route handler catches it and emits the correct error event
    const { spawnPipeline } = await import('../pipeline/spawner')
    const spawnMock = vi.mocked(spawnPipeline)
    spawnMock.mockImplementationOnce(() => {
      throw new Error('Anthropic API rate limit exceeded')
    })

    // We test the error handling behavior by checking the emitted events
    // The approve-brief route should catch this error and emit provider-exhaustion
    const { db } = getTestDb()
    const { userId, requestId } = await seedRequest('briefing')

    // Import the operator app and test the route
    const operatorApp = (await import('../routes/operator')).default
    const { Hono } = await import('hono')
    const app = new Hono()
    // Mock auth middleware
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: userId, email: 'test@test.com', role: 'admin', source: 'tailscale' })
      await next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/' + requestId + '/approve-brief', {
      method: 'POST',
    })

    const body = await res.json()

    // Should have emitted provider-exhaustion error event
    const providerEvents = emittedEvents.filter(
      e => e.type === 'operator:error' && e.errorType === 'provider-exhaustion'
    )
    expect(providerEvents).toHaveLength(1)
    expect(providerEvents[0].message).toContain('AI service is currently at capacity')
  })
})

describe('retry-timeout route', () => {
  beforeEach(() => {
    emittedEvents.length = 0
  })

  it('transitions timeout -> running on retry', async () => {
    const { db } = getTestDb()
    const { userId, requestId } = await seedRequest('timeout')

    const operatorApp = (await import('../routes/operator')).default
    const { Hono } = await import('hono')
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: userId, email: 'test@test.com', role: 'admin', source: 'tailscale' })
      await next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/' + requestId + '/retry-timeout', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('running')

    // Verify DB state
    const [row] = await db.select()
      .from(schema.operatorRequests)
      .where(eq(schema.operatorRequests.id, requestId))
    expect(row.status).toBe('running')
  })

  it('rejects retry-timeout when status is not timeout', async () => {
    const { db } = getTestDb()
    const { userId, requestId } = await seedRequest('running')

    const operatorApp = (await import('../routes/operator')).default
    const { Hono } = await import('hono')
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: userId, email: 'test@test.com', role: 'admin', source: 'tailscale' })
      await next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/' + requestId + '/retry-timeout', {
      method: 'POST',
    })

    expect(res.status).toBe(400)
  })
})

describe('retry route (provider exhaustion)', () => {
  beforeEach(() => {
    emittedEvents.length = 0
  })

  it('transitions failed -> approved and re-spawns on retry', async () => {
    const { db } = getTestDb()
    const { userId, requestId } = await seedRequest('failed')

    // Seed audit trail with provider_exhaustion
    await seedAuditEntry(userId, requestId, 'provider_exhaustion', JSON.stringify({ error: 'rate limit' }))

    const operatorApp = (await import('../routes/operator')).default
    const { Hono } = await import('hono')
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: userId, email: 'test@test.com', role: 'admin', source: 'tailscale' })
      await next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/' + requestId + '/retry', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('running')
  })

  it('rejects retry when status is not failed', async () => {
    const { db } = getTestDb()
    const { userId, requestId } = await seedRequest('running')

    const operatorApp = (await import('../routes/operator')).default
    const { Hono } = await import('hono')
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: userId, email: 'test@test.com', role: 'admin', source: 'tailscale' })
      await next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/' + requestId + '/retry', {
      method: 'POST',
    })

    expect(res.status).toBe(400)
  })

  it('rejects retry when audit trail has no provider_exhaustion', async () => {
    const { db } = getTestDb()
    const { userId, requestId } = await seedRequest('failed')
    // No provider_exhaustion audit entry

    const operatorApp = (await import('../routes/operator')).default
    const { Hono } = await import('hono')
    const app = new Hono()
    app.use('*', async (c, next) => {
      c.set('user' as any, { id: userId, email: 'test@test.com', role: 'admin', source: 'tailscale' })
      await next()
    })
    app.route('/operator', operatorApp)

    const res = await app.request('/operator/' + requestId + '/retry', {
      method: 'POST',
    })

    expect(res.status).toBe(400)
  })
})
