import { describe, it, expect } from 'vitest'
import app from '../index'
import { signPayload } from './helpers/webhook-signer'
import installFixture from './fixtures/installation.created.json'
import prFixture from './fixtures/pull_request.opened.json'

const TEST_SECRET = process.env.GITHUB_WEBHOOK_SECRET!

describe('Webhook endpoint', () => {
  it('returns 400 for missing x-github-delivery header', async () => {
    const res = await app.request('/api/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Missing required GitHub headers')
  })

  it('returns 400 for missing x-hub-signature-256 header', async () => {
    const res = await app.request('/api/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': 'test-delivery-1',
        'x-github-event': 'pull_request',
      },
      body: '{}',
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 for invalid signature', async () => {
    const body = JSON.stringify(prFixture)
    const res = await app.request('/api/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': 'test-delivery-2',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': 'sha256=invalid',
      },
      body,
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 for valid signed payload', async () => {
    // Use installation.created event — no FK dependencies, handler can run cleanly
    const body = JSON.stringify(installFixture)
    const signature = signPayload(body, TEST_SECRET)
    const res = await app.request('/api/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-github-delivery': 'valid-delivery-1',
        'x-github-event': 'installation',
        'x-hub-signature-256': signature,
      },
      body,
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })
})

describe('Health endpoint', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.status).toBe('ok')
    expect(json.uptime).toBeTypeOf('number')
    expect(json.timestamp).toBeTypeOf('string')
  })
})
