import { describe, it, expect } from 'vitest'
import { getTestDb } from './helpers/test-db'
import app from '../index'

// ── Seed Data Helper ────────────────────────────────────────────────────────

function seedPipelineData() {
  const { sqlite } = getTestDb()

  // Insert installation
  sqlite.exec(`
    INSERT INTO github_installations (id, account_login, account_type, app_id)
    VALUES (1, 'testorg', 'Organization', 12345)
  `)

  // Insert repository
  sqlite.exec(`
    INSERT INTO repositories (id, installation_id, full_name, default_branch, is_active)
    VALUES (100, 1, 'testorg/testrepo', 'main', 1)
  `)

  // Insert pull request
  sqlite.exec(`
    INSERT INTO pull_requests (id, repo_id, number, title, author_login, head_sha, base_branch, state)
    VALUES (200, 100, 42, 'Add login feature', 'devuser', 'abc123def', 'main', 'open')
  `)

  // Insert pipeline run
  sqlite.exec(`
    INSERT INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha, status)
    VALUES ('run-001', 'delivery-001', 200, 1, 'abc123def', 'COMPLETED')
  `)

  // Insert stage results
  sqlite.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict, summary, duration_ms)
    VALUES ('sr-ceo', 'run-001', 'ceo', 'PASS', 'Looks good', 1200)
  `)
  sqlite.exec(`
    INSERT INTO stage_results (id, pipeline_run_id, stage, verdict, summary, duration_ms)
    VALUES ('sr-eng', 'run-001', 'eng', 'FLAG', 'Some issues found', 2300)
  `)

  // Insert findings for eng stage
  sqlite.exec(`
    INSERT INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description, file_path, line_start, line_end, suggestion, code_snippet)
    VALUES ('f-001', 'sr-eng', 'run-001', 'notable', 'performance', 'N+1 query', 'Potential N+1 query in user loader', 'src/users.ts', 42, 50, 'Use batch loading', 'const user = await db.find(id)')
  `)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/pipelines', () => {
  it('returns 200 with empty array when no data exists', async () => {
    const res = await app.request('/api/pipelines')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toEqual([])
  })

  it('returns pipeline list with joined PR/repo/stage data after seeding', async () => {
    seedPipelineData()

    const res = await app.request('/api/pipelines')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveLength(1)

    const run = body[0]
    expect(run.id).toBe('run-001')
    expect(run.status).toBe('COMPLETED')
    expect(run.headSha).toBe('abc123def')
    expect(run.reviewUnit.type).toBe('pr')
    expect(run.reviewUnit.prNumber).toBe(42)
    expect(run.reviewUnit.title).toBe('Add login feature')
    expect(run.reviewUnit.authorLogin).toBe('devuser')
    expect(run.reviewUnit.ref).toBe('main')
    expect(run.repo.fullName).toBe('testorg/testrepo')
    expect(run.stages).toHaveLength(2)
    expect(run.stages.map((s: { stage: string }) => s.stage).sort()).toEqual(['ceo', 'eng'])
  })
})

describe('GET /api/pipelines/:id', () => {
  it('returns 404 for non-existent pipeline ID', async () => {
    const res = await app.request('/api/pipelines/nonexistent')
    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.error).toBe('Pipeline run not found')
  })

  it('returns full pipeline with stage results and nested findings', async () => {
    seedPipelineData()

    const res = await app.request('/api/pipelines/run-001')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.id).toBe('run-001')
    expect(body.status).toBe('COMPLETED')
    expect(body.reviewUnit.prNumber).toBe(42)
    expect(body.repo.fullName).toBe('testorg/testrepo')

    // Stage results with full details
    expect(body.stages).toHaveLength(2)

    const engStage = body.stages.find((s: { stage: string }) => s.stage === 'eng')
    expect(engStage).toBeDefined()
    expect(engStage.verdict).toBe('FLAG')
    expect(engStage.summary).toBe('Some issues found')
    expect(engStage.durationMs).toBe(2300)

    // Nested findings under eng stage
    expect(engStage.findings).toHaveLength(1)
    const finding = engStage.findings[0]
    expect(finding.id).toBe('f-001')
    expect(finding.severity).toBe('notable')
    expect(finding.category).toBe('performance')
    expect(finding.title).toBe('N+1 query')
    expect(finding.filePath).toBe('src/users.ts')
    expect(finding.lineStart).toBe(42)
    expect(finding.suggestion).toBe('Use batch loading')

    // CEO stage should have no findings
    const ceoStage = body.stages.find((s: { stage: string }) => s.stage === 'ceo')
    expect(ceoStage.findings).toHaveLength(0)
  })

  it('returns crossRepoMatches field in response (empty when no embeddings)', async () => {
    seedPipelineData()

    const res = await app.request('/api/pipelines/run-001')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('crossRepoMatches')
    expect(Array.isArray(body.crossRepoMatches)).toBe(true)
    expect(body.crossRepoMatches).toHaveLength(0)
  })
})
