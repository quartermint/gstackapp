/**
 * Tests for verification report reader and file watcher extensions.
 *
 * Validates OP-05: Verification failure results are parsed into plain-language reports.
 * Validates OP-09: File watcher detects result.json and error files.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { nanoid } from 'nanoid'

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

describe('readVerificationResult', () => {
  const testDir = join(tmpdir(), `test-verification-${nanoid()}`)

  beforeEach(() => {
    emittedEvents.length = 0
    // Clean up test directory
    try { rmSync(testDir, { recursive: true }) } catch {}
    mkdirSync(testDir, { recursive: true })
  })

  it('returns null when result.json is missing', async () => {
    const { readVerificationResult } = await import('../pipeline/verification-reader')
    const result = readVerificationResult(testDir)
    expect(result).toBeNull()
  })

  it('parses passing result.json into VerificationReport', async () => {
    const { readVerificationResult } = await import('../pipeline/verification-reader')

    writeFileSync(join(testDir, 'result.json'), JSON.stringify({
      status: 'pass',
      summary: 'All checks passed successfully.',
      stages: [
        { name: 'build', status: 'pass' },
        { name: 'test', status: 'pass' },
        { name: 'lint', status: 'pass' },
      ],
      filesChanged: 5,
    }))

    const result = readVerificationResult(testDir)
    expect(result).not.toBeNull()
    expect(result!.passed).toBe(true)
    expect(result!.summary).toContain('passed')
    expect(result!.whatBuilt).toBeInstanceOf(Array)
    expect(result!.qualityChecks.passed).toBe(3)
    expect(result!.qualityChecks.total).toBe(3)
    expect(result!.filesChanged).toBe(5)
  })

  it('parses failing result.json with failureDetails', async () => {
    const { readVerificationResult } = await import('../pipeline/verification-reader')

    writeFileSync(join(testDir, 'result.json'), JSON.stringify({
      status: 'fail',
      summary: 'Tests failed in auth module.',
      stages: [
        { name: 'build', status: 'pass' },
        { name: 'test', status: 'fail', error: '3 tests failed in auth.test.ts' },
        { name: 'lint', status: 'pass' },
      ],
      filesChanged: 2,
    }))

    const result = readVerificationResult(testDir)
    expect(result).not.toBeNull()
    expect(result!.passed).toBe(false)
    expect(result!.summary).toBeTruthy()
    expect(result!.failureDetails).toBeTruthy()
    expect(result!.qualityChecks.passed).toBe(2)
    expect(result!.qualityChecks.total).toBe(3)
  })

  it('handles malformed JSON gracefully', async () => {
    const { readVerificationResult } = await import('../pipeline/verification-reader')

    writeFileSync(join(testDir, 'result.json'), 'not json')

    const result = readVerificationResult(testDir)
    expect(result).toBeNull()
  })
})

describe('file watcher result.json detection', () => {
  const pipelineId = `test-fw-${nanoid()}`
  const testDir = join(tmpdir(), `pipeline-${pipelineId}`)

  beforeEach(() => {
    emittedEvents.length = 0
    try { rmSync(testDir, { recursive: true }) } catch {}
    mkdirSync(testDir, { recursive: true })
  })

  it('emits operator:verification:report on passing result.json', async () => {
    const { watchPipelineOutput, stopWatching } = await import('../pipeline/file-watcher')

    // Write result.json before starting watcher
    writeFileSync(join(testDir, 'result.json'), JSON.stringify({
      status: 'pass',
      summary: 'All checks passed.',
      stages: [{ name: 'build', status: 'pass' }],
      filesChanged: 1,
    }))

    // Use finalSweep to process files immediately (avoids timer complexity)
    const { finalSweep } = await import('../pipeline/file-watcher')
    finalSweep(pipelineId, testDir)

    const reportEvents = emittedEvents.filter(e => e.type === 'operator:verification:report')
    expect(reportEvents).toHaveLength(1)
    expect(reportEvents[0].runId).toBe(pipelineId)
    expect(reportEvents[0].report).toBeDefined()
    expect(reportEvents[0].report.passed).toBe(true)
  })

  it('emits operator:error with verification-failure on failing result.json', async () => {
    const { finalSweep } = await import('../pipeline/file-watcher')

    writeFileSync(join(testDir, 'result.json'), JSON.stringify({
      status: 'fail',
      summary: 'Tests failed.',
      stages: [
        { name: 'build', status: 'pass' },
        { name: 'test', status: 'fail', error: 'assertion error' },
      ],
      filesChanged: 0,
    }))

    finalSweep(pipelineId, testDir)

    const errorEvents = emittedEvents.filter(
      e => e.type === 'operator:error' && e.errorType === 'verification-failure'
    )
    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0].message).toContain('Quality check')
  })

  it('emits operator:error on error-*.json files', async () => {
    const { finalSweep } = await import('../pipeline/file-watcher')

    writeFileSync(join(testDir, 'error-spawn.json'), JSON.stringify({
      type: 'spawn-failure',
      message: 'Claude CLI not found',
    }))

    finalSweep(pipelineId, testDir)

    const errorEvents = emittedEvents.filter(e => e.type === 'operator:error')
    expect(errorEvents).toHaveLength(1)
    expect(errorEvents[0].errorType).toBe('spawn-failure')
  })
})
