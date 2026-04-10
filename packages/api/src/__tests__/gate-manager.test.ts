import { describe, it, expect, beforeEach } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { GateManager } from '../autonomous/gate-manager'

describe('GateManager', () => {
  let gateManager: GateManager

  beforeEach(async () => {
    const { db, pg } = getTestDb()
    gateManager = new GateManager(db)

    // Seed an autonomous run for FK reference
    await pg.exec(`
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

  it('resolveGate with unknown gateId returns false', async () => {
    const result = await gateManager.resolveGate('nonexistent-gate', 'answer')
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

    const pending = await gateManager.getPendingGates('run-1')
    expect(pending).toHaveLength(2)
    expect(pending.map(g => g.id)).toContain('gate-a')
    expect(pending.map(g => g.id)).toContain('gate-b')
  })

  it('enforces max 1 concurrent autonomous run', async () => {
    // run-1 is already 'running' from beforeEach — should throw
    await expect(gateManager.checkConcurrencyLimit()).rejects.toThrow('already active')
  })

  it('allows launch when no runs are active', async () => {
    // Mark existing run as complete
    const { pg } = getTestDb()
    await pg.exec(`UPDATE autonomous_runs SET status = 'complete' WHERE id = 'run-1'`)
    await expect(gateManager.checkConcurrencyLimit()).resolves.not.toThrow()
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

    // Wait a tick for the async DB insert to complete and register the pending gate
    await new Promise((r) => setTimeout(r, 50))

    // Cleanup should reject the pending gate
    gateManager.cleanup('run-1')

    await expect(gatePromise).rejects.toThrow('cancelled')
  })
})
