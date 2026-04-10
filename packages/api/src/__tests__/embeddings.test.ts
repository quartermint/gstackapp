/**
 * Embedding infrastructure tests (XREP-01)
 *
 * Tests finding text normalization and embedding ingestion logic.
 * Vector operations (pgvector KNN) are tested via integration tests
 * against Neon -- PGlite does not include pgvector.
 */

import { describe, it, expect, vi } from 'vitest'
import './helpers/test-db'
import { getTestDb } from './helpers/test-db'

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

describe('embedding ingestion integration', () => {
  it('non-fatal on embedding failure (embedTexts throws but caller catches)', async () => {
    const { resetVoyageClient } = await import('../embeddings/client')
    resetVoyageClient(null)

    const { embedTexts } = await import('../embeddings/embed')
    await expect(embedTexts(['test text'])).rejects.toThrow()
  })

  it('skips embedding when voyage client is null', async () => {
    const { resetVoyageClient } = await import('../embeddings/client')
    resetVoyageClient(null)

    const { embedPipelineFindings } = await import('../embeddings/embed')
    // Should not throw -- returns early when voyage is null
    await embedPipelineFindings('run-embed', 'testowner/testrepo')
  })
})

// Vector-dependent tests (initVecTable, insertFindingEmbedding, KNN search)
// require pgvector which is not available in PGlite.
// These are covered by integration tests against Neon.
describe.skip('pgvector operations (requires Neon)', () => {
  it.todo('initVecTable creates the finding_embeddings table with vector column')
  it.todo('insertFindingEmbedding stores and retrieves by finding_id')
  it.todo('batch insert stores multiple embeddings')
  it.todo('KNN search returns matches sorted by cosine distance')
})
