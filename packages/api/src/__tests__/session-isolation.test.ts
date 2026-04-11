import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { getTestDb, resetTestDb } from './helpers/test-db'

// Mock auth dependencies before importing middleware
vi.mock('../auth/tailscale', () => ({
  whoisByAddr: vi.fn().mockResolvedValue(null),
}))

describe('auth middleware + session isolation', () => {
  beforeEach(async () => {
    process.env.ADMIN_EMAILS = 'admin@test.com'
    process.env.OPERATOR_EMAILS = 'operator@test.com'
    process.env.MAGIC_LINK_SECRET = 'test-secret-that-is-at-least-32-bytes-long'
    await resetTestDb()
  })

  it('authMiddleware passes through for Tailscale-User-Login header with known email', async () => {
    const { authMiddleware } = await import('../auth/middleware')
    const app = new Hono()
    app.use('/*', authMiddleware)
    app.get('/test', (c) => {
      const user = c.get('user' as any)
      return c.json({ user })
    })

    const res = await app.request('/test', {
      headers: { 'tailscale-user-login': 'admin@test.com' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.user.email).toBe('admin@test.com')
    expect(body.user.role).toBe('admin')
    expect(body.user.source).toBe('tailscale')
  })

  it('authMiddleware returns 401 for unknown Tailscale-User-Login header', async () => {
    const { authMiddleware } = await import('../auth/middleware')
    const app = new Hono()
    app.use('/*', authMiddleware)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { 'tailscale-user-login': 'stranger@unknown.com' },
    })
    expect(res.status).toBe(401)
  })

  it('authMiddleware passes through for valid session cookie', async () => {
    const { db } = getTestDb()
    const { users, userSessions } = await import('../db/schema')

    // Seed a user and session
    await db.insert(users).values({
      id: 'user-1',
      email: 'operator@test.com',
      role: 'operator',
      source: 'magic-link',
    })
    await db.insert(userSessions).values({
      id: 'session-cookie-123',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    })

    const { authMiddleware } = await import('../auth/middleware')
    const app = new Hono()
    app.use('/*', authMiddleware)
    app.get('/test', (c) => {
      const user = c.get('user' as any)
      return c.json({ user })
    })

    const res = await app.request('/test', {
      headers: { cookie: 'gstack_session=session-cookie-123' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.user.email).toBe('operator@test.com')
    expect(body.user.role).toBe('operator')
  })

  it('authMiddleware returns 401 for expired session cookie', async () => {
    const { db } = getTestDb()
    const { users, userSessions } = await import('../db/schema')

    await db.insert(users).values({
      id: 'user-2',
      email: 'operator@test.com',
      role: 'operator',
      source: 'magic-link',
    })
    await db.insert(userSessions).values({
      id: 'expired-session',
      userId: 'user-2',
      expiresAt: new Date(Date.now() - 1000), // expired
    })

    const { authMiddleware } = await import('../auth/middleware')
    const app = new Hono()
    app.use('/*', authMiddleware)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { cookie: 'gstack_session=expired-session' },
    })
    expect(res.status).toBe(401)
  })

  it('authMiddleware returns 401 for missing auth', async () => {
    const { authMiddleware } = await import('../auth/middleware')
    const app = new Hono()
    app.use('/*', authMiddleware)
    app.get('/test', (c) => c.json({ ok: true }))

    const res = await app.request('/test')
    expect(res.status).toBe(401)
  })

  it('getUserScope returns userId for operators and null for admins', async () => {
    const { getUserScope } = await import('../auth/middleware')

    // Simulate operator context
    const operatorScope = getUserScope({ id: 'user-1', email: 'op@test.com', role: 'operator' as const, source: 'magic-link' })
    expect(operatorScope.userId).toBe('user-1')
    expect(operatorScope.role).toBe('operator')

    // Simulate admin context
    const adminScope = getUserScope({ id: 'admin-1', email: 'admin@test.com', role: 'admin' as const, source: 'tailscale' })
    expect(adminScope.userId).toBeNull()
    expect(adminScope.role).toBe('admin')
  })

  describe('auth routes', () => {
    it('POST /auth/magic-link returns 403 for unknown email', async () => {
      const authApp = (await import('../routes/auth')).default
      const app = new Hono()
      app.route('/auth', authApp)

      const res = await app.request('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'stranger@unknown.com' }),
      })
      expect(res.status).toBe(403)
    })

    it('POST /auth/magic-link returns 200 for known operator email', async () => {
      const authApp = (await import('../routes/auth')).default
      const app = new Hono()
      app.route('/auth', authApp)

      const res = await app.request('/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'operator@test.com' }),
      })
      expect(res.status).toBe(200)
      const body = await res.json() as any
      expect(body.sent).toBe(true)
    })

    it('GET /auth/me returns 401 without auth', async () => {
      const { authMiddleware } = await import('../auth/middleware')
      const authApp = (await import('../routes/auth')).default
      const app = new Hono()
      app.use('/auth/me', authMiddleware)
      app.route('/auth', authApp)

      const res = await app.request('/auth/me')
      expect(res.status).toBe(401)
    })

    it('GET /auth/me returns user when authenticated via header', async () => {
      const { authMiddleware } = await import('../auth/middleware')
      const authApp = (await import('../routes/auth')).default
      const app = new Hono()
      app.use('/auth/me', authMiddleware)
      app.route('/auth', authApp)

      const res = await app.request('/auth/me', {
        headers: { 'tailscale-user-login': 'admin@test.com' },
      })
      expect(res.status).toBe(200)
      const body = await res.json() as any
      expect(body.user.email).toBe('admin@test.com')
      expect(body.user.role).toBe('admin')
    })

    it('GET /auth/verify with valid token sets cookie and redirects', async () => {
      const { db } = getTestDb()
      const { magicLinkTokens } = await import('../db/schema')
      const { generateMagicLinkToken } = await import('../auth/magic-link')

      const email = 'operator@test.com'
      const { token, hash, expiresAt } = generateMagicLinkToken(email)

      // Store the token hash in DB
      await db.insert(magicLinkTokens).values({
        id: 'tok-1',
        email,
        tokenHash: hash,
        expiresAt,
      })

      const authApp = (await import('../routes/auth')).default
      const app = new Hono()
      app.route('/auth', authApp)

      const res = await app.request(`/auth/verify?token=${token}&email=${encodeURIComponent(email)}`, {
        redirect: 'manual',
      })

      // Should redirect to /
      expect(res.status).toBe(302)
      const setCookieHeader = res.headers.get('set-cookie')
      expect(setCookieHeader).toContain('gstack_session=')
      expect(setCookieHeader).toContain('HttpOnly')
    })

    it('GET /auth/verify with expired token returns 401', async () => {
      const { db } = getTestDb()
      const { magicLinkTokens } = await import('../db/schema')
      const { generateMagicLinkToken } = await import('../auth/magic-link')

      const email = 'operator@test.com'
      const { token, hash } = generateMagicLinkToken(email)

      // Store with expired timestamp
      await db.insert(magicLinkTokens).values({
        id: 'tok-exp',
        email,
        tokenHash: hash,
        expiresAt: new Date(Date.now() - 1000), // already expired
      })

      const authApp = (await import('../routes/auth')).default
      const app = new Hono()
      app.route('/auth', authApp)

      const res = await app.request(`/auth/verify?token=${token}&email=${encodeURIComponent(email)}`)
      expect(res.status).toBe(401)
    })

    it('GET /auth/verify with already-used token returns 401', async () => {
      const { db } = getTestDb()
      const { magicLinkTokens } = await import('../db/schema')
      const { generateMagicLinkToken } = await import('../auth/magic-link')

      const email = 'operator@test.com'
      const { token, hash, expiresAt } = generateMagicLinkToken(email)

      // Store with usedAt already set
      await db.insert(magicLinkTokens).values({
        id: 'tok-used',
        email,
        tokenHash: hash,
        expiresAt,
        usedAt: new Date(),
      })

      const authApp = (await import('../routes/auth')).default
      const app = new Hono()
      app.route('/auth', authApp)

      const res = await app.request(`/auth/verify?token=${token}&email=${encodeURIComponent(email)}`)
      expect(res.status).toBe(401)
    })
  })
})
