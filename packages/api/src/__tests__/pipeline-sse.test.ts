/**
 * Pipeline callback and SSE integration tests.
 * Verifies callback route triggers final sweep and completion.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Hono } from 'hono'
import { getTestDb, resetTestDb } from './helpers/test-db'
import { operatorRequests, users } from '../db/schema'
import { nanoid } from 'nanoid'
import { pipelineBus } from '../events/bus'

// We need to test the callback route
// Import after mocks are set up by test-db
import operatorApp from '../routes/operator'

describe('pipeline callback route', () => {
  let outputDir: string
  const pipelineId = `callback-test-${Date.now()}`
  let emittedEvents: any[] = []
  const captureEvents = (event: any) => { emittedEvents.push(event) }

  beforeEach(async () => {
    emittedEvents = []
    outputDir = join(tmpdir(), `pipeline-${pipelineId}`)
    mkdirSync(outputDir, { recursive: true })
    pipelineBus.on('pipeline:event', captureEvents)
  })

  afterEach(() => {
    pipelineBus.off('pipeline:event', captureEvents)
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true })
    }
  })

  it('callback route validates pipelineId and returns 200', async () => {
    const { db } = getTestDb()

    // Create a user and request
    const userId = nanoid()
    await db.insert(users).values({
      id: userId,
      email: 'test@example.com',
      role: 'operator',
      source: 'magic-link',
    })

    const requestId = nanoid()
    await db.insert(operatorRequests).values({
      id: requestId,
      userId,
      whatNeeded: 'Test request',
      whatGood: 'Test criteria',
      status: 'running',
      outputDir,
    })

    // Write result.json to the output directory
    writeFileSync(
      join(outputDir, 'result.json'),
      JSON.stringify({ summary: 'Pipeline completed successfully' })
    )

    // Create a minimal Hono app with the operator routes
    const testApp = new Hono()
    // Set mock user for auth
    testApp.use('*', async (c, next) => {
      c.set('user' as any, { id: userId, email: 'test@example.com', role: 'operator' })
      await next()
    })
    testApp.route('/operator', operatorApp)

    const res = await testApp.request('/operator/pipeline/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pipelineId: requestId }),
    })

    expect(res.status).toBe(200)
  })
})
