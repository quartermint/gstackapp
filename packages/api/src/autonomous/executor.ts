// ── Autonomous GSD Executor ──────────────────────────────────────────────────
// Async generator that wraps GSD CLI commands for autonomous execution.
// Per D-21, D-22, D-23: launches phase-by-phase execution, streams SSE events,
// and pauses at decision gates.

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { GateManager } from './gate-manager'
import { autonomousRuns } from '../db/schema'
import type * as schema from '../db/schema'
import type { AutonomousSSEEvent } from './events'

const GSD_TOOLS_PATH = resolve(homedir(), '.claude/get-shit-done/bin/gsd-tools.cjs')

export interface PhaseInfo {
  number: number
  name: string
  status: string
}

/**
 * Build the GSD prompt for a single phase execution.
 * Instructs the agent to run discuss -> plan -> execute for this phase.
 * Per D-12, D-14: carries ideation context and batches discussion.
 */
function buildGSDPhasePrompt(
  phase: PhaseInfo,
  projectPath: string,
  ideationContext?: string,
): string {
  const parts = [
    `Execute phase ${phase.number} (${phase.name}) of the GSD workflow for project at ${projectPath}.`,
    '',
    'Steps:',
    '1. Run /gsd:discuss-phase to frontload decisions',
    '2. Run /gsd:plan-phase to create execution plans',
    '3. Run /gsd:execute-phase to implement all plans',
    '',
    'Commit each task atomically. Report progress with structured markers:',
    '- PHASE_START: {phase_number}',
    '- COMMIT: {hash} {message}',
    '- PHASE_COMPLETE: {phase_number} {commit_count}',
    '- PHASE_FAILED: {phase_number} {error}',
  ]

  if (ideationContext) {
    parts.push(
      '',
      '## Ideation Context (from frontloading)',
      '',
      ideationContext,
    )
  }

  return parts.join('\n')
}

/**
 * Discover phases from the project's GSD roadmap.
 * Runs gsd-tools init to get phase information.
 */
async function discoverPhases(projectPath: string): Promise<PhaseInfo[]> {
  return new Promise((resolve, reject) => {
    const args = ['init', 'plan-phase', '0']
    const child = spawn('node', [GSD_TOOLS_PATH, ...args], {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    child.on('close', (code) => {
      if (code !== 0) {
        // Fallback: return empty phases if discovery fails
        // The executor will handle this gracefully
        resolve([])
        return
      }

      try {
        const parsed = JSON.parse(stdout)
        const phases: PhaseInfo[] = (parsed.phases || []).map((p: { number: number; name: string; status?: string }) => ({
          number: p.number,
          name: p.name,
          status: p.status || 'pending',
        }))
        resolve(phases)
      } catch {
        // If output isn't valid JSON, return empty
        resolve([])
      }
    })

    child.on('error', () => {
      resolve([])
    })
  })
}

/**
 * Parse agent output for GSD progress markers.
 * Returns structured events from raw text output.
 */
function parseProgressMarkers(text: string, currentPhase: number): AutonomousSSEEvent[] {
  const events: AutonomousSSEEvent[] = []

  // Match commit patterns like "feat(N-NN): description" in git output
  const commitPattern = /([a-f0-9]{7,40})\s+(feat|fix|test|refactor|chore|docs)\([^)]+\):\s*(.+)/g
  let match: RegExpExecArray | null
  while ((match = commitPattern.exec(text)) !== null) {
    events.push({
      type: 'autonomous:commit',
      phase: currentPhase,
      hash: match[1],
      message: `${match[2]}(${match[3]})`,
      timestamp: new Date().toISOString(),
    })
  }

  // Match phase completion markers
  const phaseCompletePattern = /PHASE_COMPLETE:\s*(\d+)\s+(\d+)/
  const phaseCompleteMatch = phaseCompletePattern.exec(text)
  if (phaseCompleteMatch) {
    events.push({
      type: 'autonomous:phase:complete',
      phase: parseInt(phaseCompleteMatch[1], 10),
      commits: parseInt(phaseCompleteMatch[2], 10),
    })
  }

  // Match phase failure markers
  const phaseFailedPattern = /PHASE_FAILED:\s*(\d+)\s+(.+)/
  const phaseFailedMatch = phaseFailedPattern.exec(text)
  if (phaseFailedMatch) {
    events.push({
      type: 'autonomous:phase:failed',
      phase: parseInt(phaseFailedMatch[1], 10),
      error: phaseFailedMatch[2].trim(),
    })
  }

  return events
}

/**
 * Run autonomous GSD execution for a project.
 * Yields SSE events for phase progress, commits, gates, and completion.
 *
 * Per T-15-08: Only 1 concurrent run allowed.
 * Per T-15-09: Uses spawn (not exec) to avoid shell injection.
 */
export async function* runAutonomousExecution(
  runId: string,
  projectPath: string,
  db: BetterSQLite3Database<typeof schema>,
  gateManager: GateManager,
  ideationContext?: string,
): AsyncGenerator<AutonomousSSEEvent> {
  const startTime = Date.now()
  let totalCommits = 0

  // Check concurrency limit
  gateManager.checkConcurrencyLimit()

  // Update status to running
  db.update(autonomousRuns)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(autonomousRuns.id, runId))
    .run()

  try {
    // Phase discovery
    const phases = await discoverPhases(projectPath)

    if (phases.length === 0) {
      // If no phases found, yield error and complete
      yield { type: 'autonomous:error', message: 'No phases discovered in project roadmap. Ensure .planning/ROADMAP.md exists.' }
      db.update(autonomousRuns)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(autonomousRuns.id, runId))
        .run()
      return
    }

    // Update total phases
    db.update(autonomousRuns)
      .set({ totalPhases: phases.length })
      .where(eq(autonomousRuns.id, runId))
      .run()

    yield {
      type: 'autonomous:phases:discovered',
      phases,
    }

    // Per-phase execution loop
    const incompletePhases = phases.filter(p => p.status !== 'complete')

    for (const phase of incompletePhases) {
      yield {
        type: 'autonomous:phase:start',
        phase: phase.number,
        name: phase.name,
      }

      let phaseCommits = 0

      try {
        // Build the GSD prompt for this phase
        const prompt = buildGSDPhasePrompt(phase, projectPath, ideationContext)

        // Spawn agent as child process with structured output
        // Per T-15-09: use spawn with args array, not exec with string concatenation
        const agentEvents = await executePhaseAgent(projectPath, prompt, phase.number)

        for (const event of agentEvents) {
          if (event.type === 'autonomous:commit') {
            phaseCommits++
            totalCommits++
          }
          yield event
        }

        yield {
          type: 'autonomous:phase:complete',
          phase: phase.number,
          commits: phaseCommits,
        }

        // Update DB
        db.update(autonomousRuns)
          .set({
            completedPhases: phase.number,
            totalCommits,
          })
          .where(eq(autonomousRuns.id, runId))
          .run()

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        yield {
          type: 'autonomous:phase:failed',
          phase: phase.number,
          error: errorMessage,
        }

        // Don't fail the entire run on a single phase failure
        // Continue to next phase
      }
    }

    // Completion
    const elapsedMs = Date.now() - startTime

    db.update(autonomousRuns)
      .set({ status: 'complete', completedAt: new Date(), totalCommits })
      .where(eq(autonomousRuns.id, runId))
      .run()

    yield {
      type: 'autonomous:complete',
      totalPhases: phases.length,
      totalCommits,
      elapsedMs,
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    db.update(autonomousRuns)
      .set({ status: 'failed', completedAt: new Date() })
      .where(eq(autonomousRuns.id, runId))
      .run()

    yield { type: 'autonomous:error', message: errorMessage }
  }
}

/**
 * Execute a single phase by spawning a GSD agent process.
 * Returns parsed events from the agent's output.
 * Per T-15-09: Uses spawn with args array to prevent shell injection.
 */
async function executePhaseAgent(
  projectPath: string,
  prompt: string,
  phaseNumber: number,
): Promise<AutonomousSSEEvent[]> {
  return new Promise((resolve, reject) => {
    // Use node to run gsd-tools with the phase execution command
    const child = spawn('node', [GSD_TOOLS_PATH, 'execute', String(phaseNumber)], {
      cwd: projectPath,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    // Write the prompt to stdin
    child.stdin.write(prompt)
    child.stdin.end()

    child.on('close', (code) => {
      const events = parseProgressMarkers(stdout, phaseNumber)

      if (code !== 0 && events.length === 0) {
        // Only reject if no events were parsed and the process failed
        reject(new Error(`Phase ${phaseNumber} agent exited with code ${code}: ${stderr.slice(0, 500)}`))
      } else {
        resolve(events)
      }
    })

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn phase agent: ${err.message}`))
    })
  })
}
