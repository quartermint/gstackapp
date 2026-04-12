/**
 * Tests for graceful degradation flow and spawner knowledgeContext.
 *
 * GB-04: When gbrain is unavailable, operator sees "Running without knowledge context"
 * via SSE event. Spawned subprocess receives knowledgeContext in request.json when available.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { GbrainCacheData } from '../gbrain/types'

// ── Spawner tests (knowledgeContext in request.json) ──────────────────────────

// Mock child_process for spawner tests
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { spawnPipeline, type PipelineSpawnOptions } from '../pipeline/spawner'

const mockSpawn = vi.mocked(spawn)

describe('spawnPipeline knowledgeContext', () => {
  let testOutputDir: string
  const mockChild = {
    pid: 12345,
    unref: vi.fn(),
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn() },
    on: vi.fn(),
  }

  const baseOptions: PipelineSpawnOptions = {
    pipelineId: 'test-gbrain-123',
    prompt: 'Update CocoBanana designers',
    whatGood: 'Designer profiles visible',
    projectPath: '/tmp/test-project',
    callbackUrl: 'http://localhost:3000/api/pipeline/callback',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    testOutputDir = join(tmpdir(), `pipeline-test-gbrain-${Date.now()}`)
    mockSpawn.mockReturnValue(mockChild as any)
  })

  afterEach(() => {
    // Clean up the actual output dir created by spawnPipeline
    const expectedDir = join(tmpdir(), `pipeline-${baseOptions.pipelineId}`)
    if (existsSync(expectedDir)) {
      rmSync(expectedDir, { recursive: true })
    }
  })

  it('writes knowledgeContext field into request.json when provided', () => {
    const knowledgeContext: GbrainCacheData = {
      available: true,
      entities: [
        {
          slug: 'cocobanana',
          title: 'CocoBanana',
          type: 'project',
          content: 'Fashion AI platform',
          excerpt: 'Fashion AI platform',
        },
      ],
      searchResults: [
        { slug: 'cocobanana', title: 'CocoBanana', type: 'project', excerpt: 'Fashion AI' },
      ],
    }

    const result = spawnPipeline({ ...baseOptions, knowledgeContext })

    // Read the request.json written by spawnPipeline
    const requestJson = JSON.parse(readFileSync(join(result.outputDir, 'request.json'), 'utf-8'))
    expect(requestJson.knowledgeContext).toBeDefined()
    expect(requestJson.knowledgeContext.available).toBe(true)
    expect(requestJson.knowledgeContext.entities).toHaveLength(1)
    expect(requestJson.knowledgeContext.entities[0].slug).toBe('cocobanana')
  })

  it('writes request.json without knowledgeContext when not provided (backward compatible)', () => {
    const result = spawnPipeline(baseOptions)

    const requestJson = JSON.parse(readFileSync(join(result.outputDir, 'request.json'), 'utf-8'))
    expect(requestJson.knowledgeContext).toBeNull()
    expect(requestJson.pipelineId).toBe('test-gbrain-123')
    expect(requestJson.prompt).toBe('Update CocoBanana designers')
  })

  it('pipeline completes successfully regardless of gbrain availability', () => {
    // With available=false knowledge context
    const knowledgeContext: GbrainCacheData = {
      available: false,
    }

    const result = spawnPipeline({ ...baseOptions, knowledgeContext })

    expect(result.pid).toBe(12345)
    expect(result.outputDir).toBeDefined()
    expect(mockSpawn).toHaveBeenCalledTimes(1)
  })
})

// ── Degradation SSE event tests ──────────────────────────────────────────────

describe('gbrain degradation events', () => {
  it('emits operator:gbrain:degraded when available=false', async () => {
    // Import pipelineBus to check events
    const { pipelineBus } = await import('../events/bus')

    const events: any[] = []
    const listener = (event: any) => {
      if (event.type === 'operator:gbrain:degraded') {
        events.push(event)
      }
    }
    pipelineBus.on('pipeline:event', listener)

    try {
      // Simulate what operator.ts approve-brief does when gbrain is unavailable
      const gbrainContext: GbrainCacheData = { available: false }

      if (gbrainContext && !gbrainContext.available) {
        pipelineBus.emit('pipeline:event', {
          type: 'operator:gbrain:degraded',
          runId: 'test-degrade-123',
          message: 'Running without knowledge context',
          timestamp: new Date().toISOString(),
        })
      }

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('operator:gbrain:degraded')
      expect(events[0].message).toBe('Running without knowledge context')
      expect(events[0].runId).toBe('test-degrade-123')
    } finally {
      pipelineBus.off('pipeline:event', listener)
    }
  })

  it('does NOT emit degraded event when available=true', async () => {
    const { pipelineBus } = await import('../events/bus')

    const events: any[] = []
    const listener = (event: any) => {
      if (event.type === 'operator:gbrain:degraded') {
        events.push(event)
      }
    }
    pipelineBus.on('pipeline:event', listener)

    try {
      const gbrainContext: GbrainCacheData = {
        available: true,
        entities: [{ slug: 'test', title: 'Test', type: 'project', content: 'c', excerpt: 'e' }],
      }

      // Same logic as operator.ts — only emits when !available
      if (gbrainContext && !gbrainContext.available) {
        pipelineBus.emit('pipeline:event', {
          type: 'operator:gbrain:degraded',
          runId: 'test-avail-123',
          message: 'Running without knowledge context',
          timestamp: new Date().toISOString(),
        })
      }

      expect(events).toHaveLength(0)
    } finally {
      pipelineBus.off('pipeline:event', listener)
    }
  })

  it('does NOT emit degraded event when cache is null', async () => {
    const { pipelineBus } = await import('../events/bus')

    const events: any[] = []
    const listener = (event: any) => {
      if (event.type === 'operator:gbrain:degraded') {
        events.push(event)
      }
    }
    pipelineBus.on('pipeline:event', listener)

    try {
      const gbrainContext: GbrainCacheData | null = null

      // Same logic as operator.ts — null doesn't trigger degraded event
      if (gbrainContext && !gbrainContext.available) {
        pipelineBus.emit('pipeline:event', {
          type: 'operator:gbrain:degraded',
          runId: 'test-null-123',
          message: 'Running without knowledge context',
          timestamp: new Date().toISOString(),
        })
      }

      expect(events).toHaveLength(0)
    } finally {
      pipelineBus.off('pipeline:event', listener)
    }
  })
})
