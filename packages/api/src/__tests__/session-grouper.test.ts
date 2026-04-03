import { describe, it, expect } from 'vitest'
import { groupCommitsIntoSessions, type CommitEntry, type PushSession } from '../lib/session-grouper'

describe('groupCommitsIntoSessions', () => {
  it('groups consecutive commits by same author within 30 min', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'feat: add login', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
      { sha: 'a2', message: 'fix: login redirect', authorLogin: 'rstern', date: '2026-03-20T10:15:00Z' },
      { sha: 'a3', message: 'test: login tests', authorLogin: 'rstern', date: '2026-03-20T10:25:00Z' },
    ]
    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].headSha).toBe('a3')
    expect(sessions[0].baseSha).toBe('a1')
    expect(sessions[0].commitCount).toBe(3)
    expect(sessions[0].authorLogin).toBe('rstern')
    expect(sessions[0].title).toBe('feat: add login (+2 more)')
  })

  it('splits on author change', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'feat: add login', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
      { sha: 'b1', message: 'fix: css layout', authorLogin: 'jdoe', date: '2026-03-20T10:05:00Z' },
    ]
    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].authorLogin).toBe('rstern')
    expect(sessions[1].authorLogin).toBe('jdoe')
  })

  it('splits on 30-minute gap', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'morning work', authorLogin: 'rstern', date: '2026-03-20T09:00:00Z' },
      { sha: 'a2', message: 'after break', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
    ]
    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(2)
  })

  it('handles single commit as one session', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'hotfix: critical bug', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
    ]
    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].commitCount).toBe(1)
    expect(sessions[0].title).toBe('hotfix: critical bug')
    expect(sessions[0].headSha).toBe('a1')
  })

  it('handles empty commits array', () => {
    const sessions = groupCommitsIntoSessions([])
    expect(sessions).toHaveLength(0)
  })

  it('uses parent SHA for baseSha (commit before first in session)', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'first', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z', parentSha: 'parent-of-a1' },
      { sha: 'a2', message: 'second', authorLogin: 'rstern', date: '2026-03-20T10:10:00Z', parentSha: 'a1' },
    ]
    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].baseSha).toBe('parent-of-a1')
  })

  it('computes additions and deletions sum', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'feat', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z', additions: 50, deletions: 10 },
      { sha: 'a2', message: 'fix', authorLogin: 'rstern', date: '2026-03-20T10:10:00Z', additions: 20, deletions: 5 },
    ]
    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions[0].additions).toBe(70)
    expect(sessions[0].deletions).toBe(15)
  })
})
