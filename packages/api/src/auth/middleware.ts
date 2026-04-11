/**
 * Auth middleware for Hono API routes.
 *
 * Three-path authentication per D-01:
 *   Path 0: Tailscale-User-Login header (Funnel-proxied tailnet users)
 *   Path 1: Tailscale IP detection via LocalAPI whois (direct tailnet connections)
 *   Path 2: Session cookie (magic link authenticated users)
 *   Fallback: 401 Unauthorized
 *
 * Sets c.set('user', { id, email, role, source }) on successful auth.
 */

import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { eq, and, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/client'
import { users, userSessions } from '../db/schema'
import { whoisByAddr } from './tailscale'
import { resolveRole } from './roles'

export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'operator'
  source: 'tailscale' | 'magic-link'
}

/**
 * Upsert a user in the database. Creates on first login, updates lastLoginAt on subsequent.
 */
async function upsertUser(opts: {
  email: string
  role: 'admin' | 'operator'
  source: 'tailscale' | 'magic-link'
  displayName?: string
  tailscaleNodeName?: string
}): Promise<string> {
  const existing = await db.select().from(users).where(eq(users.email, opts.email)).limit(1)

  if (existing.length > 0) {
    await db.update(users)
      .set({ lastLoginAt: new Date(), role: opts.role })
      .where(eq(users.id, existing[0].id))
    return existing[0].id
  }

  const id = nanoid()
  await db.insert(users).values({
    id,
    email: opts.email,
    role: opts.role,
    source: opts.source,
    displayName: opts.displayName,
    tailscaleNodeName: opts.tailscaleNodeName,
    lastLoginAt: new Date(),
  })
  return id
}

/**
 * Auth middleware. Checks three auth paths in order:
 * 1. Tailscale-User-Login header (Funnel)
 * 2. Tailscale IP whois (direct tailnet)
 * 3. Session cookie
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  // Path 0: Tailscale Funnel header
  const tsLoginHeader = c.req.header('tailscale-user-login')
  if (tsLoginHeader) {
    const role = resolveRole(tsLoginHeader)
    if (role) {
      const userId = await upsertUser({
        email: tsLoginHeader,
        role,
        source: 'tailscale',
      })
      c.set('user' as any, { id: userId, email: tsLoginHeader, role, source: 'tailscale' } satisfies AuthUser)
      return next()
    }
    // Unknown tailscale user - fall through to reject
  }

  // Path 1: Tailscale IP auto-detect (direct tailnet connections)
  const remoteAddr = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  if (remoteAddr && remoteAddr.startsWith('100.')) {
    const tsUser = await whoisByAddr(remoteAddr)
    if (tsUser) {
      const role = resolveRole(tsUser.loginName)
      if (role) {
        const userId = await upsertUser({
          email: tsUser.loginName,
          role,
          source: 'tailscale',
          displayName: tsUser.displayName,
          tailscaleNodeName: tsUser.nodeName,
        })
        c.set('user' as any, { id: userId, email: tsUser.loginName, role, source: 'tailscale' } satisfies AuthUser)
        return next()
      }
    }
  }

  // Path 2: Session cookie
  const sessionToken = getCookie(c, 'gstack_session')
  if (sessionToken) {
    const sessionRows = await db
      .select()
      .from(userSessions)
      .where(
        and(
          eq(userSessions.id, sessionToken),
          gt(userSessions.expiresAt, new Date())
        )
      )
      .limit(1)

    if (sessionRows.length > 0) {
      const session = sessionRows[0]
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1)

      if (userRows.length > 0) {
        const user = userRows[0]
        c.set('user' as any, {
          id: user.id,
          email: user.email,
          role: user.role as 'admin' | 'operator',
          source: 'magic-link',
        } satisfies AuthUser)
        return next()
      }
    }
  }

  // No auth: return 401
  return c.json({ error: 'Unauthorized' }, 401)
})

/**
 * Get the user scope for query filtering.
 *
 * Operators get scoped queries (WHERE user_id = ?).
 * Admins see all data (userId is null, meaning no filtering).
 */
export function getUserScope(user: AuthUser): {
  userId: string | null
  role: 'admin' | 'operator'
} {
  return {
    userId: user.role === 'operator' ? user.id : null,
    role: user.role,
  }
}
