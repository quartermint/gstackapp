/**
 * Pipeline spawner tests.
 * Verifies Claude Code subprocess spawning with correct flags and configuration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock child_process before import
const mockSpawn = vi.fn()
vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
}))

import { spawnPipeline, type PipelineSpawnOptions } from '../pipeline/spawner'

describe('spawnPipeline', () => {
  let testOutputDir: string
  const mockChild = {
    pid: 12345,
    unref: vi.fn(),
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    stdout: { on: vi.fn() },
    on: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    testOutputDir = join(tmpdir(), `pipeline-test-${Date.now()}`)
    mockSpawn.mockReturnValue(mockChild)
  })

  afterEach(() => {
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true })
    }
  })

  it('spawns claude CLI with correct flags', () => {
    const options: PipelineSpawnOptions = {
      pipelineId: 'test-123',
      prompt: 'Build a login page',
      whatGood: 'Working auth flow',
      projectPath: '/tmp/test-project',
      callbackUrl: 'http://localhost:3000/api/pipeline/callback',
    }

    spawnPipeline(options)

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = mockSpawn.mock.calls[0]

    expect(cmd).toBe('claude')
    expect(args).toContain('-p')
    expect(args).toContain('--allowedTools')
    expect(args).toContain('Read,Write,Bash,Glob,Grep')
    expect(args).toContain('--max-turns')
    expect(args).toContain('50')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
  })

  it('spawns with detached:true and calls child.unref()', () => {
    const options: PipelineSpawnOptions = {
      pipelineId: 'test-456',
      prompt: 'Fix the bug',
      whatGood: 'Tests pass',
      projectPath: '/tmp/test-project',
      callbackUrl: 'http://localhost:3000/api/pipeline/callback',
    }

    spawnPipeline(options)

    const [, , opts] = mockSpawn.mock.calls[0]
    expect(opts.detached).toBe(true)
    expect(mockChild.unref).toHaveBeenCalled()
  })

  it('creates output directory and writes request.json', () => {
    const options: PipelineSpawnOptions = {
      pipelineId: 'test-789',
      prompt: 'Add validation',
      whatGood: 'All inputs validated',
      projectPath: '/tmp/test-project',
      callbackUrl: 'http://localhost:3000/api/pipeline/callback',
    }

    const result = spawnPipeline(options)

    // Output dir should exist
    const outputDir = join(tmpdir(), `pipeline-test-789`)
    expect(existsSync(outputDir)).toBe(true)

    // request.json should contain the request data
    const requestJson = JSON.parse(readFileSync(join(outputDir, 'request.json'), 'utf-8'))
    expect(requestJson.pipelineId).toBe('test-789')
    expect(requestJson.prompt).toBe('Add validation')
    expect(requestJson.whatGood).toBe('All inputs validated')
    expect(requestJson.callbackUrl).toBe('http://localhost:3000/api/pipeline/callback')
  })

  it('returns pid and outputDir', () => {
    const options: PipelineSpawnOptions = {
      pipelineId: 'test-ret',
      prompt: 'Test',
      whatGood: 'Test',
      projectPath: '/tmp/test-project',
      callbackUrl: 'http://localhost:3000/api/pipeline/callback',
    }

    const result = spawnPipeline(options)
    expect(result.pid).toBe(12345)
    expect(result.outputDir).toContain('pipeline-test-ret')
  })
})
