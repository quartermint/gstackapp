/**
 * Ideation pipeline orchestrator.
 *
 * Chains 4 skill stages (office-hours -> CEO review -> eng review -> design consultation)
 * as an async generator, yielding typed SSE events for browser consumption.
 *
 * Per D-05, D-06: Sequential pipeline with cumulative artifact context.
 * Per D-08: No repo required — idea-first ideation.
 */

import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { db } from '../db/client'
import { ideationSessions, ideationArtifacts } from '../db/schema'
import { runAgentLoop } from '../agent/loop'
import type { AgentSSEEvent } from '../agent/stream-bridge'
import {
  IDEATION_STAGES,
  buildCumulativeContext,
  buildIdeationPrompt,
  getStageDisplayName,
} from './skill-bridge'

// ── Types ──────────────────────────────────────────────────────────────────

export type IdeationSSEEvent =
  | { type: 'ideation:stage:start'; stage: string; displayName: string }
  | { type: 'ideation:stage:event'; stage: string; event: AgentSSEEvent }
  | { type: 'ideation:stage:complete'; stage: string }
  | { type: 'ideation:stage:artifact'; stage: string; path: string; title?: string }
  | { type: 'ideation:stage:error'; stage: string; error: string }
  | { type: 'ideation:pipeline:complete'; sessionId: string }

export interface IdeationPipeline {
  id: string
  sessionId: string
  agentSessionId?: string
  userIdea: string
  stages: Map<string, 'pending' | 'running' | 'complete' | 'error'>
  artifacts: Map<string, string>
  status: 'running' | 'complete' | 'failed' | 'paused'
}

// ── Pipeline Runner ────────────────────────────────────────────────────────

/**
 * Run the ideation pipeline as an async generator.
 *
 * Iterates through IDEATION_STAGES sequentially, calling runAgentLoop
 * for each stage with the cumulative context from prior stages.
 *
 * Per D-01: Uses runAgentLoop with skill prompt as system context.
 * Per T-15-03: maxBudgetUsd 3.0 and maxTurns 50 per stage.
 */
export async function* runIdeationPipeline(
  pipeline: IdeationPipeline
): AsyncGenerator<IdeationSSEEvent> {
  for (const stage of IDEATION_STAGES) {
    pipeline.stages.set(stage, 'running')

    // Update DB with current stage
    db.update(ideationSessions)
      .set({ currentStage: stage, status: 'running' })
      .where(eq(ideationSessions.id, pipeline.id))
      .run()

    yield {
      type: 'ideation:stage:start',
      stage,
      displayName: getStageDisplayName(stage),
    }

    try {
      // Build prompt with cumulative context from prior stages
      const priorContext = buildCumulativeContext(pipeline.artifacts)
      const prompt = buildIdeationPrompt(stage, priorContext, pipeline.userIdea)

      // Run agent loop — per D-08: no projectPath for repo-less sessions
      // Per T-15-03: budget and turn limits per stage
      for await (const event of runAgentLoop({
        prompt,
        maxTurns: 50,
        maxBudgetUsd: 3.0,
      })) {
        yield { type: 'ideation:stage:event', stage, event }
      }

      // Check for new artifacts after stage completion
      const artifactPath = await detectNewArtifact(stage)
      if (artifactPath) {
        // T-15-05: Artifact paths are system-generated, not user-supplied
        const excerpt = getArtifactExcerpt(artifactPath)
        const title = getArtifactTitle(artifactPath, stage)

        db.insert(ideationArtifacts).values({
          id: nanoid(),
          ideationSessionId: pipeline.id,
          stage,
          artifactPath,
          title,
          excerpt,
        }).run()

        pipeline.artifacts.set(stage, artifactPath)

        yield {
          type: 'ideation:stage:artifact',
          stage,
          path: artifactPath,
          title: title ?? undefined,
        }
      }

      pipeline.stages.set(stage, 'complete')

      // Update DB status between stages
      db.update(ideationSessions)
        .set({ status: 'stage_complete' })
        .where(eq(ideationSessions.id, pipeline.id))
        .run()

      yield { type: 'ideation:stage:complete', stage }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      pipeline.stages.set(stage, 'error')
      pipeline.status = 'failed'

      db.update(ideationSessions)
        .set({ status: 'failed' })
        .where(eq(ideationSessions.id, pipeline.id))
        .run()

      yield { type: 'ideation:stage:error', stage, error: errorMessage }
      return // Stop pipeline on error
    }
  }

  // All stages complete
  pipeline.status = 'complete'
  db.update(ideationSessions)
    .set({ status: 'complete', currentStage: null })
    .where(eq(ideationSessions.id, pipeline.id))
    .run()

  yield { type: 'ideation:pipeline:complete', sessionId: pipeline.id }
}

// ── Artifact Detection ─────────────────────────────────────────────────────

/**
 * Detect new artifacts produced by a skill stage.
 *
 * Scans ~/.gstack/projects/ for .md files modified in the last 5 minutes.
 * Returns the most recent file path, or null.
 *
 * This is a best-effort heuristic — skills write design docs to this directory.
 */
export async function detectNewArtifact(stage: string): Promise<string | null> {
  const projectsDir = join(homedir(), '.gstack', 'projects')

  try {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    const recentFiles: { path: string; mtime: number }[] = []

    scanForRecentFiles(projectsDir, fiveMinutesAgo, recentFiles)

    if (recentFiles.length === 0) return null

    // Return the most recently modified file
    recentFiles.sort((a, b) => b.mtime - a.mtime)
    return recentFiles[0].path
  } catch {
    // Directory may not exist yet — that's fine
    return null
  }
}

/**
 * Recursively scan a directory for .md files modified after a given timestamp.
 * Limited to 2 levels of depth to avoid scanning too deeply.
 */
function scanForRecentFiles(
  dir: string,
  afterMs: number,
  results: { path: string; mtime: number }[],
  depth = 0
): void {
  if (depth > 2) return

  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        scanForRecentFiles(fullPath, afterMs, results, depth + 1)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const stat = statSync(fullPath)
        if (stat.mtimeMs > afterMs) {
          results.push({ path: fullPath, mtime: stat.mtimeMs })
        }
      }
    }
  } catch {
    // Permission errors or missing dirs are OK
  }
}

/**
 * Read the first 500 chars of an artifact file as an excerpt.
 */
function getArtifactExcerpt(filePath: string): string | null {
  try {
    const { readFileSync } = require('node:fs')
    const content = readFileSync(filePath, 'utf-8')
    return content.slice(0, 500) || null
  } catch {
    return null
  }
}

/**
 * Derive an artifact title from file path or stage name.
 */
function getArtifactTitle(filePath: string, stage: string): string | null {
  const { basename } = require('node:path')
  const fileName = basename(filePath, '.md')

  // If the filename is meaningful, use it
  if (fileName && fileName !== 'index' && fileName !== 'README') {
    return fileName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase())
  }

  return `${getStageDisplayName(stage)} Output`
}

// Re-export stages for use by routes
export { IDEATION_STAGES } from './skill-bridge'
