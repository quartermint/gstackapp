# Phase 2: Pipeline Engine - Research

**Researched:** 2026-03-30
**Domain:** Claude API tool_use pipeline, sandboxed file access, parallel stage execution, shallow git cloning
**Confidence:** HIGH

## Summary

Phase 2 is the core product -- a 5-stage parallel Claude tool_use pipeline that reviews every PR. The Phase 1 foundation (webhook handler, DB schema, GitHub auth, idempotency) is fully built and provides clean integration points. The key technical challenge is orchestrating 5 independent Claude API conversations with sandboxed file access, handling the tool_use agentic loop correctly, and writing concurrent results to SQLite without BUSY errors.

The most important discovery from this research: **Claude 4+ models have built-in token-efficient tool use**. The `token-efficient-tools-2025-02-19` beta header from CONTEXT.md decision D-02 has NO effect on Claude 4 models and should be removed. The SDK also provides a Tool Runner abstraction (`client.beta.messages.toolRunner()`) that automates the agentic loop, but for this use case a manual loop gives better control over iteration limits, timeout, and progress reporting. Additionally, the latest Claude models are `claude-opus-4-6` ($5/$25 per MTok) and `claude-sonnet-4-6` ($3/$15 per MTok) -- significantly cheaper than the Opus 4.1 pricing ($15/$75) referenced in PITFALLS.md, making the mixed-model strategy from D-01 very cost-effective.

**Primary recommendation:** Build in this order: (1) sandbox file tools with path validation, (2) clone manager with symlink removal, (3) single-stage executor with manual tool_use loop, (4) pipeline orchestrator with Promise.allSettled, (5) stage prompt files, (6) smart filtering for CEO/Design stages. Test each layer independently before composing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Mixed model strategy -- Opus for CEO + Security stages (high-judgment, strategic), Sonnet for Eng + Design + QA stages (pattern-matching, lower cost)
- **D-02:** Use prompt caching headers + `token-efficient-tools` beta header on all stages for 60-80% cost reduction
- **D-03:** Estimated cost: ~$100-400/mo depending on PR volume at mixed models with caching
- **D-04:** All 5 stages execute in parallel via Promise.allSettled
- **D-05:** Each stage gets an independent Claude API conversation with its own tool_use context
- **D-06:** Dedicated prompt file per stage at `packages/api/src/pipeline/prompts/{stage}.md`
- **D-07:** Shared StageResult Zod schema + per-stage typed findings
- **D-08:** CEO and Design stages use smart filtering -- only fire when relevant changes detected (UI changes, new features, architecture shifts, config changes). Eng, QA, Security fire on every PR.
- **D-09:** Filtering logic runs before clone/AI invocation to save cost on irrelevant PRs
- **D-10:** Filter criteria: CEO fires on new files, architecture changes, dependency changes, large PRs. Design fires on CSS/component/UI file changes.
- **D-11:** Default behavior: retry once on API error/timeout, then FLAG the stage for user review (not silent SKIP)
- **D-12:** User-configurable in onboarding: can choose between retry+FLAG (default), retry+SKIP, or fail-fast
- **D-13:** Stage timeouts: 5 minutes per stage max. Pipeline timeout: 10 minutes total.
- **D-14:** Pipeline persists RUNNING status before stages begin (crash recovery)
- **D-15:** Shallow clone to /tmp with `git clone --depth=1 --branch`
- **D-16:** Post-clone symlink removal: `find /tmp/clone-dir -type l -delete`
- **D-17:** Path validation: `fs.realpathSync()` BEFORE prefix check (CVE-2025-53109 prevention)
- **D-18:** Tool set: read_file, list_files, search_code (grep-like). No write tools.

### Claude's Discretion
- Tool_use loop iteration limits per stage
- Token budget allocation per stage
- Prompt engineering approach for CEO and Design stages (novel, no prior art -- iterate after seeing real outputs)
- Clone cleanup strategy (on-completion vs timer-based)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | PR webhook triggers 5-stage cognitive review pipeline (CEO, Eng, Design, QA, Security) | Pipeline orchestrator dispatched from handlers.ts TODO, 5 stages with dedicated prompt files (D-06), smart filtering for CEO/Design (D-08) |
| PIPE-02 | All 5 stages execute in parallel via Promise.allSettled | Promise.allSettled fan-out/fan-in pattern (D-04), verified as correct approach in ARCHITECTURE.md |
| PIPE-03 | Each stage runs Claude API with tool_use (read_file, list_files, search_code) | @anthropic-ai/sdk with manual tool_use loop, sandbox tools defined per D-18 |
| PIPE-04 | Shallow clone of repository to /tmp with strict path + symlink sandboxing | simple-git for clone (D-15), symlink removal (D-16), fs.realpathSync path validation (D-17) |
| PIPE-05 | Each stage produces structured findings with typed Zod schema | Existing FindingSchema in packages/shared + StageResultSchema, Zod validation on AI output |
| PIPE-06 | Each stage assigns a verdict: PASS, FLAG, BLOCK, or SKIP | VerdictSchema already defined in shared/schemas/verdicts.ts, stage executor maps AI response to verdict |
| PIPE-07 | Dedicated prompt file per stage (packages/api/src/pipeline/prompts/*.md) | Markdown prompt files loaded at startup, cached with prompt caching (D-06) |
| PIPE-08 | Pipeline completes review in under 5 minutes for typical PRs | Parallel execution (D-04), 5-min per-stage timeout (D-13), shallow clone minimizes setup |
| PIPE-09 | Pipeline persists RUNNING status before stages begin (crash recovery) | Status update in DB before Promise.allSettled (D-14), existing reconcileStaleRuns() handles restart |
</phase_requirements>

## Standard Stack

### Core (Phase 2 Additions)

| Library | Verified Version | Purpose | Why Standard |
|---------|-----------------|---------|--------------|
| @anthropic-ai/sdk | 0.80.0 | Claude API client with tool_use | Direct SDK -- full control over tool_use loop, prompt caching, structured outputs. No Vercel AI SDK abstraction needed. |
| simple-git | 3.33.0 | Programmatic git clone | Shallow clone repos to /tmp. Actively maintained. Wraps git CLI with promise API. |

### Already Installed (Phase 1)

| Library | Version | Relevance to Phase 2 |
|---------|---------|---------------------|
| better-sqlite3 | ^11.8 | Stage results + findings persistence, WAL mode handles concurrent reads |
| drizzle-orm | ^0.45 | Type-safe writes to stage_results and findings tables |
| nanoid | ^5.0 | ID generation for stage results and findings |
| zod | ^3.24 | Validate AI structured output against StageResult/Finding schemas |
| pino | ^9.6 | Structured logging for pipeline execution, stage progress, timing |
| @octokit/rest | ^21.1 | Fetch PR diff/file list for stage input |

### Supporting (Phase 2)

| Library | Purpose | When to Use |
|---------|---------|-------------|
| child_process (built-in) | Alternative to simple-git for symlink removal post-clone | Post-clone symlink cleanup |
| fs/promises (built-in) | Async file reads for sandbox tools, readdir for list_files | Sandbox file access layer |
| path (built-in) | Path resolution, joining, validation | Sandbox path security |

### Model Selection

| Stage | Model ID | Pricing (Input/Output per MTok) | Rationale |
|-------|----------|--------------------------------|-----------|
| CEO | claude-opus-4-6 | $5 / $25 | High-judgment strategic review, challenges the premise |
| Security | claude-opus-4-6 | $5 / $25 | Security requires deep reasoning, false negatives are costly |
| Eng | claude-sonnet-4-6 | $3 / $15 | Pattern matching, code quality, architecture -- Sonnet excels |
| Design | claude-sonnet-4-6 | $3 / $15 | CSS/component review, accessibility -- pattern matching task |
| QA | claude-sonnet-4-6 | $3 / $15 | Test coverage gaps, edge cases -- structured analysis |

**IMPORTANT UPDATE on D-02:** The `token-efficient-tools-2025-02-19` beta header has **no effect** on Claude 4+ models. All Claude 4 models (Opus 4.6, Sonnet 4.6) have built-in token-efficient tool use. Remove the header from the implementation -- it is a no-op. Prompt caching via `cache_control: { type: "ephemeral" }` on the stage-specific instructions and tool definitions remains the primary cost reduction mechanism (90% savings on cache hits).

**Installation (Phase 2 additions only):**
```bash
npm install -w packages/api @anthropic-ai/sdk simple-git
```

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions)

```
packages/api/src/
  pipeline/
    orchestrator.ts    # Pipeline lifecycle: create run -> clone -> fan-out stages -> fan-in results
    stage-runner.ts    # Single stage executor: Claude API tool_use loop with timeout
    tools.ts           # Tool definitions: read_file, list_files, search_code
    sandbox.ts         # Path validation + symlink guard
    clone.ts           # Shallow clone + cleanup
    filter.ts          # Smart stage filtering (CEO/Design relevance check)
    prompts/
      ceo.md           # CEO stage instructions
      eng.md           # Eng stage instructions
      design.md        # Design stage instructions
      qa.md            # QA stage instructions
      security.md      # Security stage instructions
```

### Pattern 1: Pipeline Orchestrator (Dispatch from Webhook Handler)

**What:** The webhook handler creates a pipeline run (already done in Phase 1), then dispatches the orchestrator. The orchestrator transitions status to RUNNING, clones the repo, fans out stages, fans in results, and updates status to COMPLETED/FAILED.

**Integration point:** The existing TODO in `handlers.ts` line 172.

**Example:**
```typescript
// packages/api/src/pipeline/orchestrator.ts
import { db } from '../db/client'
import { pipelineRuns, stageResults, findings as findingsTable } from '../db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { cloneRepo, cleanupClone } from './clone'
import { runStageWithRetry } from './stage-runner'
import { shouldRunStage } from './filter'
import { getInstallationOctokit } from '../github/auth'
import type { Stage } from '@gstackapp/shared'

const ALL_STAGES: Stage[] = ['ceo', 'eng', 'design', 'qa', 'security']

interface PipelineInput {
  runId: string
  installationId: number
  repoFullName: string     // owner/repo
  prNumber: number
  headSha: string
  baseBranch: string
}

export async function executePipeline(input: PipelineInput): Promise<void> {
  const { runId, installationId, repoFullName, prNumber, headSha } = input

  // PIPE-09: Persist RUNNING status BEFORE starting stages
  db.update(pipelineRuns)
    .set({ status: 'RUNNING', startedAt: new Date() })
    .where(eq(pipelineRuns.id, runId))
    .run()

  let clonePath: string | null = null

  try {
    // Get installation Octokit for API calls
    const octokit = getInstallationOctokit(installationId)

    // Fetch PR changed files for smart filtering + stage input
    const { data: prFiles } = await octokit.pulls.listFiles({
      owner: repoFullName.split('/')[0],
      repo: repoFullName.split('/')[1],
      pull_number: prNumber,
    })

    // Determine which stages to run (D-08, D-09, D-10)
    const stagesToRun = ALL_STAGES.filter(stage =>
      shouldRunStage(stage, prFiles)
    )

    // Clone only if at least one stage needs to run
    if (stagesToRun.length > 0) {
      clonePath = await cloneRepo(installationId, repoFullName, headSha)
    }

    // Create stage_result records for all stages
    for (const stage of ALL_STAGES) {
      const verdict = stagesToRun.includes(stage) ? 'RUNNING' : 'SKIP'
      db.insert(stageResults).values({
        id: nanoid(),
        pipelineRunId: runId,
        stage,
        verdict,
      }).run()
    }

    // PIPE-02: Fan out with Promise.allSettled
    const results = await Promise.allSettled(
      stagesToRun.map(stage =>
        runStageWithRetry({
          stage,
          runId,
          clonePath: clonePath!,
          prFiles,
          repoFullName,
          prNumber,
          headSha,
        })
      )
    )

    // Fan in: persist results
    for (let i = 0; i < stagesToRun.length; i++) {
      const stage = stagesToRun[i]
      const result = results[i]

      if (result.status === 'fulfilled') {
        const { verdict, summary, findings, tokenUsage, durationMs } = result.value

        // Update stage_result
        db.update(stageResults)
          .set({
            verdict,
            summary,
            tokenUsage,
            durationMs,
            completedAt: new Date(),
          })
          .where(eq(stageResults.pipelineRunId, runId))
          .run()

        // Insert findings
        for (const finding of findings) {
          db.insert(findingsTable).values({
            id: nanoid(),
            stageResultId: result.value.stageResultId,
            pipelineRunId: runId,
            ...finding,
          }).run()
        }
      } else {
        // Stage failed -- mark as FLAG per D-11
        db.update(stageResults)
          .set({
            verdict: 'FLAG',
            error: result.reason?.message ?? 'Unknown error',
            completedAt: new Date(),
          })
          .where(eq(stageResults.pipelineRunId, runId))
          .run()
      }
    }

    // Pipeline complete
    db.update(pipelineRuns)
      .set({ status: 'COMPLETED', completedAt: new Date() })
      .where(eq(pipelineRuns.id, runId))
      .run()

  } catch (err) {
    // Pipeline-level failure
    db.update(pipelineRuns)
      .set({
        status: 'FAILED',
        completedAt: new Date(),
      })
      .where(eq(pipelineRuns.id, runId))
      .run()
  } finally {
    // Cleanup clone
    if (clonePath) {
      await cleanupClone(clonePath)
    }
  }
}
```

### Pattern 2: Stage Runner with Manual Tool_Use Loop

**What:** Each stage runs an independent Claude API conversation. The model receives stage-specific instructions (from the stage's .md file), PR context as user message, and tool definitions. The loop continues until `stop_reason` is `end_turn` or iteration/timeout limits are hit.

**Why manual loop over Tool Runner:** The SDK's `client.beta.messages.toolRunner()` is convenient but gives less control over (a) per-iteration progress reporting for SSE, (b) per-stage timeout via AbortController, (c) iteration counting for limits. A manual loop is ~30 lines and gives full control.

**Example:**
```typescript
// packages/api/src/pipeline/stage-runner.ts
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FindingSchema, VerdictSchema } from '@gstackapp/shared'
import type { Stage, Finding, Verdict } from '@gstackapp/shared'
import { createSandboxTools, executeTool } from './tools'

const anthropic = new Anthropic()  // reads ANTHROPIC_API_KEY from env

const MODEL_MAP: Record<Stage, string> = {
  ceo: 'claude-opus-4-6',
  security: 'claude-opus-4-6',
  eng: 'claude-sonnet-4-6',
  design: 'claude-sonnet-4-6',
  qa: 'claude-sonnet-4-6',
}

const MAX_ITERATIONS = 25   // tool_use loop cap per stage
const STAGE_TIMEOUT_MS = 5 * 60 * 1000  // 5 minutes (D-13)

interface StageInput {
  stage: Stage
  runId: string
  clonePath: string
  prFiles: Array<{
    filename: string
    status: string
    additions: number
    deletions: number
    patch?: string
  }>
  repoFullName: string
  prNumber: number
  headSha: string
}

interface StageOutput {
  stageResultId: string
  verdict: Verdict
  summary: string
  findings: Finding[]
  tokenUsage: number
  durationMs: number
}

export async function runStage(input: StageInput): Promise<StageOutput> {
  const startTime = Date.now()
  const abortController = new AbortController()

  // Stage timeout (D-13)
  const timeout = setTimeout(() => abortController.abort(), STAGE_TIMEOUT_MS)

  try {
    const stageInstructions = readFileSync(
      resolve(__dirname, `prompts/${input.stage}.md`),
      'utf-8'
    )

    const tools = createSandboxTools(input.clonePath)
    const model = MODEL_MAP[input.stage]
    const userContent = buildStageInput(input)

    let messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userContent }
    ]

    let totalTokens = 0
    let iterations = 0
    let finalResponse: Anthropic.Message | null = null

    while (iterations < MAX_ITERATIONS) {
      iterations++

      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: stageInstructions,
            // Prompt caching: stage instructions are static across calls
            cache_control: { type: 'ephemeral' },
          }
        ],
        tools: tools.map((t, i) => ({
          ...t,
          // Cache control on last tool definition
          ...(i === tools.length - 1
            ? { cache_control: { type: 'ephemeral' as const } }
            : {}),
        })),
        messages,
      }, {
        signal: abortController.signal,
      })

      totalTokens += (response.usage.input_tokens + response.usage.output_tokens)

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'refusal') {
        finalResponse = response
        break
      }

      if (response.stop_reason === 'tool_use') {
        // Execute tool calls
        const toolUseBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )

        const toolResults: Anthropic.ToolResultBlockParam[] = []
        for (const toolUse of toolUseBlocks) {
          try {
            const result = await executeTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>,
              input.clonePath
            )
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: result,
            })
          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: `Error: ${(err as Error).message}`,
              is_error: true,
            })
          }
        }

        // Append assistant response + tool results for next iteration
        // CRITICAL: tool_result blocks must come FIRST in user content
        messages = [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ]
      } else {
        // Unexpected stop_reason (e.g., max_tokens, model_context_window_exceeded)
        finalResponse = response
        break
      }
    }

    const { verdict, summary, findings } = parseStageOutput(finalResponse, input.stage)

    return {
      stageResultId: '',  // Set by orchestrator
      verdict,
      summary,
      findings,
      tokenUsage: totalTokens,
      durationMs: Date.now() - startTime,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Retry wrapper per D-11: retry once on API error/timeout, then FLAG.
 */
export async function runStageWithRetry(input: StageInput): Promise<StageOutput> {
  try {
    return await runStage(input)
  } catch (firstError) {
    try {
      return await runStage(input)
    } catch (retryError) {
      return {
        stageResultId: '',
        verdict: 'FLAG',
        summary: `Stage failed after retry: ${(retryError as Error).message}`,
        findings: [],
        tokenUsage: 0,
        durationMs: 0,
      }
    }
  }
}
```

### Pattern 3: Sandboxed File Tools

**What:** Three tools (read_file, list_files, search_code) that operate within the clone directory. Every path is resolved with `fs.realpathSync` and validated against the clone root BEFORE any file access.

**Critical security: CVE-2025-53109 prevention (D-17).**

**Example:**
```typescript
// packages/api/src/pipeline/sandbox.ts
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Validate that a requested path resolves to inside the sandbox root.
 * Uses fs.realpathSync BEFORE the prefix check to defeat symlink traversal.
 *
 * @throws Error if the path escapes the sandbox
 */
export function validatePath(requestedPath: string, sandboxRoot: string): string {
  const candidatePath = resolve(sandboxRoot, requestedPath)

  // CRITICAL: Resolve symlinks FIRST, then check prefix
  // This defeats CVE-2025-53109 where symlinks point outside the sandbox
  let realPath: string
  try {
    realPath = realpathSync(candidatePath)
  } catch {
    throw new Error(`File not found: ${requestedPath}`)
  }

  const realRoot = realpathSync(sandboxRoot)
  if (!realPath.startsWith(realRoot + '/') && realPath !== realRoot) {
    throw new Error(`Access denied: path escapes sandbox`)
  }

  return realPath
}
```

```typescript
// packages/api/src/pipeline/tools.ts
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { validatePath } from './sandbox'
import { execFileSync } from 'node:child_process'
import type Anthropic from '@anthropic-ai/sdk'

/**
 * Create tool definitions for the Claude API.
 */
export function createSandboxTools(clonePath: string): Anthropic.Tool[] {
  return [
    {
      name: 'read_file',
      description:
        'Read the contents of a file in the repository. Returns the full text content. ' +
        'Use this to examine source code, configuration files, or documentation. ' +
        'The path should be relative to the repository root.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description:
              'File path relative to repository root, e.g. "src/index.ts" or "package.json"',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'list_files',
      description:
        'List files and directories at a given path in the repository. ' +
        'Returns a list of file/directory names with type indicators. ' +
        'Use this to explore the project structure before reading specific files. ' +
        'Pass an empty string or "." for the repository root.',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: {
            type: 'string',
            description:
              'Directory path relative to repository root. Use "." or "" for root.',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'search_code',
      description:
        'Search for a pattern in the repository source code using grep. ' +
        'Returns matching lines with file paths and line numbers. ' +
        'Supports regular expressions. Limited to 50 results. ' +
        'Use this to find usages, definitions, or patterns across the codebase.',
      input_schema: {
        type: 'object' as const,
        properties: {
          pattern: {
            type: 'string',
            description: 'Search pattern (grep-compatible regex)',
          },
          file_pattern: {
            type: 'string',
            description:
              'Optional glob pattern to filter files, e.g. "*.ts" or "src/**/*.js"',
          },
        },
        required: ['pattern'],
      },
    },
  ]
}

/**
 * Execute a tool call. Returns the result as a string for the tool_result block.
 *
 * Note: search_code uses execFileSync (not execSync) to avoid shell injection.
 * The pattern is passed as a direct argument to grep, not through a shell.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  clonePath: string
): Promise<string> {
  switch (toolName) {
    case 'read_file': {
      const filePath = validatePath(input.path as string, clonePath)
      const stat = statSync(filePath)
      if (stat.size > 100_000) {
        return (
          `File too large (${stat.size} bytes). Showing first 10000 characters.\n\n` +
          readFileSync(filePath, 'utf-8').slice(0, 10_000)
        )
      }
      return readFileSync(filePath, 'utf-8')
    }

    case 'list_files': {
      const dirPath = validatePath((input.path as string) || '.', clonePath)
      const entries = readdirSync(dirPath, { withFileTypes: true })
      return entries
        .map(e => `${e.isDirectory() ? '[dir]' : '[file]'} ${e.name}`)
        .join('\n')
    }

    case 'search_code': {
      const pattern = input.pattern as string
      const filePattern = input.file_pattern as string | undefined

      // Use execFileSync to avoid shell injection (pattern is user-controlled via AI)
      const args = ['-rn', '-m', '50']
      if (filePattern) {
        args.push(`--include=${filePattern}`)
      }
      args.push('--', pattern, '.')

      try {
        const result = execFileSync('grep', args, {
          cwd: clonePath,
          encoding: 'utf-8',
          timeout: 10_000,
        })
        return result || 'No matches found.'
      } catch {
        return 'No matches found.'
      }
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`)
  }
}
```

### Pattern 4: Clone Manager with Symlink Removal

**What:** Shallow clone the PR branch to /tmp, remove all symlinks, return the clone path. Cleanup after pipeline completion.

**Example:**
```typescript
// packages/api/src/pipeline/clone.ts
import simpleGit from 'simple-git'
import { execFileSync } from 'node:child_process'
import { rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getInstallationOctokit } from '../github/auth'

/**
 * Shallow clone a repository branch to /tmp.
 * Removes all symlinks after clone (D-16) for sandbox security.
 */
export async function cloneRepo(
  installationId: number,
  repoFullName: string,
  headSha: string
): Promise<string> {
  const prefix = repoFullName.replace('/', '-')
  const clonePath = await mkdtemp(join(tmpdir(), `gstack-${prefix}-`))

  // Get installation token for authenticated clone
  const octokit = getInstallationOctokit(installationId)
  const authResult = await (octokit as any).auth({
    type: 'installation',
    installationId,
  })
  const token = authResult.token

  const cloneUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`

  // Shallow clone (D-15)
  const git = simpleGit()
  await git.clone(cloneUrl, clonePath, [
    '--depth', '1',
    '--single-branch',
  ])

  // Checkout specific SHA if needed
  const repoGit = simpleGit(clonePath)
  await repoGit.checkout(headSha).catch(() => {
    // SHA might already be at HEAD from shallow clone -- that is fine
  })

  // D-16: Remove all symlinks post-clone (sandbox security)
  try {
    execFileSync('find', ['.', '-type', 'l', '-delete'], {
      cwd: clonePath,
      timeout: 5000,
    })
  } catch {
    // No symlinks found is the common case
  }

  return clonePath
}

/**
 * Clean up a clone directory.
 */
export async function cleanupClone(clonePath: string): Promise<void> {
  try {
    await rm(clonePath, { recursive: true, force: true })
  } catch (err) {
    console.error(`[clone] Failed to cleanup ${clonePath}:`, err)
  }
}
```

### Pattern 5: Smart Stage Filtering

**What:** Before cloning/invoking AI, check the PR's changed files to determine if CEO and Design stages should fire. Eng, QA, and Security always fire.

**Example:**
```typescript
// packages/api/src/pipeline/filter.ts
import type { Stage } from '@gstackapp/shared'

interface PrFile {
  filename: string
  status: string
  additions: number
  deletions: number
}

/**
 * Determine whether a stage should run for this PR based on changed files.
 * Eng, QA, and Security always run. CEO and Design use smart filtering (D-08).
 */
export function shouldRunStage(stage: Stage, files: PrFile[]): boolean {
  if (stage === 'eng' || stage === 'qa' || stage === 'security') {
    return true
  }

  // D-10: CEO fires on new files, architecture changes, dependency changes, large PRs
  if (stage === 'ceo') {
    const hasNewFiles = files.some(f => f.status === 'added')
    const hasArchitectureChanges = files.some(f =>
      f.filename.includes('architect') ||
      f.filename.includes('config') ||
      /^(docker|\.github|\.ci)/i.test(f.filename)
    )
    const hasDependencyChanges = files.some(f =>
      /package\.json|requirements\.txt|go\.mod|Cargo\.toml|Gemfile/i.test(f.filename)
    )
    const isLargePR =
      files.length > 10 ||
      files.reduce((sum, f) => sum + f.additions + f.deletions, 0) > 500
    return hasNewFiles || hasArchitectureChanges || hasDependencyChanges || isLargePR
  }

  // D-10: Design fires on CSS/component/UI file changes
  if (stage === 'design') {
    return files.some(f =>
      /\.(css|scss|less|styled|tsx|jsx)$/i.test(f.filename) ||
      /component|style|theme|layout|ui|design/i.test(f.filename)
    )
  }

  return true
}
```

### Anti-Patterns to Avoid

- **Using Tool Runner for pipeline stages:** The SDK's `toolRunner()` abstracts away the loop, making it harder to add per-iteration progress reporting, enforce iteration limits, or use AbortController for timeouts. Use the manual loop.
- **Caching the Anthropic client per stage:** Create one `new Anthropic()` instance and share it across all stages. The SDK handles concurrent requests correctly.
- **Sending full file contents in the initial message:** Send the PR diff summary + file list. Let the AI use tools to read specific files on demand.
- **Wrapping all 5 stage writes in a single transaction:** SQLite single-writer contention. Let each stage write independently -- busy_timeout handles the serialization.
- **Using `token-efficient-tools-2025-02-19` beta header:** No effect on Claude 4+ models. Remove it entirely.
- **Prefilling assistant messages:** Claude 4.6 returns 400 error on prefilled assistant messages. Use instructions in the system array or structured outputs instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Path traversal prevention | String prefix check on raw path | `fs.realpathSync()` + prefix check on resolved path | CVE-2025-53109: symlinks bypass string checks |
| Symlink removal post-clone | Manual directory traversal | `find . -type l -delete` via execFileSync | Reliable recursive symlink detection |
| Git clone with auth token | Manual HTTPS URL construction + shell exec | simple-git `.clone()` with token in URL | Handles errors, exit codes, progress |
| Claude tool_use JSON parsing | Manual JSON extraction from text | SDK response `content.filter(b => b.type === 'tool_use')` | Type-safe, handles edge cases |
| Stage timeout | Manual timer + Promise.race | AbortController signal passed to SDK `.create()` | Clean abort, proper resource cleanup |
| Concurrent file write serialization | Custom mutex or queue | SQLite `PRAGMA busy_timeout = 5000` | Database handles write serialization natively |

**Key insight:** The Anthropic SDK + SQLite busy_timeout handle the two hardest concurrency problems (API conversation state and write serialization) natively. The pipeline code is orchestration glue.

## Common Pitfalls

### Pitfall 1: Claude 4 Prefill Restriction

**What goes wrong:** Attempting to prefill assistant messages with structured output instructions returns a 400 error on Claude 4.6 models.
**Why it happens:** Claude 4.6 removed support for assistant message prefilling as a breaking change.
**How to avoid:** Use instructions in the system array to direct output format. Use `output_config.format` for structured outputs. Never add `{ role: 'assistant', content: '...' }` as the first message.
**Warning signs:** 400 error with message about prefilling not supported.

### Pitfall 2: Tool Result Ordering in Messages

**What goes wrong:** The API returns 400 error "tool_use ids were found without tool_result blocks immediately after" when tool results aren't formatted correctly.
**Why it happens:** Tool result blocks MUST come before any text in the user message content array. And tool_result messages must immediately follow their corresponding tool_use messages.
**How to avoid:** Always format tool results as: `{ role: 'user', content: [{ type: 'tool_result', ... }, ...] }` with tool_result blocks first, any text after.
**Warning signs:** 400 errors after the first tool_use iteration.

### Pitfall 3: SQLite BUSY During Concurrent Stage Writes

**What goes wrong:** 5 stages complete near-simultaneously and write to stage_results + findings. SQLite throws SQLITE_BUSY.
**Why it happens:** SQLite is single-writer. WAL mode allows concurrent reads but not concurrent writes.
**How to avoid:** Already mitigated by `PRAGMA busy_timeout = 5000` (set in Phase 1 db/client.ts). Writers wait up to 5 seconds. Additional safety: wrap stage_result + findings writes in a transaction so they're a single write operation.
**Warning signs:** SQLITE_BUSY errors in pino logs during pipeline completion.

### Pitfall 4: Clone Auth Token in URL Persisted to Disk

**What goes wrong:** The installation access token used for authenticated clone ends up in `.git/config` inside the clone directory. If the clone isn't cleaned up, the token persists on disk until it expires (1 hour).
**Why it happens:** `git clone https://x-access-token:{token}@github.com/...` writes the full URL to `.git/config`.
**How to avoid:** Always clean up clones in the finally block. Tokens expire in 1 hour regardless. For extra safety, could use `git config --local --unset remote.origin.url` after clone.
**Warning signs:** Tokens visible in /tmp clone directories after pipeline completion.

### Pitfall 5: Prompt Cache Minimum Token Requirements

**What goes wrong:** Prompt caching silently fails (no error, just no cache hit) when the cached content is below the minimum token threshold.
**Why it happens:** Different models have different minimums. Claude Opus 4.6 requires 4,096 tokens minimum. Sonnet 4.6 requires 2,048 tokens minimum.
**How to avoid:** Stage instructions in the system array should be substantial (3-5 paragraphs with detailed instructions). Check `response.usage.cache_creation_input_tokens` and `cache_read_input_tokens` to verify caching is working.
**Warning signs:** `cache_read_input_tokens` always 0 in response usage.

### Pitfall 6: Shallow Clone + SHA Checkout Failure

**What goes wrong:** `git clone --depth=1` fetches only the default branch HEAD. If the PR head SHA is on a different branch, `git checkout {sha}` fails because the SHA doesn't exist in the shallow clone.
**Why it happens:** Shallow clones with `--depth=1` only include one commit. If the PR branch has diverged, the specific SHA isn't available.
**How to avoid:** Clone with `--depth=1 --single-branch --branch {pr_branch_name}` where pr_branch_name comes from the webhook payload `pull_request.head.ref`. This ensures the cloned commit IS the PR head.
**Warning signs:** "fatal: reference is not a tree" errors during git checkout.

### Pitfall 7: Large PR Diff Exceeding Context Window

**What goes wrong:** A PR with 50+ changed files sends too much context in the initial user message, consuming most of the context window before the AI can use tools.
**Why it happens:** Naively concatenating all file patches into the initial message.
**How to avoid:** Send a diff summary (file names, change counts, patch snippets for key files) rather than the full diff. Let the AI use `read_file` and `search_code` to explore on demand. Cap the initial user message to ~20K tokens.
**Warning signs:** `max_tokens` hit on the first API call. Shallow tool exploration (AI runs out of output budget).

## Code Examples

### Dispatching Pipeline from Webhook Handler

The existing TODO at `packages/api/src/github/handlers.ts:172`:

```typescript
// In the pull_request event handler, after idempotency check:
if (created) {
  console.log(
    `[handlers] Pipeline run created: ${runId} for PR #${payload.pull_request.number}`
  )
  // Phase 2: Dispatch pipeline execution
  executePipeline({
    runId,
    installationId: payload.installation!.id,
    repoFullName: payload.repository.full_name,
    prNumber: payload.pull_request.number,
    headSha: payload.pull_request.head.sha,
    baseBranch: payload.pull_request.base.ref,
  }).catch(err => {
    console.error(`[handlers] Pipeline failed for run ${runId}:`, err)
  })
}
```

### Building Stage Input from PR Data

```typescript
function buildStageInput(input: StageInput): string {
  const { prFiles, repoFullName, prNumber, headSha } = input

  const totalAdded = prFiles.reduce((s, f) => s + f.additions, 0)
  const totalDeleted = prFiles.reduce((s, f) => s + f.deletions, 0)

  let content = `## PR #${prNumber} on ${repoFullName}\n`
  content += `**Head SHA:** ${headSha}\n`
  content += `**Files changed:** ${prFiles.length} (+${totalAdded} -${totalDeleted})\n\n`
  content += `### Changed Files\n`

  for (const file of prFiles) {
    content += `- ${file.status}: \`${file.filename}\` (+${file.additions} -${file.deletions})\n`
  }

  content += '\n### Diff Patches (truncated)\n'

  // Include patches for the most significant files (limit total size)
  let patchBudget = 15_000  // characters
  for (const file of prFiles.sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions)
  )) {
    if (file.patch && patchBudget > 0) {
      const patch = file.patch.slice(0, Math.min(file.patch.length, patchBudget))
      content += `\n#### ${file.filename}\n\`\`\`diff\n${patch}\n\`\`\`\n`
      patchBudget -= patch.length
    }
  }

  content +=
    '\nUse the read_file, list_files, and search_code tools to explore ' +
    'the codebase and understand context beyond the diff.'

  return content
}
```

### Parsing Structured Output from Stage Response

```typescript
function parseStageOutput(
  response: Anthropic.Message | null,
  stage: Stage
): { verdict: Verdict; summary: string; findings: Finding[] } {
  if (!response) {
    return { verdict: 'FLAG', summary: 'Stage did not produce a response', findings: [] }
  }

  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === 'text'
  )

  const fullText = textBlocks.map(b => b.text).join('\n')

  // Try to extract JSON from the response
  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      return {
        verdict: VerdictSchema.parse(parsed.verdict),
        summary: parsed.summary ?? '',
        findings: (parsed.findings ?? []).map((f: unknown) => FindingSchema.parse(f)),
      }
    } catch {
      // JSON parsing failed -- fall through to text extraction
    }
  }

  // Fallback: extract verdict from text, flag for human review
  return {
    verdict: 'FLAG',
    summary: fullText.slice(0, 500),
    findings: [],
  }
}
```

### Config Extension for Anthropic API Key

```typescript
// Addition to packages/api/src/lib/config.ts configSchema
const configSchema = z.object({
  // ... existing fields ...
  anthropicApiKey: z.string().optional(),  // Optional in Phase 1, required in Phase 2
})

// Usage: set ANTHROPIC_API_KEY in .env
// The @anthropic-ai/sdk reads ANTHROPIC_API_KEY from env automatically
// No need to pass it to the Anthropic constructor
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `token-efficient-tools-2025-02-19` beta header | Built-in on Claude 4+ models | Claude 4.0 (May 2025) | Remove the header -- no effect on Claude 4.6/Sonnet 4.6 |
| `claude-sonnet-4-20250514` model ID | `claude-sonnet-4-6` | Late 2025 | Use latest model IDs for best performance |
| Opus $15/$75 per MTok | Opus 4.6 $5/$25 per MTok | Claude 4.6 | 3x cheaper than Opus 4.1, makes mixed-model strategy very cost-effective |
| Manual tool_use loop always | SDK Tool Runner (`toolRunner()`) available | SDK 0.80+ | Tool Runner automates the loop; manual loop preferred here for progress/timeout control |
| Assistant prefilling for structured output | System array instructions + `output_config.format` | Claude 4.6 | Prefilling returns 400 error on 4.6 models |
| `budget_tokens` for extended thinking | `thinking: { type: "adaptive" }` | Claude 4.6 | Adaptive thinking is GA, budget_tokens deprecated |

**Deprecated/outdated:**
- `token-efficient-tools-2025-02-19` beta header: No effect on Claude 4+. Remove.
- `output-128k-2025-02-19` beta header: No effect on Claude 4+. Remove.
- Assistant message prefilling: Returns 400 on Claude 4.6. Use system array instructions.
- `thinking: { type: "enabled", budget_tokens: N }`: Deprecated on 4.6. Use `thinking: { type: "adaptive" }` if thinking is desired.

## Open Questions

1. **Installation Token for Authenticated Clone**
   - What we know: `@octokit/auth-app` manages tokens, but the internal `.auth()` method to extract a raw token for the clone URL may not be the cleanest API.
   - What's unclear: Whether to use `octokit.auth({ type: 'installation' })` or call the GitHub API directly for a token.
   - Recommendation: Use the Octokit auth method. The token is needed only briefly for the clone URL. If the auth API is awkward, fall back to calling `POST /app/installations/{id}/access_tokens` directly.

2. **Structured Output Parsing Strategy**
   - What we know: Claude needs to return verdict + findings as structured data.
   - What's unclear: Whether to use `output_config.format` (Zod schema as structured output) vs. instructing Claude to end with a JSON block via the system array.
   - Recommendation: Start with system array instructions ("End your response with a JSON block") + JSON extraction regex. This is simpler and more debuggable. Migrate to `output_config.format` if extraction proves unreliable.

3. **Prompt Engineering for CEO and Design Stages**
   - What we know: These are novel review modes with no prior art. CEO challenges the premise (Garry Tan's gstack philosophy). Design reviews CSS/components/accessibility.
   - What's unclear: Optimal structure. Need iteration with real PR data.
   - Recommendation: Start with detailed but concise instructions (~2000 words each). Test against 5-10 real PRs. Iterate based on output quality. The .md files are designed to be edited without code changes.

4. **Clone Strategy for PR Head SHA**
   - What we know: Need to clone the PR branch at the head SHA.
   - What's unclear: Whether `--depth=1 --branch {pr_head_ref}` reliably lands on the right commit, or if a `fetch + checkout` is needed.
   - Recommendation: Clone with `--depth=1 --single-branch --branch {pr_head_ref}` from the webhook payload's `pull_request.head.ref`. The head of the branch after clone should match the PR head SHA. Verify with `git rev-parse HEAD` post-clone.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v22.22.0 | -- |
| npm | Package management | Yes | 10.9.4 | -- |
| git | Clone operations | Yes | 2.50.1 | -- |
| grep | search_code tool | Yes | built-in (macOS) | -- |
| find | symlink removal | Yes | built-in (macOS) | -- |
| /tmp directory | Clone storage | Yes | Available | -- |
| ANTHROPIC_API_KEY | Claude API calls | Not set | -- | Must be added to .env before Phase 2 execution |

**Missing dependencies with no fallback:**
- ANTHROPIC_API_KEY: Must be set in .env file. Phase 2 cannot execute without it.

**Missing dependencies with fallback:**
- @anthropic-ai/sdk: Not yet installed in packages/api. Install with `npm install -w packages/api @anthropic-ai/sdk`
- simple-git: Not yet installed. Install with `npm install -w packages/api simple-git`

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (already configured from Phase 1) |
| Config file | `packages/api/vitest.config.ts` (exists) |
| Quick run command | `npm run test -w packages/api` |
| Full suite command | `npm run test -w packages/api` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | PR webhook triggers pipeline dispatch | integration | `npx vitest run packages/api/src/__tests__/orchestrator.test.ts -t "dispatch"` | No - Wave 0 |
| PIPE-02 | All 5 stages execute in parallel | unit | `npx vitest run packages/api/src/__tests__/orchestrator.test.ts -t "parallel"` | No - Wave 0 |
| PIPE-03 | Stage runs Claude API with tool_use loop | unit | `npx vitest run packages/api/src/__tests__/stage-runner.test.ts -t "tool_use"` | No - Wave 0 |
| PIPE-04 | Sandbox path validation blocks escape | unit | `npx vitest run packages/api/src/__tests__/sandbox.test.ts` | No - Wave 0 |
| PIPE-05 | Stage produces Zod-validated findings | unit | `npx vitest run packages/api/src/__tests__/stage-runner.test.ts -t "findings"` | No - Wave 0 |
| PIPE-06 | Stage assigns verdict (PASS/FLAG/BLOCK/SKIP) | unit | `npx vitest run packages/api/src/__tests__/stage-runner.test.ts -t "verdict"` | No - Wave 0 |
| PIPE-07 | Prompt files load correctly for each stage | unit | `npx vitest run packages/api/src/__tests__/prompts.test.ts` | No - Wave 0 |
| PIPE-08 | Pipeline completes under 5 minutes | manual-only | Manual: trigger real PR review, measure wall time | N/A |
| PIPE-09 | Pipeline persists RUNNING before stages | integration | `npx vitest run packages/api/src/__tests__/orchestrator.test.ts -t "RUNNING"` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test -w packages/api`
- **Per wave merge:** `npm run test -w packages/api`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/api/src/__tests__/sandbox.test.ts` -- Path validation, symlink escape prevention, edge cases
- [ ] `packages/api/src/__tests__/stage-runner.test.ts` -- Mock Claude API, tool_use loop, verdict parsing, timeout
- [ ] `packages/api/src/__tests__/orchestrator.test.ts` -- Pipeline dispatch, parallel execution, status transitions, error handling
- [ ] `packages/api/src/__tests__/filter.test.ts` -- Smart stage filtering (CEO/Design relevance)
- [ ] `packages/api/src/__tests__/clone.test.ts` -- Clone + cleanup (can mock simple-git)
- [ ] `packages/api/src/__tests__/prompts.test.ts` -- Prompt file loading for all 5 stages

**Testing strategy for Claude API calls:** Mock the `@anthropic-ai/sdk` client in tests. Create fixtures for typical tool_use responses (tool_use -> tool_result -> end_turn). Do NOT make real API calls in tests. Real integration testing is manual with actual PRs.

## Project Constraints (from CLAUDE.md)

- **Stack:** Hono + SQLite + Drizzle + React (locked)
- **Deploy:** Mac Mini via Tailscale Funnel (no cloud infra for Phase 1)
- **AI Provider:** Claude API only -- multi-provider deferred to Phase 2
- **Auth:** None for Phase 1 (dashboard is public, single-user)
- **Security:** Sandboxed AI file access -- path resolution + symlink escape prevention
- **Design System:** Always read DESIGN.md before visual/UI decisions (not relevant for Phase 2 backend)
- **GSD Workflow:** All edits through GSD commands
- **Deprecated Models:** Never use Qwen3 variants or Gemini 2.0. Use claude-opus-4-6 or claude-sonnet-4-6.

## Sources

### Primary (HIGH confidence)
- [Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use) -- Tool definition schema, input_schema, tool_choice options, best practices
- [Anthropic: Handle tool calls](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls) -- tool_use/tool_result lifecycle, is_error field, message formatting requirements
- [Anthropic: Tool Runner SDK](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner) -- betaZodTool(), toolRunner(), streaming, automatic loop management
- [Anthropic: Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) -- cache_control, pricing (90% savings on hits), minimum token requirements, TTL
- [Anthropic: Migration to Claude 4.6](https://platform.claude.com/docs/en/about-claude/models/migration-guide) -- token-efficient-tools header removed, prefill restriction, model IDs
- [Anthropic: Models overview](https://platform.claude.com/docs/en/about-claude/models/overview) -- claude-opus-4-6 ($5/$25), claude-sonnet-4-6 ($3/$15), context windows, max output
- [npm: @anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk) -- v0.80.0 latest verified
- [npm: simple-git](https://www.npmjs.com/package/simple-git) -- v3.33.0 latest verified

### Secondary (MEDIUM confidence)
- [GitHub: anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) -- SDK source, helpers, examples
- [Anthropic: Token-efficient tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/token-efficient-tool-use) -- Confirmed built-in for Claude 4+ models
- [Anthropic: Token-saving updates](https://www.anthropic.com/news/token-saving-updates) -- Original announcement with beta header details
- [simple-git npm](https://www.npmjs.com/package/simple-git) -- clone API, options passing

### Pre-existing Project Research (HIGH confidence)
- `.planning/research/ARCHITECTURE.md` -- System architecture, component responsibilities, data flow, build order
- `.planning/research/PITFALLS.md` -- Sandbox escape (CVE-2025-53109), cost management, concurrent writes, noise filtering
- `.planning/research/STACK.md` -- Full technology stack with verified versions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- @anthropic-ai/sdk v0.80.0 verified, simple-git v3.33.0 verified, Claude model IDs and pricing verified against official docs
- Architecture: HIGH -- Manual tool_use loop pattern verified against official Anthropic docs. Pipeline orchestrator pattern validated against ARCHITECTURE.md. Sandbox pattern based on CVE-2025-53109 analysis.
- Pitfalls: HIGH -- Token-efficient-tools header deprecation confirmed via official migration guide. Prefill restriction confirmed. SQLite busy_timeout already configured in Phase 1. Prompt cache minimums documented in official docs.

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (Anthropic SDK and model IDs stable; pricing may change)
