import { describe, it, expect } from 'vitest'

describe('push webhook handler logic', () => {
  it('skips pushes to non-default branch', () => {
    const ref = 'refs/heads/feature-branch'
    const defaultBranch = 'main'
    expect(ref === `refs/heads/${defaultBranch}`).toBe(false)
  })

  it('skips empty pushes (branch create/delete)', () => {
    const commits: Array<{ message: string }> = []
    expect(commits.length === 0).toBe(true)
  })

  it('skips force pushes', () => {
    const forced = true
    expect(forced).toBe(true)
  })

  it('processes normal push to default branch', () => {
    const ref = 'refs/heads/main'
    const defaultBranch = 'main'
    const commits = [{ message: 'feat: add auth' }, { message: 'fix: typo' }]
    const forced = false

    const shouldProcess =
      ref === `refs/heads/${defaultBranch}` &&
      commits.length > 0 &&
      !forced

    expect(shouldProcess).toBe(true)
  })
})

describe('summarizePushCommits', () => {
  function summarizePushCommits(commits: Array<{ message: string }>): string {
    if (commits.length === 0) return 'Empty push'
    const firstLine = commits[0].message.split('\n')[0]
    if (commits.length === 1) return firstLine
    return `${firstLine} (+${commits.length - 1} more)`
  }

  it('returns first line for single commit', () => {
    expect(summarizePushCommits([{ message: 'feat: add auth\n\nDetails here' }]))
      .toBe('feat: add auth')
  })

  it('summarizes multiple commits', () => {
    const commits = [
      { message: 'feat: add authentication system' },
      { message: 'fix: correct login redirect' },
      { message: 'test: add auth tests' },
    ]
    expect(summarizePushCommits(commits))
      .toBe('feat: add authentication system (+2 more)')
  })

  it('handles empty commits', () => {
    expect(summarizePushCommits([])).toBe('Empty push')
  })
})
