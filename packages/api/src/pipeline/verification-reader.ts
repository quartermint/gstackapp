/**
 * Verification report reader — parses pipeline result.json into plain-language reports.
 *
 * Per OP-05: Verification failure results are parsed into plain-language reports.
 * T-18-07: Only reads from validated /tmp/pipeline-{id}/ paths; JSON parsed with try/catch.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface VerificationReport {
  passed: boolean
  summary: string
  whatBuilt: string[]
  qualityChecks: { passed: number; total: number }
  filesChanged: number
  failureDetails?: string
}

interface RawStage {
  name: string
  status: string
  error?: string
}

interface RawResult {
  status: string
  summary?: string
  stages?: RawStage[]
  filesChanged?: number
}

/**
 * Read and parse result.json from a pipeline output directory.
 * Returns null if the file is missing or malformed.
 *
 * @param outputDir - The pipeline output directory (e.g. /tmp/pipeline-{id}/)
 */
export function readVerificationResult(outputDir: string): VerificationReport | null {
  try {
    const content = readFileSync(join(outputDir, 'result.json'), 'utf-8')
    const raw: RawResult = JSON.parse(content)

    const passed = raw.status === 'pass'
    const stages = raw.stages ?? []

    // Count passing stages
    const passedStages = stages.filter(s => s.status === 'pass').length
    const totalStages = stages.length

    // Extract what was built from passing stages
    const whatBuilt = stages
      .filter(s => s.status === 'pass')
      .map(s => s.name)

    // Build summary
    const summary = raw.summary
      ?? (passed
        ? 'All quality checks passed. Your request has been completed.'
        : 'Some quality checks found issues.')

    // Build failure details from failed stages
    let failureDetails: string | undefined
    if (!passed) {
      const failedStages = stages.filter(s => s.status !== 'pass')
      failureDetails = failedStages
        .map(s => s.error ? `${s.name}: ${s.error}` : `${s.name}: failed`)
        .join('; ')
    }

    return {
      passed,
      summary,
      whatBuilt,
      qualityChecks: { passed: passedStages, total: totalStages },
      filesChanged: raw.filesChanged ?? 0,
      ...(failureDetails ? { failureDetails } : {}),
    }
  } catch {
    // File missing or malformed JSON (T-18-07)
    return null
  }
}
