/**
 * Cross-repo similarity search tests (XREP-02)
 *
 * These tests require pgvector which is not available in PGlite.
 * Skipped for local testing -- covered by integration tests against Neon.
 */

import { describe, it } from 'vitest'

describe.skip('cross-repo search (requires pgvector on Neon)', () => {
  it.todo('above threshold: returns matches when cosine similarity exceeds threshold')
  it.todo('below threshold: returns empty when cosine similarity is below threshold')
  it.todo('excludes same-repo: identical vector from same repo not returned')
  it.todo('excludes false positives: findings with feedbackVote=down filtered out')
  it.todo('returns top-k results: limits matches to k')
  it.todo('returns distance field: each match includes a numeric distance')
})
