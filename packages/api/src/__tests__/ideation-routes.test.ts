/**
 * Tests for ideation API routes.
 *
 * Covers: POST /start, GET /stream guard clauses, GET /artifacts, GET /:sessionId
 * Does NOT test the full SSE pipeline (requires mocking the LLM provider).
 */

import { describe, it, expect } from 'vitest'
import { getTestDb } from './helpers/test-db'
import app from '../index'
import { nanoid } from 'nanoid'

function seedIdeationSession(
  status: string = 'pending',
  opts: { withArtifacts?: boolean } = {},
) {
  const { sqlite } = getTestDb()
  const id = nanoid()

  sqlite.exec(`
    INSERT INTO ideation_sessions (id, user_idea, status, created_at)
    VALUES ('${id}', 'A tool to track garden plantings', '${status}', ${Date.now()})
  `)

  if (opts.withArtifacts) {
    const artId = nanoid()
    sqlite.exec(`
      INSERT INTO ideation_artifacts (id, ideation_session_id, stage, artifact_path, content, title, excerpt, created_at)
      VALUES ('${artId}', '${id}', 'office-hours', 'memory://${id}/office-hours', 'Full analysis text here', 'Office Hours Analysis', 'Full analysis...', ${Date.now()})
    `)
  }

  return id
}

describe('POST /api/ideation/start', () => {
  it('creates session with valid idea', async () => {
    const res = await app.request('/api/ideation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: 'A todo app with AI sorting' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBeDefined()
    expect(body.userIdea).toBe('A todo app with AI sorting')
    expect(body.status).toBe('pending')
  })

  it('rejects empty idea with 400', async () => {
    const res = await app.request('/api/ideation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea: '' }),
    })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid input')
  })

  it('rejects missing idea field with 400', async () => {
    const res = await app.request('/api/ideation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })
})

describe('GET /api/ideation/stream/:sessionId', () => {
  it('returns 404 for unknown session', async () => {
    const res = await app.request('/api/ideation/stream/nonexistent-id')
    expect(res.status).toBe(404)
  })

  it('returns 400 for already-complete session', async () => {
    const id = seedIdeationSession('complete')
    const res = await app.request(`/api/ideation/stream/${id}`)
    expect(res.status).toBe(400)
  })

  it('returns 409 for already-running session', async () => {
    const id = seedIdeationSession('running')
    const res = await app.request(`/api/ideation/stream/${id}`)
    expect(res.status).toBe(409)
  })

  it('returns 410 for failed session', async () => {
    const id = seedIdeationSession('failed')
    const res = await app.request(`/api/ideation/stream/${id}`)
    expect(res.status).toBe(410)
  })
})

describe('GET /api/ideation/artifacts/:sessionId', () => {
  it('returns empty array for session with no artifacts', async () => {
    const id = seedIdeationSession()
    const res = await app.request(`/api/ideation/artifacts/${id}`)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns artifact list for session with artifacts', async () => {
    const id = seedIdeationSession('complete', { withArtifacts: true })
    const res = await app.request(`/api/ideation/artifacts/${id}`)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].stage).toBe('office-hours')
    expect(body[0].title).toBe('Office Hours Analysis')
  })
})

describe('GET /api/ideation/:sessionId', () => {
  it('returns 404 for unknown session', async () => {
    const res = await app.request('/api/ideation/nonexistent-id')
    expect(res.status).toBe(404)
  })

  it('returns session state with artifacts', async () => {
    const id = seedIdeationSession('complete', { withArtifacts: true })
    const res = await app.request(`/api/ideation/${id}`)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe(id)
    expect(body.userIdea).toBe('A tool to track garden plantings')
    expect(body.status).toBe('complete')
    expect(body.artifacts).toHaveLength(1)
  })
})
