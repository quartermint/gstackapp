/**
 * Embedding infrastructure tests (XREP-01)
 *
 * Tests sqlite-vec loading, finding text normalization, vec0 table operations,
 * KNN search, and cross-repo filtering.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import './helpers/test-db'
import { getTestDb, resetTestDb } from './helpers/test-db'

describe('sqlite-vec loading', () => {
  it('loads and returns a version string', () => {
    const { sqlite } = getTestDb()
    const result = sqlite.prepare('SELECT vec_version() as version').get() as { version: string }
    expect(result.version).toBeTruthy()
    expect(typeof result.version).toBe('string')
  })
})

describe('normalizeFindingText', () => {
  it('produces structured text with severity, category, title, description', async () => {
    const { normalizeFindingText } = await import('../embeddings/embed')
    const text = normalizeFindingText({
      severity: 'critical',
      category: 'security',
      title: 'SQL injection vulnerability',
      description: 'User input is passed directly to SQL query',
      filePath: null,
      suggestion: null,
    })
    expect(text).toContain('[critical]')
    expect(text).toContain('security')
    expect(text).toContain('SQL injection vulnerability')
    expect(text).toContain('User input is passed directly to SQL query')
  })

  it('includes filePath and suggestion when present', async () => {
    const { normalizeFindingText } = await import('../embeddings/embed')
    const text = normalizeFindingText({
      severity: 'notable',
      category: 'performance',
      title: 'N+1 query detected',
      description: 'Loop queries database on each iteration',
      filePath: 'src/api/users.ts',
      suggestion: 'Use batch query instead',
    })
    expect(text).toContain('File: src/api/users.ts')
    expect(text).toContain('Suggestion: Use batch query instead')
  })

  it('omits filePath and suggestion when null', async () => {
    const { normalizeFindingText } = await import('../embeddings/embed')
    const text = normalizeFindingText({
      severity: 'minor',
      category: 'style',
      title: 'Inconsistent naming',
      description: 'Use camelCase for variable names',
      filePath: null,
      suggestion: null,
    })
    expect(text).not.toContain('File:')
    expect(text).not.toContain('Suggestion:')
  })
})

describe('vec0 table operations', () => {
  it('initVecTable creates the virtual table without error', async () => {
    const { sqlite } = getTestDb()
    const { initVecTable } = await import('../embeddings/store')
    // Should not throw
    expect(() => initVecTable(sqlite)).not.toThrow()
  })

  it('insertFindingEmbedding stores and retrieves by finding_id', async () => {
    const { sqlite } = getTestDb()
    const { initVecTable, insertFindingEmbedding } = await import('../embeddings/store')
    initVecTable(sqlite)

    const embedding = new Float32Array(1024)
    embedding[0] = 1.0 // unit vector in first dimension

    insertFindingEmbedding(sqlite, 'finding-001', embedding, {
      repoFullName: 'owner/repo-a',
      stage: 'security',
      severity: 'critical',
      title: 'SQL injection',
      description: 'Input not sanitized',
      filePath: 'src/db.ts',
    })

    // Verify it was stored by querying the vec table
    const result = sqlite.prepare(
      'SELECT finding_id, repo_full_name, stage, severity FROM vec_findings WHERE finding_id = ?'
    ).get('finding-001') as any
    expect(result).toBeTruthy()
    expect(result.finding_id).toBe('finding-001')
    expect(result.repo_full_name).toBe('owner/repo-a')
    expect(result.stage).toBe('security')
    expect(result.severity).toBe('critical')
  })
})

describe('KNN cross-repo search', () => {
  beforeEach(async () => {
    const { sqlite } = getTestDb()
    const { initVecTable } = await import('../embeddings/store')
    initVecTable(sqlite)
  })

  it('returns matches sorted by distance', async () => {
    const { sqlite } = getTestDb()
    const { insertFindingEmbedding } = await import('../embeddings/store')
    const { findCrossRepoMatches } = await import('../embeddings/search')

    // Create query vector (unit vector in dimension 0)
    const queryVec = new Float32Array(1024)
    queryVec[0] = 1.0

    // Insert a similar vector (close to queryVec) from different repo
    const similar = new Float32Array(1024)
    similar[0] = 0.99
    similar[1] = 0.14
    insertFindingEmbedding(sqlite, 'f-similar', similar, {
      repoFullName: 'owner/repo-b',
      stage: 'eng',
      severity: 'notable',
      title: 'Similar finding',
      description: 'Almost identical issue',
      filePath: 'src/similar.ts',
    })

    // Insert another but less similar vector from different repo
    const lessSimilar = new Float32Array(1024)
    lessSimilar[0] = 0.9
    lessSimilar[1] = 0.44
    insertFindingEmbedding(sqlite, 'f-less-similar', lessSimilar, {
      repoFullName: 'owner/repo-c',
      stage: 'qa',
      severity: 'minor',
      title: 'Less similar finding',
      description: 'Somewhat related',
      filePath: 'src/other.ts',
    })

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.5, 5)
    expect(matches.length).toBeGreaterThanOrEqual(2)
    // Should be sorted by distance (ascending)
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].distance).toBeGreaterThanOrEqual(matches[i - 1].distance)
    }
  })

  it('excludes same-repo findings', async () => {
    const { sqlite } = getTestDb()
    const { insertFindingEmbedding } = await import('../embeddings/store')
    const { findCrossRepoMatches } = await import('../embeddings/search')

    const queryVec = new Float32Array(1024)
    queryVec[0] = 1.0

    // Insert identical vector from SAME repo
    const sameRepoVec = new Float32Array(1024)
    sameRepoVec[0] = 1.0
    insertFindingEmbedding(sqlite, 'f-same-repo', sameRepoVec, {
      repoFullName: 'owner/repo-a',
      stage: 'eng',
      severity: 'critical',
      title: 'Same repo finding',
      description: 'This should be excluded',
      filePath: null,
    })

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.5, 5)
    expect(matches.every((m) => m.repo_full_name !== 'owner/repo-a')).toBe(true)
  })

  it('filters by cosine similarity threshold', async () => {
    const { sqlite } = getTestDb()
    const { insertFindingEmbedding } = await import('../embeddings/store')
    const { findCrossRepoMatches } = await import('../embeddings/search')

    const queryVec = new Float32Array(1024)
    queryVec[0] = 1.0

    // Insert a dissimilar vector (orthogonal - cosine distance ~1.0)
    const dissimilar = new Float32Array(1024)
    dissimilar[1] = 1.0 // perpendicular to queryVec
    insertFindingEmbedding(sqlite, 'f-dissimilar', dissimilar, {
      repoFullName: 'owner/repo-b',
      stage: 'eng',
      severity: 'minor',
      title: 'Dissimilar finding',
      description: 'Completely unrelated',
      filePath: null,
    })

    // With threshold 0.85 (maxDistance = 0.15), dissimilar should be excluded
    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.85, 5)
    expect(matches.length).toBe(0)
  })

  it('excludes findings with feedbackVote=down (false positives)', async () => {
    const { sqlite } = getTestDb()
    const { insertFindingEmbedding } = await import('../embeddings/store')
    const { findCrossRepoMatches } = await import('../embeddings/search')

    const queryVec = new Float32Array(1024)
    queryVec[0] = 1.0

    // Insert a matching vector from different repo
    const matchVec = new Float32Array(1024)
    matchVec[0] = 0.99
    matchVec[1] = 0.14
    insertFindingEmbedding(sqlite, 'f-false-positive', matchVec, {
      repoFullName: 'owner/repo-b',
      stage: 'eng',
      severity: 'critical',
      title: 'False positive finding',
      description: 'Marked as false positive',
      filePath: 'src/test.ts',
    })

    // Mark finding as false positive in the findings table
    // First insert prerequisite records
    sqlite.prepare(`
      INSERT OR IGNORE INTO github_installations (id, account_login, account_type, app_id) VALUES (?, ?, ?, ?)
    `).run(1, 'owner', 'User', 1)
    sqlite.prepare(`
      INSERT OR IGNORE INTO repositories (id, installation_id, full_name) VALUES (?, ?, ?)
    `).run(1, 1, 'owner/repo-b')
    sqlite.prepare(`
      INSERT OR IGNORE INTO pull_requests (repo_id, number, title, author_login, head_sha, base_branch) VALUES (?, ?, ?, ?, ?, ?)
    `).run(1, 1, 'Test PR', 'user', 'abc123', 'main')
    sqlite.prepare(`
      INSERT OR IGNORE INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha) VALUES (?, ?, ?, ?, ?)
    `).run('run-1', 'del-1', 1, 1, 'abc123')
    sqlite.prepare(`
      INSERT OR IGNORE INTO stage_results (id, pipeline_run_id, stage) VALUES (?, ?, ?)
    `).run('sr-1', 'run-1', 'eng')
    sqlite.prepare(`
      INSERT OR IGNORE INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description, feedback_vote)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('f-false-positive', 'sr-1', 'run-1', 'critical', 'security', 'False positive finding', 'Marked as false positive', 'down')

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.5, 5)
    expect(matches.every((m) => m.finding_id !== 'f-false-positive')).toBe(true)
  })
})
