/**
 * Integration test for autonomous SSE event format.
 *
 * Verifies that the autonomous route sends UNNAMED SSE events (no `event:` field),
 * matching the pattern used by ideation routes. The frontend's EventSource.onmessage
 * only receives unnamed events — named events would be silently dropped.
 */

import { describe, it, expect, vi } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { nanoid } from 'nanoid'
import type { AutonomousSSEEvent } from '../autonomous/events'

// Mock the executor to yield controlled events without spawning real processes
const mockEvents: AutonomousSSEEvent[] = [
  { type: 'autonomous:phases:discovered', phases: [{ number: 1, name: 'setup', status: 'pending' }] },
  { type: 'autonomous:phase:start', phase: 1, name: 'setup' },
  { type: 'autonomous:commit', phase: 1, hash: 'abc1234', message: 'feat: test', timestamp: '2026-04-11T00:00:00Z' },
  { type: 'autonomous:phase:complete', phase: 1, commits: 1 },
  { type: 'autonomous:complete', totalPhases: 1, totalCommits: 1, elapsedMs: 5000 },
]

vi.mock('../autonomous/executor', () => ({
  runAutonomousExecution: async function* () {
    for (const event of mockEvents) {
      yield event
    }
  },
}))

vi.mock('../autonomous/gate-manager', () => ({
  GateManager: vi.fn().mockImplementation(() => ({
    checkConcurrencyLimit: vi.fn(),
    getPendingGates: vi.fn().mockReturnValue([]),
    resolveGate: vi.fn(),
    cleanup: vi.fn(),
  })),
}))

// Import app AFTER mocks are set up
import app from '../index'

async function seedAutonomousRun(): Promise<string> {
  const { pg } = getTestDb()
  const id = nanoid()
  await pg.query(
    `INSERT INTO autonomous_runs (id, project_path, status, created_at) VALUES ($1, $2, $3, NOW())`,
    [id, '/tmp/test-project', 'pending'],
  )
  return id
}

describe('Autonomous SSE event format', () => {
  it('sends unnamed events (no event: field in SSE output)', async () => {
    const runId = await seedAutonomousRun()
    const res = await app.request(`/api/autonomous/stream/${runId}`)

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const text = await res.text()
    const lines = text.split('\n')

    // No line should start with "event:" — all events must be unnamed
    const eventLines = lines.filter((line) => line.startsWith('event:'))
    expect(eventLines).toEqual([])
  })

  it('includes data: lines with JSON containing type field', async () => {
    const runId = await seedAutonomousRun()
    const res = await app.request(`/api/autonomous/stream/${runId}`)

    const text = await res.text()
    const dataLines = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''))

    // Should have data lines for each event
    expect(dataLines.length).toBeGreaterThanOrEqual(mockEvents.length)

    // Each data line should parse as JSON with a type field
    for (const dataStr of dataLines) {
      const parsed = JSON.parse(dataStr)
      expect(parsed).toHaveProperty('type')
      expect(parsed.type).toMatch(/^autonomous:/)
    }
  })

  it('includes id: fields for each event', async () => {
    const runId = await seedAutonomousRun()
    const res = await app.request(`/api/autonomous/stream/${runId}`)

    const text = await res.text()
    const idLines = text.split('\n').filter((line) => line.startsWith('id:'))

    // Should have an id for each event
    expect(idLines.length).toBeGreaterThanOrEqual(mockEvents.length)
  })

  it('returns SSE error as unnamed event for unknown run', async () => {
    const res = await app.request('/api/autonomous/stream/nonexistent-run-id')

    expect(res.status).toBe(200) // SSE streams always return 200
    const text = await res.text()

    // No named event fields
    const eventLines = text.split('\n').filter((line) => line.startsWith('event:'))
    expect(eventLines).toEqual([])

    // Should have a data line with error info
    const dataLines = text.split('\n').filter((line) => line.startsWith('data:'))
    expect(dataLines.length).toBeGreaterThanOrEqual(1)

    const errorData = JSON.parse(dataLines[0].replace(/^data:\s*/, ''))
    expect(errorData.type).toBe('autonomous:error')
    expect(errorData.error).toBe('Run not found')
  })
})
