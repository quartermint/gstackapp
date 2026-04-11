/**
 * File watcher tests.
 * Verifies polling of /tmp/pipeline-{id}/ for progress and gate files.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pipelineBus } from '../events/bus'
import { watchPipelineOutput, stopWatching, finalSweep } from '../pipeline/file-watcher'

describe('watchPipelineOutput', () => {
  let outputDir: string
  const pipelineId = `watcher-test-${Date.now()}`
  let emittedEvents: any[] = []
  const captureEvents = (event: any) => { emittedEvents.push(event) }

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    emittedEvents = []
    outputDir = join(tmpdir(), `pipeline-${pipelineId}`)
    mkdirSync(outputDir, { recursive: true })
    pipelineBus.on('pipeline:event', captureEvents)
  })

  afterEach(() => {
    stopWatching(pipelineId)
    pipelineBus.off('pipeline:event', captureEvents)
    vi.useRealTimers()
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true })
    }
  })

  it('detects new progress-NNN.json files and emits events', async () => {
    watchPipelineOutput(pipelineId, outputDir)

    // Write a progress file
    writeFileSync(
      join(outputDir, 'progress-001.json'),
      JSON.stringify({
        stage: 'clarify',
        status: 'running',
        message: 'Analyzing request',
        timestamp: new Date().toISOString(),
      })
    )

    // Advance timer to trigger poll
    await vi.advanceTimersByTimeAsync(2500)

    expect(emittedEvents.length).toBeGreaterThanOrEqual(1)
    const event = emittedEvents.find(e => e.type === 'operator:progress')
    expect(event).toBeDefined()
    expect(event.runId).toBe(pipelineId)
    expect(event.stage).toBe('clarify')
  })

  it('detects gate-{id}.json files and emits gate events', async () => {
    watchPipelineOutput(pipelineId, outputDir)

    writeFileSync(
      join(outputDir, 'gate-abc123.json'),
      JSON.stringify({
        id: 'abc123',
        title: 'Approve deployment?',
        description: 'Ready to deploy to production',
        options: ['Approve', 'Request Changes', 'Ask Ryan'],
      })
    )

    await vi.advanceTimersByTimeAsync(2500)

    const event = emittedEvents.find(e => e.type === 'operator:gate')
    expect(event).toBeDefined()
    expect(event.gateId).toBe('abc123')
    expect(event.title).toBe('Approve deployment?')
    expect(event.options).toContain('Approve')
  })

  it('ignores gate-{id}-response.json files', async () => {
    watchPipelineOutput(pipelineId, outputDir)

    writeFileSync(
      join(outputDir, 'gate-abc123-response.json'),
      JSON.stringify({ response: 'Approve' })
    )

    await vi.advanceTimersByTimeAsync(2500)

    const event = emittedEvents.find(e => e.type === 'operator:gate')
    expect(event).toBeUndefined()
  })

  it('stopWatching cleans up the polling interval', () => {
    watchPipelineOutput(pipelineId, outputDir)
    stopWatching(pipelineId)

    // After stopping, no new events even with new files
    writeFileSync(
      join(outputDir, 'progress-002.json'),
      JSON.stringify({ stage: 'plan', status: 'running', timestamp: new Date().toISOString() })
    )

    // Advance timers -- should not emit
    vi.advanceTimersByTime(5000)
    expect(emittedEvents).toHaveLength(0)
  })

  it('finalSweep processes unread files', () => {
    // Write files before starting watcher -- so they are "unread"
    writeFileSync(
      join(outputDir, 'progress-001.json'),
      JSON.stringify({ stage: 'clarify', status: 'complete', timestamp: new Date().toISOString() })
    )
    writeFileSync(
      join(outputDir, 'progress-002.json'),
      JSON.stringify({ stage: 'plan', status: 'complete', timestamp: new Date().toISOString() })
    )

    finalSweep(pipelineId, outputDir)

    expect(emittedEvents.length).toBe(2)
  })
})
