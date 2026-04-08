/**
 * Capability matrix: stores empirical model quality scores per task type.
 *
 * The matrix is a JSON file on disk, populated by the eval suite (packages/harness/src/eval/).
 * The task classifier consults it for model recommendations when routing.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export interface CapabilityEntry {
  taskType: string
  model: string
  qualityScore: number      // 0-1
  latencyMs: number
  costPerMToken: number     // 0 for local
  recommended: boolean
  sampleSize: number
}

export interface CapabilityMatrix {
  version: string
  lastUpdated: string
  entries: CapabilityEntry[]
}

const MATRIX_PATH = process.env.CAPABILITY_MATRIX_PATH ?? '.gstackapp/capability-matrix.json'

export function loadMatrix(path?: string): CapabilityMatrix {
  const p = path ?? MATRIX_PATH
  if (!existsSync(p)) {
    return { version: '1.0', lastUpdated: new Date().toISOString(), entries: [] }
  }
  return JSON.parse(readFileSync(p, 'utf-8'))
}

export function saveMatrix(matrix: CapabilityMatrix, path?: string): void {
  const p = path ?? MATRIX_PATH
  matrix.lastUpdated = new Date().toISOString()
  writeFileSync(p, JSON.stringify(matrix, null, 2))
}

export function getRecommendedModel(taskType: string, matrix: CapabilityMatrix): string | null {
  const candidates = matrix.entries
    .filter(e => e.taskType === taskType && e.recommended)
    .sort((a, b) => b.qualityScore - a.qualityScore)
  return candidates[0]?.model ?? null
}
