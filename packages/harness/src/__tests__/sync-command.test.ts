import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => ''),
}))

// Mock sync modules
vi.mock('../sync/lock', () => ({
  withLock: vi.fn((_paths: string[], fn: () => void) => fn()),
  acquireLock: vi.fn(),
  releaseLock: vi.fn(),
}))

vi.mock('../sync/paths', () => ({
  resolveSyncPaths: vi.fn(() => ({
    target: 'ryans-mac-mini',
    memoryPaths: ['/home/user/.claude/projects/proj1/memory/'],
    planningPaths: ['/home/user/project/.planning/'],
  })),
}))

vi.mock('../sync/excludes', () => ({
  writeExcludeFile: vi.fn(() => '/tmp/test-exclude.txt'),
  MEMORY_INCLUDES: ['*/', '*.md'],
  PLANNING_INCLUDES: ['*/', '*.md', '*.json'],
  EXCLUDE_RULES: ['*.db'],
}))

vi.mock('../sync/rsync', () => ({
  buildRsyncArgs: vi.fn((...args: unknown[]) => ['rsync-arg-mock', ...(args as string[])]),
  executeRsync: vi.fn(() => ''),
}))

import { execFileSync } from 'node:child_process'
import { syncCommand } from '../sync/sync-command'
import { withLock } from '../sync/lock'
import { resolveSyncPaths } from '../sync/paths'
import { buildRsyncArgs, executeRsync } from '../sync/rsync'

describe('syncCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // SSH pre-flight succeeds by default
    vi.mocked(execFileSync).mockReturnValue('')
  })

  describe('pre-flight checks', () => {
    it('runs SSH connectivity check before any rsync call', async () => {
      await syncCommand({ direction: 'push', dryRun: false, target: 'ryans-mac-mini' })

      // SSH check should be called
      const sshCalls = vi.mocked(execFileSync).mock.calls.filter(
        (call) => call[0] === 'ssh'
      )
      expect(sshCalls.length).toBeGreaterThanOrEqual(1)

      // First ssh call should be connectivity check
      const connectivityCheck = sshCalls[0]
      expect(connectivityCheck[1]).toContain('-o')
      expect(connectivityCheck[1]).toContain('ConnectTimeout=5')
      expect(connectivityCheck[1]).toContain('ryans-mac-mini')
      expect(connectivityCheck[1]).toContain('true')
    })

    it('creates remote directories via ssh mkdir', async () => {
      await syncCommand({ direction: 'push', dryRun: false, target: 'ryans-mac-mini' })

      const sshCalls = vi.mocked(execFileSync).mock.calls.filter(
        (call) => call[0] === 'ssh'
      )
      // Second ssh call should be mkdir
      const mkdirCall = sshCalls.find(
        (call) => (call[1] as string[]).includes('mkdir')
      )
      expect(mkdirCall).toBeDefined()
      expect(mkdirCall![1]).toContain('-p')
    })

    it('exits with error when SSH target is unreachable', async () => {
      vi.mocked(execFileSync).mockImplementation((cmd) => {
        if (cmd === 'ssh') throw new Error('Connection refused')
        return ''
      })

      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit')
      })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        syncCommand({ direction: 'push', dryRun: false, target: 'ryans-mac-mini' })
      ).rejects.toThrow('process.exit')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot reach')
      )
      expect(exitSpy).toHaveBeenCalledWith(1)

      exitSpy.mockRestore()
      consoleSpy.mockRestore()
    })
  })

  describe('push direction', () => {
    it('calls executeRsync with local source and remote destination', async () => {
      await syncCommand({ direction: 'push', dryRun: false, target: 'ryans-mac-mini' })

      expect(executeRsync).toHaveBeenCalled()
      expect(buildRsyncArgs).toHaveBeenCalled()

      // Check that buildRsyncArgs was called with local source, remote dest
      const calls = vi.mocked(buildRsyncArgs).mock.calls
      const memoryCall = calls.find(
        (c) => (c[0] as any).source.includes('memory')
      )
      expect(memoryCall).toBeDefined()
      expect((memoryCall![0] as any).source).toBe('/home/user/.claude/projects/proj1/memory/')
      expect((memoryCall![0] as any).destination).toContain('ryans-mac-mini:')
    })
  })

  describe('pull direction', () => {
    it('calls executeRsync with remote source and local destination', async () => {
      await syncCommand({ direction: 'pull', dryRun: false, target: 'ryans-mac-mini' })

      expect(executeRsync).toHaveBeenCalled()
      expect(buildRsyncArgs).toHaveBeenCalled()

      const calls = vi.mocked(buildRsyncArgs).mock.calls
      const memoryCall = calls.find(
        (c) => (c[0] as any).source.includes('ryans-mac-mini')
      )
      expect(memoryCall).toBeDefined()
      expect((memoryCall![0] as any).source).toContain('ryans-mac-mini:')
      expect((memoryCall![0] as any).destination).toBe('/home/user/.claude/projects/proj1/memory/')
    })
  })

  describe('bidirectional (default)', () => {
    it('calls both push and pull when no direction specified', async () => {
      await syncCommand({ dryRun: false, target: 'ryans-mac-mini' })

      const calls = vi.mocked(buildRsyncArgs).mock.calls
      // Should have calls for push (local->remote) AND pull (remote->local)
      const pushCalls = calls.filter(
        (c) => !(c[0] as any).source.includes('ryans-mac-mini')
      )
      const pullCalls = calls.filter(
        (c) => (c[0] as any).source.includes('ryans-mac-mini')
      )
      expect(pushCalls.length).toBeGreaterThan(0)
      expect(pullCalls.length).toBeGreaterThan(0)
    })
  })

  describe('lock protection', () => {
    it('wraps sync operations in withLock', async () => {
      await syncCommand({ direction: 'push', dryRun: false, target: 'ryans-mac-mini' })

      expect(withLock).toHaveBeenCalled()
      const lockCall = vi.mocked(withLock).mock.calls[0]
      // First argument is paths array
      expect(Array.isArray(lockCall[0])).toBe(true)
      expect(lockCall[0].length).toBeGreaterThan(0)
    })
  })

  describe('dry-run flag', () => {
    it('passes dryRun=true through to buildRsyncArgs', async () => {
      await syncCommand({ direction: 'push', dryRun: true, target: 'ryans-mac-mini' })

      const calls = vi.mocked(buildRsyncArgs).mock.calls
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) {
        expect((call[0] as any).dryRun).toBe(true)
      }
    })
  })
})
