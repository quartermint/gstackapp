import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { readFileSync, readdirSync, existsSync, realpathSync, statSync } from 'node:fs'
import { homedir } from 'node:os'

// ── GET /api/design-docs ──────────────────────────────────────────────────────

describe('GET / (design-docs endpoint)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(homedir).mockReturnValue('/mock/home')
    vi.mocked(realpathSync).mockImplementation((p) => p as string)
  })

  it('returns design docs sorted by modifiedAt descending', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/.gstack/projects') return true
      if (ps === '/mock/home/.gstack/projects/quartermint-gstackapp/designs') return true
      if (ps === '/mock/home/.gstack/projects/sternryan-taxnav/designs') return true
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/.gstack/projects') {
        return ['quartermint-gstackapp', 'sternryan-taxnav'] as any
      }
      if (ps === '/mock/home/.gstack/projects/quartermint-gstackapp/designs') {
        return ['review-pipeline.md'] as any
      }
      if (ps === '/mock/home/.gstack/projects/sternryan-taxnav/designs') {
        return ['tax-categories.md'] as any
      }
      return [] as any
    })

    vi.mocked(statSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps.includes('quartermint-gstackapp')) {
        return {
          isDirectory: () => true,
          mtime: new Date('2026-04-07T10:00:00Z'),
          birthtime: new Date('2026-04-01T10:00:00Z'),
        } as any
      }
      if (ps.includes('sternryan-taxnav')) {
        return {
          isDirectory: () => true,
          mtime: new Date('2026-04-08T10:00:00Z'),
          birthtime: new Date('2026-04-02T10:00:00Z'),
        } as any
      }
      return { isDirectory: () => false, mtime: new Date(), birthtime: new Date() } as any
    })

    vi.mocked(readFileSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps.includes('review-pipeline.md')) {
        return '# Review Pipeline Design\n\nContent about review pipeline'
      }
      if (ps.includes('tax-categories.md')) {
        return '# Tax Categories\n\nContent about tax categories'
      }
      return ''
    })

    const { default: designDocsApp } = await import('../routes/design-docs')
    const res = await designDocsApp.request('/')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(2)

    // taxnav is more recent, should be first
    expect(body[0].projectName).toBe('taxnav')
    expect(body[0].docTitle).toBe('Tax Categories')
    expect(body[1].projectName).toBe('gstackapp')
    expect(body[1].docTitle).toBe('Review Pipeline Design')
  })

  it('returns empty array when ~/.gstack/projects does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)

    const { default: designDocsApp } = await import('../routes/design-docs')
    const res = await designDocsApp.request('/')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(0)
  })

  it('skips projects without designs/ subdirectory', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/.gstack/projects') return true
      // No designs/ dir for any project
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/.gstack/projects') {
        return ['quartermint-gstackapp'] as any
      }
      return [] as any
    })

    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => true,
      mtime: new Date(),
      birthtime: new Date(),
    } as any)

    const { default: designDocsApp } = await import('../routes/design-docs')
    const res = await designDocsApp.request('/')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.length).toBe(0)
  })

  it('extracts project name from directory (strips org prefix)', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/.gstack/projects') return true
      if (ps === '/mock/home/.gstack/projects/quartermint-gstackapp/designs') return true
      return false
    })

    vi.mocked(readdirSync).mockImplementation((p: any) => {
      const ps = String(p)
      if (ps === '/mock/home/.gstack/projects') return ['quartermint-gstackapp'] as any
      if (ps.includes('designs')) return ['doc.md'] as any
      return [] as any
    })

    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => true,
      mtime: new Date('2026-04-08'),
      birthtime: new Date('2026-04-01'),
    } as any)

    vi.mocked(readFileSync).mockReturnValue('# My Design Doc\n\nContent')

    const { default: designDocsApp } = await import('../routes/design-docs')
    const res = await designDocsApp.request('/')
    const body = await res.json()

    expect(body[0].projectName).toBe('gstackapp')
  })
})
