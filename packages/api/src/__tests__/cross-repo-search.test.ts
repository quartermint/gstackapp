/**
 * Cross-repo similarity search tests (XREP-02)
 *
 * Tests KNN query behavior: threshold filtering, repo exclusion,
 * false positive exclusion, top-k limits, and distance field presence.
 * Uses deterministic vectors inserted directly into vec_findings.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import './helpers/test-db'
import { getTestDb } from './helpers/test-db'
import { initVecTable, insertFindingEmbedding } from '../embeddings/store'
import { findCrossRepoMatches } from '../embeddings/search'

/** Create a unit vector with value 1.0 at the given dimension index */
function makeUnitVector(dim: number, size = 1024): Float32Array {
  const vec = new Float32Array(size)
  vec[dim] = 1.0
  return vec
}

/** Create a vector that is similar to a unit vector at dim 0 */
function makeSimilarVector(similarity: number, size = 1024): Float32Array {
  // For cosine similarity s, create vector [s, sqrt(1-s^2), 0, ...]
  const vec = new Float32Array(size)
  vec[0] = similarity
  vec[1] = Math.sqrt(1 - similarity * similarity)
  return vec
}

describe('cross-repo search', () => {
  const queryVec = makeUnitVector(0)

  beforeEach(() => {
    const { sqlite } = getTestDb()
    initVecTable(sqlite)
  })

  it('above threshold: returns matches when cosine similarity exceeds threshold', () => {
    const { sqlite } = getTestDb()

    // Insert a highly similar vector (cosine distance ~0.005) from different repo
    const similar = makeSimilarVector(0.995)
    insertFindingEmbedding(sqlite, 'f-above', similar, {
      repoFullName: 'owner/repo-b',
      stage: 'eng',
      severity: 'critical',
      title: 'Highly similar finding',
      description: 'Very close match',
      filePath: 'src/auth.ts',
    })

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.85, 5)
    expect(matches.length).toBe(1)
    expect(matches[0].finding_id).toBe('f-above')
    expect(matches[0].title).toBe('Highly similar finding')
  })

  it('below threshold: returns empty when cosine similarity is below threshold', () => {
    const { sqlite } = getTestDb()

    // Insert a dissimilar vector (perpendicular, cosine distance ~1.0)
    const dissimilar = makeUnitVector(1)
    insertFindingEmbedding(sqlite, 'f-below', dissimilar, {
      repoFullName: 'owner/repo-b',
      stage: 'eng',
      severity: 'minor',
      title: 'Dissimilar finding',
      description: 'Completely unrelated',
      filePath: null,
    })

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.85, 5)
    expect(matches.length).toBe(0)
  })

  it('excludes same-repo: identical vector from same repo not returned', () => {
    const { sqlite } = getTestDb()

    // Insert identical vector from SAME repo
    insertFindingEmbedding(sqlite, 'f-same', makeUnitVector(0), {
      repoFullName: 'owner/repo-a', // same as query repo
      stage: 'security',
      severity: 'critical',
      title: 'Same repo finding',
      description: 'Should not appear in cross-repo results',
      filePath: null,
    })

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.0, 10)
    expect(matches.length).toBe(0)
  })

  it('excludes false positives: findings with feedbackVote=down filtered out', () => {
    const { sqlite } = getTestDb()

    // Insert a matching vector
    const similar = makeSimilarVector(0.99)
    insertFindingEmbedding(sqlite, 'f-fp', similar, {
      repoFullName: 'owner/repo-b',
      stage: 'eng',
      severity: 'critical',
      title: 'False positive finding',
      description: 'Was marked down by user',
      filePath: 'src/fp.ts',
    })

    // Create the finding record with feedbackVote='down'
    sqlite.prepare(
      'INSERT OR IGNORE INTO github_installations (id, account_login, account_type, app_id) VALUES (?, ?, ?, ?)'
    ).run(1, 'owner', 'User', 1)
    sqlite.prepare(
      'INSERT OR IGNORE INTO repositories (id, installation_id, full_name) VALUES (?, ?, ?)'
    ).run(1, 1, 'owner/repo-b')
    sqlite.prepare(
      'INSERT OR IGNORE INTO pull_requests (repo_id, number, title, author_login, head_sha, base_branch) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(1, 1, 'PR', 'user', 'sha', 'main')
    sqlite.prepare(
      'INSERT OR IGNORE INTO pipeline_runs (id, delivery_id, pr_id, installation_id, head_sha) VALUES (?, ?, ?, ?, ?)'
    ).run('r1', 'd1', 1, 1, 'sha')
    sqlite.prepare(
      'INSERT OR IGNORE INTO stage_results (id, pipeline_run_id, stage) VALUES (?, ?, ?)'
    ).run('sr1', 'r1', 'eng')
    sqlite.prepare(
      'INSERT OR IGNORE INTO findings (id, stage_result_id, pipeline_run_id, severity, category, title, description, feedback_vote) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run('f-fp', 'sr1', 'r1', 'critical', 'security', 'False positive finding', 'Was marked down', 'down')

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.5, 5)
    expect(matches.every((m) => m.finding_id !== 'f-fp')).toBe(true)
  })

  it('returns top-k results: limits matches to k', () => {
    const { sqlite } = getTestDb()

    // Insert 10 similar vectors from different repos
    for (let i = 0; i < 10; i++) {
      const vec = makeSimilarVector(0.99 - i * 0.005)
      insertFindingEmbedding(sqlite, `f-${i}`, vec, {
        repoFullName: `owner/repo-${String.fromCharCode(98 + i)}`, // repo-b through repo-k
        stage: 'eng',
        severity: 'notable',
        title: `Finding ${i}`,
        description: `Similar finding number ${i}`,
        filePath: null,
      })
    }

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.5, 3)
    expect(matches.length).toBeLessThanOrEqual(3)
  })

  it('returns distance field: each match includes a numeric distance', () => {
    const { sqlite } = getTestDb()

    const similar = makeSimilarVector(0.99)
    insertFindingEmbedding(sqlite, 'f-dist', similar, {
      repoFullName: 'owner/repo-b',
      stage: 'qa',
      severity: 'notable',
      title: 'Distance test finding',
      description: 'Should have distance field',
      filePath: null,
    })

    const matches = findCrossRepoMatches(sqlite, queryVec, 'owner/repo-a', 0.5, 5)
    expect(matches.length).toBe(1)
    expect(typeof matches[0].distance).toBe('number')
    expect(matches[0].distance).toBeGreaterThanOrEqual(0)
    expect(matches[0].distance).toBeLessThan(1)
  })
})
