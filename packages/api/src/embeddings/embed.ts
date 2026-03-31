/**
 * Finding text normalization and batch embedding.
 *
 * normalizeFindingText() produces a structured text representation of each
 * finding for consistent embeddings. embedTexts() calls Voyage AI in a single
 * batch. embedPipelineFindings() is the top-level function called by the
 * orchestrator after pipeline completion.
 */

import { eq } from 'drizzle-orm'
import { db, rawDb } from '../db/client'
import { findings as findingsTable, stageResults } from '../db/schema'
import { voyage, EMBEDDING_MODEL } from './client'
import { initVecTable, insertFindingEmbeddings } from './store'
import { logger } from '../lib/logger'

// ── Types ────────────────────────────────────────────────────────────────────

interface FindingForEmbed {
  severity: string
  category: string
  title: string
  description: string
  filePath?: string | null
  suggestion?: string | null
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build structured text from a finding for embedding.
 * Includes severity, category, title, description, and optionally filePath/suggestion.
 */
export function normalizeFindingText(finding: FindingForEmbed): string {
  const parts = [
    `[${finding.severity}] ${finding.category}: ${finding.title}`,
    finding.description,
  ]
  if (finding.filePath) parts.push(`File: ${finding.filePath}`)
  if (finding.suggestion) parts.push(`Suggestion: ${finding.suggestion}`)
  return parts.join('\n')
}

/**
 * Batch embed multiple texts via Voyage AI.
 * Returns one Float32Array per input text.
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (!voyage) {
    throw new Error('Voyage AI client not configured (VOYAGE_API_KEY missing)')
  }

  const response = await voyage.embed({
    input: texts,
    model: EMBEDDING_MODEL,
    inputType: 'document',
  })

  return response.data!.map((item) =>
    new Float32Array(item.embedding!)
  )
}

/**
 * Top-level function called by the orchestrator after pipeline COMPLETED.
 * Loads findings from DB, normalizes text, embeds via Voyage AI, and inserts
 * into the vec0 virtual table. Fire-and-forget -- caller should .catch() errors.
 */
export async function embedPipelineFindings(runId: string, repoFullName: string): Promise<void> {
  if (!voyage) {
    logger.warn({ runId }, 'Skipping embedding: VOYAGE_API_KEY not configured')
    return
  }

  // Ensure vec0 table exists
  initVecTable(rawDb)

  // Load all findings for this pipeline run, joined with stage info
  const runFindings = db
    .select({
      id: findingsTable.id,
      severity: findingsTable.severity,
      category: findingsTable.category,
      title: findingsTable.title,
      description: findingsTable.description,
      filePath: findingsTable.filePath,
      suggestion: findingsTable.suggestion,
      stage: stageResults.stage,
    })
    .from(findingsTable)
    .innerJoin(stageResults, eq(findingsTable.stageResultId, stageResults.id))
    .where(eq(findingsTable.pipelineRunId, runId))
    .all()

  if (runFindings.length === 0) {
    logger.info({ runId }, 'No findings to embed')
    return
  }

  // Normalize texts for embedding
  const texts = runFindings.map((f) => normalizeFindingText(f))

  // Batch embed all findings in a single API call
  const embeddings = await embedTexts(texts)

  // Prepare items for batch insert
  const items = runFindings.map((f, i) => ({
    findingId: f.id,
    embedding: embeddings[i],
    metadata: {
      repoFullName,
      stage: f.stage,
      severity: f.severity,
      title: f.title,
      description: f.description,
      filePath: f.filePath,
    },
  }))

  // Batch insert into vec_findings
  insertFindingEmbeddings(rawDb, items)

  logger.info(
    { runId, count: runFindings.length },
    'Finding embeddings stored'
  )
}
