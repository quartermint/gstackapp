import { describe, it, expect } from 'vitest'
import './helpers/test-db'
import { getTestDb } from './helpers/test-db'
import app from '../index'

/**
 * Helper to seed a complete test scenario with pipeline runs, stage results, and findings.
 */
async function seedTestData(pg: ReturnType<typeof getTestDb>['pg']) {
  // Create installation and repo
  await pg.exec(`
    INSERT INTO github_installations (id, account_login, account_type, app_id, status)
    VALUES (1, 'testuser', 'User', 12345, 'active')
  `)
  await pg.exec(`
    INSERT INTO repositories (id, installation_id, full_name, is_active)
    VALUES (100, 1, 'testuser/repo1', true)
  `)

  // Create PRs
  await pg.exec(`
    INSERT INTO pull_requests (id, repo_id, number, title, author_login, head_sha, base_branch)
    VALUES (1, 100, 1, 'PR 1', 'testuser', 'sha1', 'main')
  `)
  await pg.exec(`
    INSERT INTO pull_requests (id, repo_id, number, title, author_login, head_sha, base_branch)
    VALUES (2, 100, 2, 'PR 2', 'testuser', 'sha2', 'main')
  `)
  await pg.exec(`
    INSERT INTO pull_requests (id, repo_id, number, title, author_login, head_sha, base_branch)
    VALUES (3, 100, 3, 'PR 3', 'testuser', 'sha3', 'main')
  `)

  // Pipeline runs on different dates
  await pg.exec(`
    INSERT INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha, status, completed_at)
    VALUES ('run-001', 'del-001', 1, 1, 'sha1', 'COMPLETED', '2026-01-10T12:00:00Z')
  `)
  await pg.exec(`
    INSERT INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha, status, completed_at)
    VALUES ('run-002', 'del-002', 2, 1, 'sha2', 'COMPLETED', '2026-01-11T12:00:00Z')
  `)
  await pg.exec(`
    INSERT INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha, status, completed_at)
    VALUES ('run-003', 'del-003', 3, 1, 'sha3', 'COMPLETED', '2026-01-12T12:00:00Z')
  `)

  // Stage results for run-001 (day 1)
  await pg.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
    VALUES ('sr-001-eng', 'run-001', 'eng', 'PASS')
  `)
  await pg.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
    VALUES ('sr-001-qa', 'run-001', 'qa', 'FLAG')
  `)

  // Stage results for run-002 (day 2)
  await pg.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
    VALUES ('sr-002-eng', 'run-002', 'eng', 'BLOCK')
  `)
  await pg.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
    VALUES ('sr-002-qa', 'run-002', 'qa', 'PASS')
  `)

  // Stage results for run-003 (day 3)
  await pg.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
    VALUES ('sr-003-eng', 'run-003', 'eng', 'PASS')
  `)
  await pg.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict)
    VALUES ('sr-003-qa', 'run-003', 'qa', 'SKIP')
  `)

  // Findings for run-001 (day 1): 1 critical, 2 notable
  await pg.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
    VALUES ('f-001', 'sr-001-eng', 'run-001', 'critical', 'security', 'SQL injection', 'Found SQL injection')
  `)
  await pg.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
    VALUES ('f-002', 'sr-001-qa', 'run-001', 'notable', 'test', 'Missing tests', 'No unit tests')
  `)
  await pg.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
    VALUES ('f-003', 'sr-001-qa', 'run-001', 'notable', 'test', 'Flaky test', 'Test is flaky')
  `)

  // Findings for run-002 (day 2): 0 critical, 1 notable, 3 minor
  await pg.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
    VALUES ('f-004', 'sr-002-eng', 'run-002', 'notable', 'style', 'Long function', 'Function too long')
  `)
  await pg.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
    VALUES ('f-005', 'sr-002-eng', 'run-002', 'minor', 'style', 'Naming', 'Bad naming')
  `)
  await pg.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
    VALUES ('f-006', 'sr-002-qa', 'run-002', 'minor', 'style', 'Comment', 'Missing comment')
  `)
  await pg.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description)
    VALUES ('f-007', 'sr-002-qa', 'run-002', 'minor', 'style', 'Format', 'Bad format')
  `)

  // Findings for run-003 (day 3): 0 findings (clean run)
  // No findings inserted
}

describe('GET /api/trends/scores', () => {
  it('returns 400 when repoId is missing', async () => {
    const res = await app.request('/api/trends/scores')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('repoId')
  })

  it('returns empty array when no completed pipeline runs exist', async () => {
    const { pg } = getTestDb()
    await pg.exec(`
      INSERT INTO github_installations (id, account_login, account_type, app_id, status)
      VALUES (1, 'testuser', 'User', 12345, 'active')
    `)
    await pg.exec(`
      INSERT INTO repositories (id, installation_id, full_name, is_active)
      VALUES (100, 1, 'testuser/repo1', true)
    `)

    const res = await app.request('/api/trends/scores?repoId=100')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns quality scores bucketed by date', async () => {
    const { pg } = getTestDb()
    await seedTestData(pg)

    const res = await app.request('/api/trends/scores?repoId=100')
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toHaveLength(3)
    expect(body[0].date).toBe('2026-01-10')
    expect(body[1].date).toBe('2026-01-11')
    expect(body[2].date).toBe('2026-01-12')

    // Day 1: 1 critical + 2 notable + 0 minor = 3 total
    // weighted_sum = 3 + 2 = 5, norm = max(10, 3) = 10, score = 100 - 50 = 50
    expect(body[0].score).toBe(50)

    // Day 2: 0 critical + 1 notable + 3 minor = 4 total
    // weighted_sum = 0 + 1 + 0 = 1, norm = max(10, 4) = 10, score = 100 - 10 = 90
    expect(body[1].score).toBe(90)

    // Day 3: 0 findings
    // score = 100
    expect(body[2].score).toBe(100)
  })

  it('only includes COMPLETED pipeline runs', async () => {
    const { pg } = getTestDb()
    await seedTestData(pg)

    // Add a FAILED pipeline run on a 4th day (should NOT appear)
    await pg.exec(`
      INSERT INTO pull_requests (id, repo_id, number, title, author_login, head_sha, base_branch)
      VALUES (4, 100, 4, 'PR 4', 'testuser', 'sha4', 'main')
    `)
    await pg.exec(`
      INSERT INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha, status, completed_at)
      VALUES ('run-004', 'del-004', 4, 1, 'sha4', 'FAILED', '2026-01-13T12:00:00Z')
    `)

    const res = await app.request('/api/trends/scores?repoId=100')
    const body = await res.json()
    expect(body).toHaveLength(3) // Only 3 COMPLETED runs
  })
})

describe('GET /api/trends/verdicts', () => {
  it('returns 400 when repoId is missing', async () => {
    const res = await app.request('/api/trends/verdicts?stage=eng')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('repoId')
  })

  it('returns empty array when no completed runs exist', async () => {
    const res = await app.request('/api/trends/verdicts?repoId=999&stage=eng')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns verdict counts bucketed by date for a specific stage', async () => {
    const { pg } = getTestDb()
    await seedTestData(pg)

    const res = await app.request('/api/trends/verdicts?repoId=100&stage=eng')
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toHaveLength(3)
    expect(body[0].date).toBe('2026-01-10')
    expect(body[1].date).toBe('2026-01-11')
    expect(body[2].date).toBe('2026-01-12')

    // Day 1: eng = PASS
    expect(body[0]).toEqual({ date: '2026-01-10', pass: 1, flag: 0, block: 0, skip: 0 })
    // Day 2: eng = BLOCK
    expect(body[1]).toEqual({ date: '2026-01-11', pass: 0, flag: 0, block: 1, skip: 0 })
    // Day 3: eng = PASS
    expect(body[2]).toEqual({ date: '2026-01-12', pass: 1, flag: 0, block: 0, skip: 0 })
  })

  it('returns verdict counts for qa stage', async () => {
    const { pg } = getTestDb()
    await seedTestData(pg)

    const res = await app.request('/api/trends/verdicts?repoId=100&stage=qa')
    const body = await res.json()

    expect(body).toHaveLength(3)
    // Day 1: qa = FLAG
    expect(body[0]).toEqual({ date: '2026-01-10', pass: 0, flag: 1, block: 0, skip: 0 })
    // Day 2: qa = PASS
    expect(body[1]).toEqual({ date: '2026-01-11', pass: 1, flag: 0, block: 0, skip: 0 })
    // Day 3: qa = SKIP
    expect(body[2]).toEqual({ date: '2026-01-12', pass: 0, flag: 0, block: 0, skip: 1 })
  })
})

describe('GET /api/trends/findings', () => {
  it('returns 400 when repoId is missing', async () => {
    const res = await app.request('/api/trends/findings')
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('repoId')
  })

  it('returns empty array when no completed runs exist', async () => {
    const res = await app.request('/api/trends/findings?repoId=999')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns finding counts bucketed by date', async () => {
    const { pg } = getTestDb()
    await seedTestData(pg)

    const res = await app.request('/api/trends/findings?repoId=100')
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body).toHaveLength(3)
    expect(body[0].date).toBe('2026-01-10')
    expect(body[1].date).toBe('2026-01-11')
    expect(body[2].date).toBe('2026-01-12')

    // Day 1: 1 critical, 2 notable, 0 minor
    expect(body[0]).toEqual({ date: '2026-01-10', critical: 1, notable: 2, minor: 0 })
    // Day 2: 0 critical, 1 notable, 3 minor
    expect(body[1]).toEqual({ date: '2026-01-11', critical: 0, notable: 1, minor: 3 })
    // Day 3: 0 findings — should still appear with all zeros since the pipeline ran
    expect(body[2]).toEqual({ date: '2026-01-12', critical: 0, notable: 0, minor: 0 })
  })
})
