import { describe, it, expect } from 'vitest'
import { parseArgs } from 'node:util'

describe('backfill CLI arg parsing', () => {
  it('parses default args', () => {
    const { values } = parseArgs({
      args: [],
      options: {
        days: { type: 'string', default: '30' },
        profile: { type: 'string', default: 'budget' },
        concurrency: { type: 'string', default: '2' },
        'dry-run': { type: 'boolean', default: false },
        repos: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    })

    expect(values.days).toBe('30')
    expect(values.profile).toBe('budget')
    expect(values.concurrency).toBe('2')
    expect(values['dry-run']).toBe(false)
    expect(values.repos).toBeUndefined()
  })

  it('parses custom args', () => {
    const { values } = parseArgs({
      args: ['--days', '7', '--profile', 'balanced', '--concurrency', '4', '--dry-run', '--repos', 'test/repo,test/repo2'],
      options: {
        days: { type: 'string', default: '30' },
        profile: { type: 'string', default: 'budget' },
        concurrency: { type: 'string', default: '2' },
        'dry-run': { type: 'boolean', default: false },
        repos: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    })

    expect(values.days).toBe('7')
    expect(values.profile).toBe('balanced')
    expect(values.concurrency).toBe('4')
    expect(values['dry-run']).toBe(true)
    expect(values.repos).toBe('test/repo,test/repo2')
  })

  it('splits repos filter correctly', () => {
    const reposArg = 'quartermint/openefb,quartermint/gstackapp'
    const repoFilter = reposArg.split(',').map(r => r.trim())
    expect(repoFilter).toEqual(['quartermint/openefb', 'quartermint/gstackapp'])
  })
})
