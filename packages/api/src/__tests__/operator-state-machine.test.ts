/**
 * Tests for the operator request state machine.
 *
 * Validates all status transitions per the clarify -> brief -> approve flow.
 */

import { describe, it, expect, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
import * as schema from '../db/schema'

// Helper to seed a user + operator request in DB
async function seedRequest(status: string = 'pending') {
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
  })

  return { userId, requestId }
}

describe('canTransition', () => {
  it('allows pending -> clarifying', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('pending', 'clarifying')).toBe(true)
  })

  it('blocks pending -> running (must go through clarify/brief flow)', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('pending', 'running')).toBe(false)
  })

  it('allows clarifying -> briefing', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('clarifying', 'briefing')).toBe(true)
  })

  it('allows clarifying -> escalated', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('clarifying', 'escalated')).toBe(true)
  })

  it('allows briefing -> approved', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('briefing', 'approved')).toBe(true)
  })

  it('allows briefing -> clarifying (reject goes back)', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('briefing', 'clarifying')).toBe(true)
  })

  it('allows approved -> running', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('approved', 'running')).toBe(true)
  })

  it('allows running -> complete', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('running', 'complete')).toBe(true)
  })

  it('allows running -> timeout', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('running', 'timeout')).toBe(true)
  })

  it('allows running -> failed', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('running', 'failed')).toBe(true)
  })

  it('allows timeout -> running (keep waiting)', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('timeout', 'running')).toBe(true)
  })

  it('allows timeout -> escalated', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('timeout', 'escalated')).toBe(true)
  })

  it('blocks complete -> pending (terminal)', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('complete', 'pending')).toBe(false)
  })

  it('blocks failed -> pending (terminal)', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('failed', 'pending')).toBe(false)
  })

  it('blocks escalated -> anything (terminal)', async () => {
    const { canTransition } = await import('../pipeline/state-machine')
    expect(canTransition('escalated', 'pending')).toBe(false)
    expect(canTransition('escalated', 'clarifying')).toBe(false)
    expect(canTransition('escalated', 'running')).toBe(false)
  })
})

describe('transitionRequest', () => {
  it('updates status in DB for valid transition', async () => {
    const { transitionRequest } = await import('../pipeline/state-machine')
    const { db } = getTestDb()
    const { requestId } = await seedRequest('pending')

    await transitionRequest(requestId, 'clarifying')

    const [row] = await db.select()
      .from(schema.operatorRequests)
      .where(eq(schema.operatorRequests.id, requestId))

    expect(row.status).toBe('clarifying')
  })

  it('throws on invalid transition', async () => {
    const { transitionRequest } = await import('../pipeline/state-machine')
    const { requestId } = await seedRequest('pending')

    await expect(transitionRequest(requestId, 'running'))
      .rejects.toThrow('Invalid transition: pending -> running')
  })

  it('throws when request not found', async () => {
    const { transitionRequest } = await import('../pipeline/state-machine')

    await expect(transitionRequest('nonexistent', 'clarifying'))
      .rejects.toThrow()
  })
})
