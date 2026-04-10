import { describe, it, expect } from 'vitest'
import './helpers/test-db'
import { getTestDb } from './helpers/test-db'
import app from '../index'

describe('GET /api/onboarding/status', () => {
  it('returns step=install when no installations exist', async () => {
    const res = await app.request('/api/onboarding/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.step).toBe('install')
    expect(body.installationCount).toBe(0)
    expect(body.repoCount).toBe(0)
    expect(body.pipelineCount).toBe(0)
    expect(body.githubAppUrl).toContain('github.com')
  })

  it('returns step=select-repos when installation exists but no active repos', async () => {
    const { pg } = getTestDb()
    await pg.exec(`
      INSERT INTO github_installations (id, account_login, account_type, app_id, status)
      VALUES (1, 'testuser', 'User', 12345, 'active')
    `)

    const res = await app.request('/api/onboarding/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.step).toBe('select-repos')
    expect(body.installationCount).toBe(1)
    expect(body.repoCount).toBe(0)
  })

  it('returns step=first-review when repos exist but no pipeline runs', async () => {
    const { pg } = getTestDb()
    await pg.exec(`
      INSERT INTO github_installations (id, account_login, account_type, app_id, status)
      VALUES (1, 'testuser', 'User', 12345, 'active')
    `)
    await pg.exec(`
      INSERT INTO repositories (id, installation_id, full_name, is_active)
      VALUES (100, 1, 'testuser/repo1', true)
    `)

    const res = await app.request('/api/onboarding/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.step).toBe('first-review')
    expect(body.installationCount).toBe(1)
    expect(body.repoCount).toBe(1)
    expect(body.pipelineCount).toBe(0)
  })

  it('returns step=complete when repos and pipeline runs exist', async () => {
    const { pg } = getTestDb()
    await pg.exec(`
      INSERT INTO github_installations (id, account_login, account_type, app_id, status)
      VALUES (1, 'testuser', 'User', 12345, 'active')
    `)
    await pg.exec(`
      INSERT INTO repositories (id, installation_id, full_name, is_active)
      VALUES (100, 1, 'testuser/repo1', true)
    `)
    await pg.exec(`
      INSERT INTO pull_requests (repo_id, number, title, author_login, head_sha, base_branch)
      VALUES (100, 1, 'Test PR', 'testuser', 'abc123', 'main')
    `)
    await pg.exec(`
      INSERT INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha, status)
      VALUES ('run-001', 'delivery-001', 1, 1, 'abc123', 'COMPLETED')
    `)

    const res = await app.request('/api/onboarding/status')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.step).toBe('complete')
    expect(body.installationCount).toBe(1)
    expect(body.repoCount).toBe(1)
    expect(body.pipelineCount).toBe(1)
  })

  it('ignores deleted installations', async () => {
    const { pg } = getTestDb()
    await pg.exec(`
      INSERT INTO github_installations (id, account_login, account_type, app_id, status)
      VALUES (1, 'testuser', 'User', 12345, 'deleted')
    `)

    const res = await app.request('/api/onboarding/status')
    const body = await res.json()
    expect(body.step).toBe('install')
    expect(body.installationCount).toBe(0)
  })

  it('ignores inactive repos', async () => {
    const { pg } = getTestDb()
    await pg.exec(`
      INSERT INTO github_installations (id, account_login, account_type, app_id, status)
      VALUES (1, 'testuser', 'User', 12345, 'active')
    `)
    await pg.exec(`
      INSERT INTO repositories (id, installation_id, full_name, is_active)
      VALUES (100, 1, 'testuser/repo1', false)
    `)

    const res = await app.request('/api/onboarding/status')
    const body = await res.json()
    expect(body.step).toBe('select-repos')
    expect(body.repoCount).toBe(0)
  })

  it('includes githubAppUrl in response', async () => {
    const res = await app.request('/api/onboarding/status')
    const body = await res.json()
    expect(body).toHaveProperty('githubAppUrl')
    expect(typeof body.githubAppUrl).toBe('string')
  })
})
