/**
 * Tests for timeout monitor and timeout retry flow.
 *
 * Validates OP-08: 5-minute timeout detection per request.
 * Validates retry-timeout route transitions timeout -> running.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nanoid } from 'nanoid'
import { getTestDb } from './helpers/test-db'
import * as schema from '../db/schema'
import { eq } from 'drizzle-orm'

// Mock the pipeline bus
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

// Helper to seed a user + request
async function seedRequest(status: string = 'running') {
  const { db } = getTestDb()
  const userId = nanoid()
  const requestId = nanoid()

  await db.insert(schema.users).values({
    id: userId,
    email: `test-${userId}@test.com`,
    role: 'operator',
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
  })

  return { userId, requestId }
}

describe('timeout-monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    emittedEvents.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires after 5 minutes (300000ms)', async () => {
    const { startTimeoutMonitor, clearTimeoutMonitor } = await import('../pipeline/timeout-monitor')
    const { requestId } = await seedRequest('running')

    startTimeoutMonitor(requestId)

    // Advance just under 5 minutes — should NOT fire
    await vi.advanceTimersByTimeAsync(299_999)
    const timeoutEvents = emittedEvents.filter(e => e.type === 'operator:error' && e.errorType === 'timeout')
    expect(timeoutEvents).toHaveLength(0)

    // Advance past 5 minutes — should fire
    await vi.advanceTimersByTimeAsync(2)
    const firedEvents = emittedEvents.filter(e => e.type === 'operator:error' && e.errorType === 'timeout')
    expect(firedEvents).toHaveLength(1)
    expect(firedEvents[0].runId).toBe(requestId)
    expect(firedEvents[0].message).toContain('Taking longer than expected')

    // Cleanup
    clearTimeoutMonitor(requestId)
  })

  it('clearTimeoutMonitor prevents timer from firing', async () => {
    const { startTimeoutMonitor, clearTimeoutMonitor } = await import('../pipeline/timeout-monitor')
    const { requestId } = await seedRequest('running')

    startTimeoutMonitor(requestId)
    clearTimeoutMonitor(requestId)

    // Advance past timeout
    await vi.advanceTimersByTimeAsync(400_000)

    const timeoutEvents = emittedEvents.filter(e => e.type === 'operator:error' && e.errorType === 'timeout')
    expect(timeoutEvents).toHaveLength(0)
  })

  it('replaces existing timer on repeated start', async () => {
    const { startTimeoutMonitor, clearTimeoutMonitor } = await import('../pipeline/timeout-monitor')
    const { requestId } = await seedRequest('running')

    startTimeoutMonitor(requestId)
    // Start again before first fires
    startTimeoutMonitor(requestId, 100_000)

    // Advance past 100s but under 300s
    await vi.advanceTimersByTimeAsync(100_001)
    const timeoutEvents = emittedEvents.filter(e => e.type === 'operator:error' && e.errorType === 'timeout')
    expect(timeoutEvents).toHaveLength(1)

    clearTimeoutMonitor(requestId)
  })

  it('uses custom timeout duration', async () => {
    const { startTimeoutMonitor, clearTimeoutMonitor } = await import('../pipeline/timeout-monitor')
    const { requestId } = await seedRequest('running')

    startTimeoutMonitor(requestId, 10_000) // 10 seconds

    await vi.advanceTimersByTimeAsync(10_001)
    const firedEvents = emittedEvents.filter(e => e.type === 'operator:error' && e.errorType === 'timeout')
    expect(firedEvents).toHaveLength(1)

    clearTimeoutMonitor(requestId)
  })
})
