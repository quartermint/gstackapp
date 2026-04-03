import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// We need to mock the LOCK_PATH to use a temp directory
const TEST_DIR = join(tmpdir(), `sync-lock-test-${process.pid}`)
const TEST_LOCK_PATH = join(TEST_DIR, 'sync.lock')

// Mock the lock module's internal LOCK_PATH
vi.mock('../sync/lock', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../sync/lock')>()
  return {
    ...mod,
    // We'll test via the exported functions but need to override LOCK_PATH
    // The module uses LOCK_PATH internally, so we'll set HOME to redirect it
  }
})

describe('lock', () => {
  let originalHome: string | undefined

  beforeEach(() => {
    originalHome = process.env.HOME
    // Redirect HOME so LOCK_PATH resolves to our test dir
    process.env.HOME = TEST_DIR
    mkdirSync(join(TEST_DIR, '.gstackapp'), { recursive: true })
  })

  afterEach(() => {
    process.env.HOME = originalHome
    try {
      rmSync(TEST_DIR, { recursive: true, force: true })
    } catch {
      // ignore
    }
    vi.resetModules()
  })

  it('acquireLock creates lock file with correct JSON structure', async () => {
    const { acquireLock } = await import('../sync/lock')
    acquireLock(['/path/a', '/path/b'])

    const lockPath = join(TEST_DIR, '.gstackapp', 'sync.lock')
    expect(existsSync(lockPath)).toBe(true)

    const data = JSON.parse(readFileSync(lockPath, 'utf-8'))
    expect(data).toHaveProperty('pid', process.pid)
    expect(data).toHaveProperty('hostname')
    expect(data).toHaveProperty('startedAt')
    expect(data).toHaveProperty('paths', ['/path/a', '/path/b'])
  })

  it('acquireLock throws when PID is alive', async () => {
    const { acquireLock, isPidAlive } = await import('../sync/lock')

    // Write a lock file with our own PID (which is alive)
    const lockPath = join(TEST_DIR, '.gstackapp', 'sync.lock')
    writeFileSync(lockPath, JSON.stringify({
      pid: process.pid,
      hostname: 'test-host',
      startedAt: new Date().toISOString(),
      paths: ['/existing'],
    }))

    expect(() => acquireLock(['/new'])).toThrow()
  })

  it('acquireLock removes stale lock when PID is dead', async () => {
    const { acquireLock } = await import('../sync/lock')

    // Use a PID that is almost certainly dead
    const deadPid = 999999
    const lockPath = join(TEST_DIR, '.gstackapp', 'sync.lock')
    writeFileSync(lockPath, JSON.stringify({
      pid: deadPid,
      hostname: 'old-host',
      startedAt: '2020-01-01T00:00:00.000Z',
      paths: ['/old'],
    }))

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Should not throw -- stale lock gets removed
    acquireLock(['/new'])

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()

    // New lock should exist with our PID
    const data = JSON.parse(readFileSync(lockPath, 'utf-8'))
    expect(data.pid).toBe(process.pid)
  })

  it('releaseLock removes lock file', async () => {
    const { acquireLock, releaseLock } = await import('../sync/lock')

    acquireLock(['/path'])
    const lockPath = join(TEST_DIR, '.gstackapp', 'sync.lock')
    expect(existsSync(lockPath)).toBe(true)

    releaseLock()
    expect(existsSync(lockPath)).toBe(false)
  })

  it('releaseLock no-ops if file does not exist', async () => {
    const { releaseLock } = await import('../sync/lock')

    // Should not throw
    expect(() => releaseLock()).not.toThrow()
  })

  it('withLock releases lock even when fn throws', async () => {
    const { withLock } = await import('../sync/lock')
    const lockPath = join(TEST_DIR, '.gstackapp', 'sync.lock')

    expect(() => {
      withLock(['/path'], () => {
        expect(existsSync(lockPath)).toBe(true)
        throw new Error('boom')
      })
    }).toThrow('boom')

    expect(existsSync(lockPath)).toBe(false)
  })
})
