/**
 * Magic link token generation, verification, and email delivery.
 *
 * Tokens are HMAC-SHA256 signed with MAGIC_LINK_SECRET. Raw tokens are sent via email;
 * only the hash is stored in the database. Verification uses timingSafeEqual to prevent
 * timing attacks. Tokens expire after 15 minutes and are single-use.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

function getSecret(): string {
  const secret = process.env.MAGIC_LINK_SECRET
  if (!secret) throw new Error('MAGIC_LINK_SECRET env var is required')
  return secret
}

/**
 * Generate a magic link token for the given email.
 *
 * Returns the raw token (to send via email), the HMAC hash (to store in DB),
 * and the expiration timestamp (15 minutes from now).
 */
export function generateMagicLinkToken(_email: string): {
  token: string
  hash: string
  expiresAt: Date
} {
  const token = randomBytes(32).toString('hex')
  const hash = createHmac('sha256', getSecret()).update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
  return { token, hash, expiresAt }
}

/**
 * Verify a raw token against a stored HMAC hash.
 * Uses timingSafeEqual to prevent timing attacks (T-17-02).
 */
export function verifyMagicLinkToken(token: string, storedHash: string): boolean {
  const computedHash = createHmac('sha256', getSecret()).update(token).digest('hex')
  try {
    return timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(storedHash, 'hex'))
  } catch {
    // timingSafeEqual throws if buffers have different length (invalid hash format)
    return false
  }
}

/**
 * Send a magic link email via SendGrid, or log to console in dev mode.
 */
export async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const baseUrl = process.env.PUBLIC_URL ?? 'https://ryans-mac-mini.tail857f5c.ts.net'
  const link = `${baseUrl}/auth/verify?token=${token}&email=${encodeURIComponent(email)}`

  if (!process.env.SENDGRID_API_KEY) {
    console.log(`Magic link for ${email}: ${link}`)
    return
  }

  const sgMail = await import('@sendgrid/mail')
  sgMail.default.setApiKey(process.env.SENDGRID_API_KEY)

  await sgMail.default.send({
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL ?? 'noreply@quartermint.com',
    subject: 'Sign in to gstackapp',
    text: `Click this link to sign in: ${link}\n\nThis link expires in 15 minutes.`,
    html: `<p>Click <a href="${link}">here</a> to sign in to gstackapp.</p><p>This link expires in 15 minutes.</p>`,
  })
}
