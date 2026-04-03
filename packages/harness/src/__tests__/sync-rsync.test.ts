import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process before importing
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => ''),
}))

import { buildRsyncArgs, executeRsync } from '../sync/rsync'
import { EXCLUDE_RULES, MEMORY_INCLUDES, PLANNING_INCLUDES } from '../sync/excludes'
import { execFileSync } from 'node:child_process'

describe('buildRsyncArgs', () => {
  it('produces correct array for memory sync (includes *.md only)', () => {
    const args = buildRsyncArgs({
      source: '/home/user/.claude/projects/',
      destination: 'ryans-mac-mini:/home/user/.claude/projects/',
      includes: MEMORY_INCLUDES,
      excludeFile: '/home/user/.gstackapp/sync-exclude.txt',
      dryRun: false,
    })

    expect(args).toContain('--archive')
    expect(args).toContain('--update')
    expect(args).toContain('--compress')
    expect(args).toContain('--itemize-changes')
    expect(args).toContain('*.md')
    expect(args).toContain('*/')
    expect(args).not.toContain('*.json')
  })

  it('produces correct array for planning sync (includes *.md and *.json)', () => {
    const args = buildRsyncArgs({
      source: '/project/.planning/',
      destination: 'ryans-mac-mini:/project/.planning/',
      includes: PLANNING_INCLUDES,
      excludeFile: '/home/user/.gstackapp/sync-exclude.txt',
      dryRun: false,
    })

    expect(args).toContain('*.md')
    expect(args).toContain('*.json')
    expect(args).toContain('*/')
  })

  it('includes --dry-run when dryRun is true', () => {
    const args = buildRsyncArgs({
      source: '/src/',
      destination: 'host:/dst/',
      includes: MEMORY_INCLUDES,
      excludeFile: '/tmp/excl.txt',
      dryRun: true,
    })

    expect(args).toContain('--dry-run')
  })

  it('does not include --dry-run when dryRun is false', () => {
    const args = buildRsyncArgs({
      source: '/src/',
      destination: 'host:/dst/',
      includes: MEMORY_INCLUDES,
      excludeFile: '/tmp/excl.txt',
      dryRun: false,
    })

    expect(args).not.toContain('--dry-run')
  })

  it('places includes before excludes in the array', () => {
    const args = buildRsyncArgs({
      source: '/src/',
      destination: 'host:/dst/',
      includes: MEMORY_INCLUDES,
      excludeFile: '/tmp/excl.txt',
      dryRun: false,
    })

    const firstIncludeIdx = args.indexOf('--include')
    const excludeFromIdx = args.indexOf('--exclude-from')
    const excludeIdx = args.lastIndexOf('--exclude')

    expect(firstIncludeIdx).toBeLessThan(excludeFromIdx)
    expect(excludeFromIdx).toBeLessThan(excludeIdx)
  })

  it('places source and destination as last two elements', () => {
    const args = buildRsyncArgs({
      source: '/my/source/',
      destination: 'host:/my/dest/',
      includes: MEMORY_INCLUDES,
      excludeFile: '/tmp/excl.txt',
      dryRun: false,
    })

    expect(args[args.length - 2]).toBe('/my/source/')
    expect(args[args.length - 1]).toBe('host:/my/dest/')
  })
})

describe('executeRsync', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset()
  })

  it('calls rsync with correct args', () => {
    vi.mocked(execFileSync).mockReturnValue('output')

    const args = ['--archive', '/src/', 'host:/dst/']
    const result = executeRsync(args)

    expect(execFileSync).toHaveBeenCalledWith('rsync', args, {
      encoding: 'utf-8',
      timeout: 120_000,
    })
    expect(result).toBe('output')
  })
})

describe('EXCLUDE_RULES', () => {
  it('contains all D-10 patterns', () => {
    expect(EXCLUDE_RULES).toContain('*.db')
    expect(EXCLUDE_RULES).toContain('*.db-wal')
    expect(EXCLUDE_RULES).toContain('*.db-shm')
    expect(EXCLUDE_RULES).toContain('*.sqlite')
    expect(EXCLUDE_RULES).toContain('*.sqlite-wal')
    expect(EXCLUDE_RULES).toContain('*.sqlite-shm')
    expect(EXCLUDE_RULES).toContain('node_modules/')
    expect(EXCLUDE_RULES).toContain('.git/')
    expect(EXCLUDE_RULES).toContain('*.png')
    expect(EXCLUDE_RULES).toContain('*.jpg')
    expect(EXCLUDE_RULES).toContain('*.jpeg')
    expect(EXCLUDE_RULES).toContain('*.gif')
    expect(EXCLUDE_RULES).toContain('*.pdf')
    expect(EXCLUDE_RULES).toContain('*.zip')
    expect(EXCLUDE_RULES).toContain('*.tar.gz')
  })
})

describe('MEMORY_INCLUDES', () => {
  it('is [*/, *.md]', () => {
    expect(MEMORY_INCLUDES).toEqual(['*/', '*.md'])
  })
})

describe('PLANNING_INCLUDES', () => {
  it('contains */, *.md, *.json', () => {
    expect(PLANNING_INCLUDES).toContain('*/')
    expect(PLANNING_INCLUDES).toContain('*.md')
    expect(PLANNING_INCLUDES).toContain('*.json')
  })
})
