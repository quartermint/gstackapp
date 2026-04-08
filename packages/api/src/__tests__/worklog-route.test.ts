import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock node:fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}))

// Mock node:os
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}))

import { readFileSync, existsSync } from 'node:fs'

// ── parseWorklogCarryover tests ──────────────────────────────────────────────

describe('parseWorklogCarryover', () => {
  let parseWorklogCarryover: typeof import('../routes/worklog').parseWorklogCarryover

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../routes/worklog')
    parseWorklogCarryover = mod.parseWorklogCarryover
  })

  it('extracts carryover items from worklog content', () => {
    const content = `# Worklog

**Session 2026-04-05 -- gstackapp: pipeline work**

### Accomplishments
- Built pipeline engine
- Added webhook handlers

### Carryover
- Fix flaky test
- Update docs

**Session 2026-04-04 -- taxnav: tax categories**

### Carryover
- Add validation
`
    const items = parseWorklogCarryover(content)
    expect(items.length).toBe(3)

    expect(items[0].projectName).toBe('gstackapp')
    expect(items[0].text).toBe('Fix flaky test')
    expect(items[0].loggedDate).toBe('2026-04-05')

    expect(items[1].projectName).toBe('gstackapp')
    expect(items[1].text).toBe('Update docs')
    expect(items[1].loggedDate).toBe('2026-04-05')

    expect(items[2].projectName).toBe('taxnav')
    expect(items[2].text).toBe('Add validation')
    expect(items[2].loggedDate).toBe('2026-04-04')
  })

  it('returns empty array for content with no carryover sections', () => {
    const content = `# Worklog

**Session 2026-04-05 -- gstackapp: pipeline work**

### Accomplishments
- Built pipeline engine
`
    const items = parseWorklogCarryover(content)
    expect(items.length).toBe(0)
  })

  it('returns empty array for empty string', () => {
    const items = parseWorklogCarryover('')
    expect(items.length).toBe(0)
  })

  it('handles sessions with asterisk bullets', () => {
    const content = `**Session 2026-04-05 -- myapp: feature work**

### Carryover
* Item with asterisk
* Another asterisk item
`
    const items = parseWorklogCarryover(content)
    expect(items.length).toBe(2)
    expect(items[0].text).toBe('Item with asterisk')
  })
})

// ── computeStaleness tests ───────────────────────────────────────────────────

describe('computeStaleness', () => {
  let computeStaleness: typeof import('../routes/worklog').computeStaleness

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('../routes/worklog')
    computeStaleness = mod.computeStaleness
  })

  it('returns "recent" for dates less than 3 days old', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]
    expect(computeStaleness(dateStr)).toBe('recent')
  })

  it('returns "aging" for dates 3-7 days old', () => {
    const fiveDaysAgo = new Date()
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)
    const dateStr = fiveDaysAgo.toISOString().split('T')[0]
    expect(computeStaleness(dateStr)).toBe('aging')
  })

  it('returns "stale" for dates more than 7 days old', () => {
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const dateStr = tenDaysAgo.toISOString().split('T')[0]
    expect(computeStaleness(dateStr)).toBe('stale')
  })

  it('returns "recent" for today', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(computeStaleness(today)).toBe('recent')
  })
})

// ── GET /api/worklog/carryover integration test ──────────────────────────────

describe('GET /carryover (worklog endpoint)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns carryover items from worklog file', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue(`**Session ${new Date().toISOString().split('T')[0]} -- gstackapp: work**

### Carryover
- Fix tests
`)

    const { default: worklogApp } = await import('../routes/worklog')
    const res = await worklogApp.request('/carryover')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(1)
    expect(body[0].projectName).toBe('gstackapp')
    expect(body[0].text).toBe('Fix tests')
    expect(body[0].staleness).toBe('recent')
  })

  it('returns empty array when worklog file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const { default: worklogApp } = await import('../routes/worklog')
    const res = await worklogApp.request('/carryover')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(0)
  })
})
