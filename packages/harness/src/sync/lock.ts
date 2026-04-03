import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, hostname } from 'node:os'

export interface LockData {
  pid: number
  hostname: string
  startedAt: string
  paths: string[]
}

const LOCK_PATH = join(homedir(), '.gstackapp', 'sync.lock')

/**
 * Check if a process with the given PID is alive.
 * Signal 0 checks existence without sending a real signal.
 */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Acquire the sync lock. Throws if another sync is active (live PID).
 * Removes stale locks (dead PID) with a console.warn.
 */
export function acquireLock(paths: string[]): void {
  try {
    const existing = JSON.parse(readFileSync(LOCK_PATH, 'utf-8')) as LockData
    if (isPidAlive(existing.pid)) {
      throw new Error(
        `Sync already in progress (PID ${existing.pid} on ${existing.hostname}, started ${existing.startedAt})`
      )
    }
    // Stale lock -- PID is dead
    console.warn(`Removing stale lock (PID ${existing.pid} is dead)`)
    unlinkSync(LOCK_PATH)
  } catch (err) {
    // Re-throw if it's our "already in progress" error
    if (err instanceof Error && err.message.includes('Sync already in progress')) {
      throw err
    }
    // Otherwise: no lock file or unreadable -- proceed
  }

  mkdirSync(dirname(LOCK_PATH), { recursive: true })
  const lock: LockData = {
    pid: process.pid,
    hostname: hostname(),
    startedAt: new Date().toISOString(),
    paths,
  }
  writeFileSync(LOCK_PATH, JSON.stringify(lock, null, 2))
}

/**
 * Release the sync lock. No-ops if already gone.
 */
export function releaseLock(): void {
  try {
    unlinkSync(LOCK_PATH)
  } catch {
    // already gone
  }
}

/**
 * Execute a function while holding the sync lock.
 * Ensures lock is released even if fn throws.
 * Installs SIGINT/SIGTERM handlers for cleanup.
 */
export function withLock<T>(paths: string[], fn: () => T): T {
  acquireLock(paths)

  const cleanup = () => {
    releaseLock()
  }

  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  try {
    return fn()
  } finally {
    cleanup()
    process.removeListener('SIGINT', cleanup)
    process.removeListener('SIGTERM', cleanup)
  }
}
