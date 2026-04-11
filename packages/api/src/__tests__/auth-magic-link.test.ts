import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('magic-link', () => {
  beforeEach(() => {
    process.env.MAGIC_LINK_SECRET = 'test-secret-that-is-at-least-32-bytes-long'
  })

  describe('generateMagicLinkToken', () => {
    it('returns token (64 hex chars), hash (64 hex chars), and expiresAt ~15min from now', async () => {
      const { generateMagicLinkToken } = await import('../auth/magic-link')
      const result = generateMagicLinkToken('test@example.com')

      expect(result.token).toMatch(/^[a-f0-9]{64}$/)
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/)
      expect(result.token).not.toBe(result.hash)

      const now = Date.now()
      const expiresMs = result.expiresAt.getTime()
      // Should be ~15 minutes from now (within 5 seconds tolerance)
      expect(expiresMs).toBeGreaterThan(now + 14 * 60 * 1000)
      expect(expiresMs).toBeLessThan(now + 16 * 60 * 1000)
    })
  })

  describe('verifyMagicLinkToken', () => {
    it('returns true for matching token and hash', async () => {
      const { generateMagicLinkToken, verifyMagicLinkToken } = await import('../auth/magic-link')
      const { token, hash } = generateMagicLinkToken('test@example.com')
      expect(verifyMagicLinkToken(token, hash)).toBe(true)
    })

    it('returns false for wrong token', async () => {
      const { generateMagicLinkToken, verifyMagicLinkToken } = await import('../auth/magic-link')
      const { hash } = generateMagicLinkToken('test@example.com')
      expect(verifyMagicLinkToken('wrong-token-value', hash)).toBe(false)
    })

    it('returns false for wrong hash', async () => {
      const { generateMagicLinkToken, verifyMagicLinkToken } = await import('../auth/magic-link')
      const { token } = generateMagicLinkToken('test@example.com')
      expect(verifyMagicLinkToken(token, 'a'.repeat(64))).toBe(false)
    })
  })

  describe('sendMagicLinkEmail', () => {
    it('logs to console in dev mode (no SENDGRID_API_KEY)', async () => {
      delete process.env.SENDGRID_API_KEY
      process.env.PUBLIC_URL = 'https://test.example.com'

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const { sendMagicLinkEmail } = await import('../auth/magic-link')
      await sendMagicLinkEmail('user@example.com', 'test-token-123')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Magic link for user@example.com')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('test-token-123')
      )
      consoleSpy.mockRestore()
    })
  })
})
