import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the pure functions directly — no DB/server needed
// The route module will be imported after mocking filesystem deps

// Mock node:fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  realpathSync: vi.fn(),
  statSync: vi.fn(),
}))

// Mock node:os
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}))

// Mock simple-git
vi.mock('simple-git', () => ({
  default: vi.fn(),
}))

import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'

// ── parseStateMd tests ────────────────────────────────────────────────────────

describe('parseStateMd', () => {
  let parseStateMd: typeof import('../routes/projects').parseStateMd

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../routes/projects')
    parseStateMd = mod.parseStateMd
  })

  it('extracts milestone, status, last_activity from valid frontmatter', () => {
    const content = `---
milestone: v2.0
milestone_name: Command Center
status: executing
stopped_at: Phase 12 executed
last_activity: 2026-04-08
progress:
  total_phases: 4
  completed_phases: 2
  percent: 50
---

# Project State
Some body text
`
    const result = parseStateMd(content)
    expect(result).not.toBeNull()
    expect(result!.milestone).toBe('v2.0')
    expect(result!.milestone_name).toBe('Command Center')
    expect(result!.status).toBe('executing')
    expect(result!.last_activity).toBe('2026-04-08')
    expect(result!.progress).toEqual({
      total_phases: 4,
      completed_phases: 2,
      percent: 50,
    })
  })

  it('returns null for empty input', () => {
    const result = parseStateMd('')
    expect(result).toBeNull()
  })

  it('returns null for missing frontmatter delimiters', () => {
    const result = parseStateMd('No frontmatter here\nJust text')
    expect(result).toBeNull()
  })

  it('handles quoted date strings by stripping quotes', () => {
    const content = `---
stopped_at: "2026-04-08T14:55:22.425Z"
last_activity: 2026-04-08
status: executing
---
`
    const result = parseStateMd(content)
    expect(result).not.toBeNull()
    expect(result!.last_activity).toBe('2026-04-08')
    // Quoted value should have quotes stripped
    expect(result!.stopped_at).toBe('2026-04-08T14:55:22.425Z')
  })

  it('handles frontmatter with optional progress fields', () => {
    const content = `---
milestone: v1.0
status: complete
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 10
  completed_plans: 10
  percent: 100
---
`
    const result = parseStateMd(content)
    expect(result).not.toBeNull()
    expect(result!.progress).toEqual({
      total_phases: 3,
      completed_phases: 3,
      total_plans: 10,
      completed_plans: 10,
      percent: 100,
    })
  })
})

// ── computeStatus tests ───────────────────────────────────────────────────────

describe('computeStatus', () => {
  let computeStatus: typeof import('../routes/projects').computeStatus

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../routes/projects')
    computeStatus = mod.computeStatus
  })

  it('returns "ideating" when hasDesignDocs=true AND hasPlanning=false', () => {
    const result = computeStatus({
      hasDesignDocs: true,
      hasPlanning: false,
      lastActivity: null,
      uncommitted: 0,
    })
    expect(result).toBe('ideating')
  })

  it('returns "active" when lastActivity is within 3 days', () => {
    // Use a date 1 day ago
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const result = computeStatus({
      hasDesignDocs: false,
      hasPlanning: true,
      lastActivity: yesterday.toISOString().split('T')[0],
      uncommitted: 0,
    })
    expect(result).toBe('active')
  })

  it('returns "stale" when lastActivity > 3 days AND uncommitted > 0', () => {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 10)
    const result = computeStatus({
      hasDesignDocs: false,
      hasPlanning: true,
      lastActivity: oldDate.toISOString().split('T')[0],
      uncommitted: 5,
    })
    expect(result).toBe('stale')
  })

  it('returns "active" (default) when lastActivity > 3 days but uncommitted = 0', () => {
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 10)
    const result = computeStatus({
      hasDesignDocs: false,
      hasPlanning: true,
      lastActivity: oldDate.toISOString().split('T')[0],
      uncommitted: 0,
    })
    expect(result).toBe('active')
  })

  it('returns "active" when lastActivity is null and no uncommitted changes', () => {
    const result = computeStatus({
      hasDesignDocs: false,
      hasPlanning: true,
      lastActivity: null,
      uncommitted: 0,
    })
    expect(result).toBe('active')
  })
})

// ── Path safety tests ─────────────────────────────────────────────────────────

describe('isPathSafe', () => {
  let isPathSafe: typeof import('../routes/projects').isPathSafe

  beforeEach(async () => {
    vi.resetModules()
    // Make realpathSync return the input by default
    vi.mocked(realpathSync).mockImplementation((p) => p as string)
    vi.mocked(homedir).mockReturnValue('/mock/home')
    const mod = await import('../routes/projects')
    isPathSafe = mod.isPathSafe
  })

  it('accepts paths under home directory', () => {
    expect(isPathSafe('/mock/home/projects/myapp')).toBe(true)
  })

  it('rejects paths outside home directory', () => {
    expect(isPathSafe('/etc/passwd')).toBe(false)
  })

  it('rejects paths with .. traversal resolving outside home', () => {
    vi.mocked(realpathSync).mockReturnValue('/etc/passwd')
    expect(isPathSafe('/mock/home/../../etc/passwd')).toBe(false)
  })

  it('rejects symlink escapes', () => {
    vi.mocked(realpathSync).mockReturnValue('/var/secret')
    expect(isPathSafe('/mock/home/projects/evil-link')).toBe(false)
  })
})

// ── GET /api/projects integration test ────────────────────────────────────────

describe('GET / (projects endpoint)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(homedir).mockReturnValue('/mock/home')
    vi.mocked(realpathSync).mockImplementation((p) => p as string)
  })

  it('returns JSON array of projects', async () => {
    // Mock CLAUDE.md exists with one project
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/CLAUDE.md') return true
      if (ps === '/mock/home/.gstackapp/projects.json') return false
      if (ps === '/mock/home/myapp/.planning') return true
      if (ps === '/mock/home/myapp/.planning/STATE.md') return true
      if (ps === '/mock/home/myapp') return true
      return false
    })

    vi.mocked(readFileSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/CLAUDE.md') {
        return `# CLAUDE.md
## Active Development
- **myapp** - Test project
`
      }
      if (ps === '/mock/home/myapp/.planning/STATE.md') {
        return `---
milestone: v1.0
status: executing
last_activity: ${new Date().toISOString().split('T')[0]}
progress:
  total_phases: 2
  completed_phases: 1
  percent: 50
---
`
      }
      return ''
    })

    vi.mocked(readdirSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home') return ['myapp'] as any
      return [] as any
    })

    vi.mocked(statSync).mockImplementation(() => ({
      isDirectory: () => true,
    }) as any)

    // Mock simple-git
    const simpleGitMock = await import('simple-git')
    vi.mocked(simpleGitMock.default).mockReturnValue({
      status: vi.fn().mockResolvedValue({
        current: 'main',
        files: [],
        ahead: 0,
        behind: 0,
      }),
      log: vi.fn().mockResolvedValue({
        latest: {
          date: '2026-04-08T12:00:00Z',
          message: 'feat: initial commit',
        },
      }),
    } as any)

    const { default: projectsApp } = await import('../routes/projects')
    const res = await projectsApp.request('/')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)

    const project = body[0]
    expect(project).toHaveProperty('name')
    expect(project).toHaveProperty('path')
    expect(project).toHaveProperty('status')
    expect(project).toHaveProperty('gitStatus')
    expect(project).toHaveProperty('gsdState')
    expect(project).toHaveProperty('hasDesignDocs')
  })
})
