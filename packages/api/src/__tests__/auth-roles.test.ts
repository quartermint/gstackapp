import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('role resolver', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'ryan@quartermint.com'
    process.env.OPERATOR_EMAILS = 'bella@example.com,andrew@example.com'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('resolveRole returns admin for admin email', async () => {
    const { resolveRole } = await import('../auth/roles')
    expect(resolveRole('ryan@quartermint.com')).toBe('admin')
  })

  it('resolveRole returns operator for operator email', async () => {
    const { resolveRole } = await import('../auth/roles')
    expect(resolveRole('bella@example.com')).toBe('operator')
  })

  it('resolveRole returns null for unknown email', async () => {
    const { resolveRole } = await import('../auth/roles')
    expect(resolveRole('unknown@example.com')).toBeNull()
  })

  it('resolveRole is case-insensitive', async () => {
    const { resolveRole } = await import('../auth/roles')
    expect(resolveRole('Ryan@Quartermint.COM')).toBe('admin')
    expect(resolveRole('BELLA@EXAMPLE.COM')).toBe('operator')
  })

  it('resolveRole trims whitespace in email lists', async () => {
    process.env.OPERATOR_EMAILS = ' bella@example.com , andrew@example.com '
    const { resolveRole } = await import('../auth/roles')
    expect(resolveRole('bella@example.com')).toBe('operator')
    expect(resolveRole('andrew@example.com')).toBe('operator')
  })

  it('isKnownUser returns true for known emails', async () => {
    const { isKnownUser } = await import('../auth/roles')
    expect(isKnownUser('ryan@quartermint.com')).toBe(true)
    expect(isKnownUser('bella@example.com')).toBe(true)
  })

  it('isKnownUser returns false for unknown emails', async () => {
    const { isKnownUser } = await import('../auth/roles')
    expect(isKnownUser('stranger@example.com')).toBe(false)
  })
})
