import { describe, it, expect } from 'vitest'
import type { AutonomousSSEEvent } from '../autonomous/events'

describe('AutonomousSSEEvent types', () => {
  it('covers phase:start event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:phase:start',
      phase: 1,
      name: 'setup',
    }
    expect(event.type).toBe('autonomous:phase:start')
    expect(event.phase).toBe(1)
  })

  it('covers phase:complete event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:phase:complete',
      phase: 1,
      commits: 5,
    }
    expect(event.type).toBe('autonomous:phase:complete')
    expect(event.commits).toBe(5)
  })

  it('covers phase:failed event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:phase:failed',
      phase: 2,
      error: 'Build failed',
    }
    expect(event.type).toBe('autonomous:phase:failed')
  })

  it('covers commit event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:commit',
      phase: 1,
      hash: 'abc1234',
      message: 'feat(1-01): add auth',
      timestamp: '2026-04-08T00:00:00Z',
    }
    expect(event.type).toBe('autonomous:commit')
    expect(event.hash).toBe('abc1234')
  })

  it('covers agent:spawn event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:agent:spawn',
      phase: 1,
      agentId: 'agent-123',
      role: 'executor',
    }
    expect(event.type).toBe('autonomous:agent:spawn')
  })

  it('covers gate:created event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:gate:created',
      gateId: 'gate-1',
      title: 'Choose stack',
      description: 'Pick a stack',
      options: [{ id: 'react', label: 'React' }],
      blocking: true,
    }
    expect(event.type).toBe('autonomous:gate:created')
    expect(event.options).toHaveLength(1)
  })

  it('covers gate:resolved event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:gate:resolved',
      gateId: 'gate-1',
      response: 'react',
    }
    expect(event.type).toBe('autonomous:gate:resolved')
  })

  it('covers complete event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:complete',
      totalPhases: 5,
      totalCommits: 23,
      elapsedMs: 120000,
    }
    expect(event.type).toBe('autonomous:complete')
  })

  it('covers error event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:error',
      message: 'Something went wrong',
    }
    expect(event.type).toBe('autonomous:error')
  })

  it('covers phases:discovered event', () => {
    const event: AutonomousSSEEvent = {
      type: 'autonomous:phases:discovered',
      phases: [
        { number: 1, name: 'setup', status: 'pending' },
        { number: 2, name: 'core', status: 'pending' },
      ],
    }
    expect(event.type).toBe('autonomous:phases:discovered')
    expect(event.phases).toHaveLength(2)
  })
})
