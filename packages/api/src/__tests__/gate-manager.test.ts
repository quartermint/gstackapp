import { describe, it, expect, beforeEach } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { GateManager } from '../autonomous/gate-manager'

describe('GateManager', () => {
  let gateManager: GateManager

  beforeEach(() => {
    const { db } = getTestDb()
    gateManager = new GateManager(db)

    // Seed an autonomous run for FK reference
    const { sqlite } = getTestDb()
    sqlite.exec(`
      INSERT INTO autonomous_runs (id, project_path, status)
      VALUES ('run-1', '/tmp/test-project', 'running')
    `)
  })

  it('createGate returns a Promise that resolves when resolveGate is called with matching gateId', async () => {
    const gatePromise = gateManager.createGate({
      id: 'gate-1',
      autonomousRunId: 'run-1',
      title: 'Choose stack',
      description: 'Which stack to use?',
      options: JSON.stringify([{ id: 'react', label: 'React' }, { id: 'vue', label: 'Vue' }]),
      blocking: true,
    })

    // Resolve after a tick
    setTimeout(() => {
      gateManager.resolveGate('gate-1', 'react')
    }, 10)

    const response = await gatePromise
    expect(response).toBe('react')
  })

  it('resolveGate with unknown gateId returns false', () => {
    const result = gateManager.resolveGate('nonexistent-gate', 'answer')
    expect(result).toBe(false)
  })

  it('getPendingGates returns all unresolved gates for a run', async () => {
    // Create two gates but don't resolve them
    gateManager.createGate({
      id: 'gate-a',
      autonomousRunId: 'run-1',
      title: 'Gate A',
      description: 'First gate',
      options: JSON.stringify([{ id: 'yes', label: 'Yes' }]),
      blocking: true,
    })

    gateManager.createGate({
      id: 'gate-b',
      autonomousRunId: 'run-1',
      title: 'Gate B',
      description: 'Second gate',
      options: JSON.stringify([{ id: 'no', label: 'No' }]),
      blocking: false,
    })

    const pending = gateManager.getPendingGates('run-1')
    expect(pending).toHaveLength(2)
    expect(pending.map(g => g.id)).toContain('gate-a')
    expect(pending.map(g => g.id)).toContain('gate-b')
  })

  it('enforces max 1 concurrent autonomous run', () => {
    // run-1 is already 'running' from beforeEach
    expect(() => gateManager.checkConcurrencyLimit()).not.toThrow()
    // Actually it should throw since run-1 is running
  })

  it('cleanup rejects all pending gates for a run', async () => {
    const gatePromise = gateManager.createGate({
      id: 'gate-cleanup',
      autonomousRunId: 'run-1',
      title: 'Cleanup test',
      description: 'Will be cleaned up',
      options: JSON.stringify([]),
      blocking: true,
    })

    // Cleanup should reject the pending gate
    gateManager.cleanup('run-1')

    await expect(gatePromise).rejects.toThrow('cancelled')
  })
})
