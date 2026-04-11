import { describe, it, expect } from 'vitest'
import './helpers/test-db'
import { getTestDb } from './helpers/test-db'
import app from '../index'

describe('Sessions API', () => {
  describe('POST /api/sessions', () => {
    it('creates a session and returns 201 with id', async () => {
      const res = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Session' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.session).toBeDefined()
      expect(body.session.id).toBeTruthy()
      expect(body.session.title).toBe('Test Session')
      expect(body.session.status).toBe('active')
      expect(body.session.messageCount).toBe(0)
    })

    it('creates a session with projectPath', async () => {
      const res = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Project Session', projectPath: '/Users/test/myproject' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.session.projectPath).toBe('/Users/test/myproject')
    })

    it('creates a session with no body', async () => {
      const res = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.session.id).toBeTruthy()
      expect(body.session.title).toBeNull()
    })

    it('rejects title longer than 200 characters', async () => {
      const res = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'x'.repeat(201) }),
      })
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('Invalid input')
    })
  })

  describe('GET /api/sessions', () => {
    it('returns empty array when no sessions exist', async () => {
      const res = await app.request('/api/sessions')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.sessions).toEqual([])
    })

    it('returns sessions list after creation', async () => {
      // Create two sessions
      await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Session 1' }),
      })
      await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Session 2' }),
      })

      const res = await app.request('/api/sessions')
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.sessions).toHaveLength(2)
      expect(body.sessions[0]).toHaveProperty('id')
      expect(body.sessions[0]).toHaveProperty('title')
      expect(body.sessions[0]).toHaveProperty('status')
      expect(body.sessions[0]).toHaveProperty('messageCount')
      expect(body.sessions[0]).toHaveProperty('createdAt')
    })
  })

  describe('GET /api/sessions/:id', () => {
    it('returns session with messages array', async () => {
      // Create a session
      const createRes = await app.request('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Detail Session' }),
      })
      const { session } = await createRes.json()

      // Insert a test message directly
      const { pg } = getTestDb()
      await pg.exec(`
        INSERT INTO messages (id, session_id, role, content, has_tool_calls)
        VALUES ('msg-001', '${session.id}', 'user', 'Hello agent', false)
      `)

      const res = await app.request(`/api/sessions/${session.id}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.session).toBeDefined()
      expect(body.session.id).toBe(session.id)
      expect(body.session.title).toBe('Detail Session')
      expect(body.messages).toHaveLength(1)
      expect(body.messages[0].role).toBe('user')
      expect(body.messages[0].content).toBe('Hello agent')
    })

    it('returns 404 for non-existent session', async () => {
      const res = await app.request('/api/sessions/nonexistent')
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('Session not found')
    })
  })
})
