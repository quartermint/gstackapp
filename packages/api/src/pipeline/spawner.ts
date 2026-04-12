/**
 * Pipeline spawner — spawns Claude Code as a CLI subprocess per D-07.
 *
 * Spawns `claude -p` with structured flags, writes request.json to the
 * output directory for file-based handoff (D-08), and detaches the process.
 *
 * T-17-14: User prompt passed via file (request.json), NOT CLI args.
 * T-17-17: --max-turns 50 caps subprocess execution.
 * T-17-20: --allowedTools restricts to Read,Write,Bash,Glob,Grep.
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildPipelineSystemPrompt } from './system-prompt'
import type { GbrainCacheData } from '../gbrain/types'

export interface PipelineSpawnOptions {
  pipelineId: string
  prompt: string        // whatNeeded from intake form
  whatGood: string       // acceptance criteria from intake form
  projectPath: string
  callbackUrl: string   // http://localhost:{PORT}/api/pipeline/callback
  deadline?: string
  knowledgeContext?: GbrainCacheData  // GB-04: gbrain knowledge for subprocess
}

export interface PipelineSpawnResult {
  pid: number
  outputDir: string
}

/**
 * Spawn Claude Code as a detached subprocess for pipeline execution.
 * Creates output directory, writes request.json, spawns claude CLI.
 *
 * Per T-17-14: Never interpolates user input into CLI args.
 * The user's prompt is passed via request.json file, not as a CLI argument.
 * The -p flag receives a generic instruction to read request.json.
 */
export function spawnPipeline(options: PipelineSpawnOptions): PipelineSpawnResult {
  const outputDir = join(tmpdir(), `pipeline-${options.pipelineId}`)

  // Create output directory
  mkdirSync(outputDir, { recursive: true })

  // Write request.json for file-based handoff (D-08)
  // GB-04: Include knowledgeContext when available for subprocess consumption
  writeFileSync(
    join(outputDir, 'request.json'),
    JSON.stringify({
      pipelineId: options.pipelineId,
      prompt: options.prompt,
      whatGood: options.whatGood,
      outputDir,
      callbackUrl: options.callbackUrl,
      deadline: options.deadline,
      knowledgeContext: options.knowledgeContext ?? null,
    }),
  )

  // Build system prompt (server-generated, no user input interpolation)
  const systemPrompt = buildPipelineSystemPrompt(
    options.pipelineId,
    outputDir,
    options.callbackUrl,
  )

  // T-17-14: Generic prompt instruction, NOT user input
  const safePrompt = `Read ${outputDir}/request.json and execute the pipeline as instructed in the system prompt.`

  // Spawn claude CLI as detached subprocess
  // T-17-17: --max-turns 50 caps execution
  // T-17-20: --allowedTools restricts tool access
  const child = spawn('claude', [
    '-p', safePrompt,
    '--system-prompt', systemPrompt,
    '--allowedTools', 'Read,Write,Bash,Glob,Grep',
    '--max-turns', '50',
    '--output-format', 'json',
  ], {
    cwd: options.projectPath,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    detached: true,
  })

  // Detach from parent process lifecycle
  child.unref()

  // Log stderr for debugging (non-blocking)
  child.stderr?.on('data', (data: Buffer) => {
    console.error(`[pipeline:${options.pipelineId}] stderr: ${data.toString().trim()}`)
  })

  if (!child.pid) {
    throw new Error(`Failed to spawn pipeline process for ${options.pipelineId}`)
  }

  return {
    pid: child.pid,
    outputDir,
  }
}
