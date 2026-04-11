/**
 * File watcher — polls /tmp/pipeline-{id}/ for progress and gate files.
 *
 * Per D-09: Hybrid polling. Server polls output directory every 2 seconds.
 * Callback triggers final sweep for immediate completion.
 *
 * T-17-15: Validates outputDir starts with /tmp/pipeline- prefix.
 * Only reads .json files. Parses with try/catch.
 * T-17-18: Only watches directories matching /tmp/pipeline-{requestId}/.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pipelineBus } from '../events/bus'

// Track active watchers and processed files per pipeline
const activeWatchers = new Map<string, ReturnType<typeof setInterval>>()
const processedFiles = new Map<string, Set<string>>()

/**
 * Validate that the output directory is within the expected /tmp/pipeline-* path.
 * T-17-15, T-17-18: Prevent directory traversal.
 */
function validateOutputDir(outputDir: string): boolean {
  const prefix = join(tmpdir(), 'pipeline-')
  return outputDir.startsWith(prefix)
}

/**
 * Process a single progress file and emit appropriate event.
 */
function processProgressFile(pipelineId: string, outputDir: string, filename: string): void {
  try {
    const content = readFileSync(join(outputDir, filename), 'utf-8')
    const data = JSON.parse(content)

    pipelineBus.emit('pipeline:event', {
      type: 'operator:progress',
      runId: pipelineId,
      stage: data.stage,
      status: data.status,
      message: data.message,
      result: data.result,
      timestamp: data.timestamp || new Date().toISOString(),
    })
  } catch {
    // Gracefully handle malformed JSON or read errors
    console.error(`[file-watcher] Failed to process ${filename} for pipeline ${pipelineId}`)
  }
}

/**
 * Process a gate file and emit gate event.
 */
function processGateFile(pipelineId: string, outputDir: string, filename: string): void {
  try {
    const content = readFileSync(join(outputDir, filename), 'utf-8')
    const data = JSON.parse(content)

    pipelineBus.emit('pipeline:event', {
      type: 'operator:gate',
      runId: pipelineId,
      gateId: data.id,
      title: data.title,
      description: data.description,
      options: data.options,
      timestamp: new Date().toISOString(),
    })
  } catch {
    console.error(`[file-watcher] Failed to process gate ${filename} for pipeline ${pipelineId}`)
  }
}

/**
 * Poll the output directory for new files.
 */
function pollDirectory(pipelineId: string, outputDir: string): void {
  const seen = processedFiles.get(pipelineId) ?? new Set<string>()

  let files: string[]
  try {
    files = readdirSync(outputDir)
  } catch {
    return // Directory may not exist yet
  }

  for (const file of files) {
    if (seen.has(file)) continue
    if (!file.endsWith('.json')) continue

    // Progress files: progress-NNN.json
    if (file.startsWith('progress-')) {
      processProgressFile(pipelineId, outputDir, file)
      seen.add(file)
    }

    // Gate files: gate-{id}.json (but NOT gate-{id}-response.json)
    if (file.startsWith('gate-') && !file.includes('-response')) {
      processGateFile(pipelineId, outputDir, file)
      seen.add(file)
    }

    // Result file: result.json
    if (file === 'result.json') {
      seen.add(file)
    }
  }

  processedFiles.set(pipelineId, seen)
}

/**
 * Start watching a pipeline's output directory for progress files.
 * Polls every 2 seconds (D-09: hybrid polling).
 */
export function watchPipelineOutput(pipelineId: string, outputDir: string): void {
  if (!validateOutputDir(outputDir)) {
    console.error(`[file-watcher] Invalid output directory: ${outputDir}`)
    return
  }

  // Initialize processed files set
  processedFiles.set(pipelineId, new Set<string>())

  // Poll every 2 seconds
  const interval = setInterval(() => {
    pollDirectory(pipelineId, outputDir)
  }, 2000)

  activeWatchers.set(pipelineId, interval)
}

/**
 * Stop watching a pipeline's output directory.
 * Clears the polling interval and cleans up tracked state.
 */
export function stopWatching(pipelineId: string): void {
  const interval = activeWatchers.get(pipelineId)
  if (interval) {
    clearInterval(interval)
    activeWatchers.delete(pipelineId)
  }
  processedFiles.delete(pipelineId)
}

/**
 * Process any unread files in the output directory.
 * Called on completion callback to ensure no events are missed.
 */
export function finalSweep(pipelineId: string, outputDir: string): void {
  if (!validateOutputDir(outputDir)) return

  // Initialize if not already tracking
  if (!processedFiles.has(pipelineId)) {
    processedFiles.set(pipelineId, new Set<string>())
  }

  pollDirectory(pipelineId, outputDir)
}
