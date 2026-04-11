/**
 * Auth routes for magic link authentication.
 *
 * POST /magic-link - Request a magic link email
 * GET /verify - Verify a magic link token, create session, redirect
 * GET /me - Return current authenticated user (requires authMiddleware)
 */

import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'
import { eq, and, gt, isNull } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client'
import { users, magicLinkTokens, userSessions } from '../db/schema'
import { isKnownUser, resolveRole } from '../auth/roles'
import { generateMagicLinkToken, verifyMagicLinkToken, sendMagicLinkEmail } from '../auth/magic-link'

const magicLinkSchema = z.object({
  email: z.string().email(),
})

const authApp = new Hono()

/**
 * POST /magic-link
 * Request a magic link for the given email.
 * Returns 403 if email is not in any allowlist.
 */
authApp.post('/magic-link', async (c) => {
  const body = await c.req.json()
  const parsed = magicLinkSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid email' }, 400)
  }

  const { email } = parsed.data

  if (!isKnownUser(email)) {
    return c.json({ error: 'Access denied' }, 403)
  }

  const { token, hash, expiresAt } = generateMagicLinkToken(email)

  // Store token hash in DB
  db.insert(magicLinkTokens).values({
    id: nanoid(),
    email,
    tokenHash: hash,
    expiresAt,
  }).run()

  // Send email (or log in dev mode)
  await sendMagicLinkEmail(email, token)

  return c.json({ sent: true })
})

/**
 * GET /verify
 * Verify a magic link token, create user + session, set cookie, redirect.
 */
authApp.get('/verify', async (c) => {
  const token = c.req.query('token')
  const email = c.req.query('email')

  if (!token || !email) {
    return c.json({ error: 'Missing token or email' }, 400)
  }

  // Find unexpired, unused tokens for this email
  const tokenRows = db
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.email, email),
        gt(magicLinkTokens.expiresAt, new Date()),
        isNull(magicLinkTokens.usedAt)
      )
    )
    .all()

  // Check each token (there could be multiple pending)
  let matchedToken: typeof tokenRows[0] | null = null
  for (const row of tokenRows) {
    if (verifyMagicLinkToken(token, row.tokenHash)) {
      matchedToken = row
      break
    }
  }

  if (!matchedToken) {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }

  // Mark token as used
  db.update(magicLinkTokens)
    .set({ usedAt: new Date() })
    .where(eq(magicLinkTokens.id, matchedToken.id))
    .run()

  // Upsert user
  const role = resolveRole(email)
  if (!role) {
    return c.json({ error: 'Access denied' }, 403)
  }

  let userId: string
  const existingUser = db.select().from(users).where(eq(users.email, email)).limit(1).all()
  if (existingUser.length > 0) {
    userId = existingUser[0].id
    db.update(users)
      .set({ lastLoginAt: new Date(), role })
      .where(eq(users.id, userId))
      .run()
  } else {
    userId = nanoid()
    db.insert(users).values({
      id: userId,
      email,
      role,
      source: 'magic-link',
      lastLoginAt: new Date(),
    }).run()
  }

  // Create session (7-day expiry per D-02)
  const sessionId = nanoid()
  db.insert(userSessions).values({
    id: sessionId,
    userId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }).run()

  // Set session cookie
  setCookie(c, 'gstack_session', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })

  // Redirect to dashboard
  return c.redirect('/')
})

/**
 * GET /me
 * Return the current authenticated user's identity and role.
 */
authApp.get('/me', (c) => {
  const user = c.get('user' as any)
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  })
})

export default authApp
