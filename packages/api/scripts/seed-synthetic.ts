#!/usr/bin/env tsx
/**
 * Seed the database with synthetic but realistic review data.
 *
 * Creates pipeline runs, stage results, and findings for real repos
 * in the database, using plausible verdicts and review content.
 * No AI API calls needed — populates the dashboard instantly.
 *
 * Usage: npx tsx packages/api/scripts/seed-synthetic.ts
 */

import { db } from '../src/db/client'
import { repositories, reviewUnits, pipelineRuns, stageResults, findings } from '../src/db/schema'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'

const STAGES = ['ceo', 'eng', 'design', 'qa', 'security'] as const
const VERDICTS = ['PASS', 'FLAG', 'BLOCK'] as const
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const
const CATEGORIES = [
  'error-handling', 'security', 'performance', 'code-quality',
  'architecture', 'testing', 'naming', 'documentation', 'accessibility',
  'type-safety', 'concurrency', 'data-validation', 'dependency',
] as const

// Realistic finding templates per stage
const FINDING_TEMPLATES: Record<string, Array<{
  severity: string
  category: string
  title: string
  description: string
  suggestion?: string
}>> = {
  ceo: [
    { severity: 'medium', category: 'architecture', title: 'Feature scope creep risk', description: 'This change introduces cross-cutting concerns that touch 4 modules. Consider whether a phased rollout would reduce integration risk.' },
    { severity: 'low', category: 'documentation', title: 'Missing changelog entry', description: 'User-facing behavior change without a CHANGELOG update. Users upgrading may miss this.' },
    { severity: 'high', category: 'architecture', title: 'Breaking API contract', description: 'The response shape of /api/pipelines changed. Existing dashboard consumers will break without a migration path.' },
  ],
  eng: [
    { severity: 'critical', category: 'error-handling', title: 'Unhandled promise rejection in pipeline orchestrator', description: 'executePipeline() catches errors but the inner stage-runner can throw synchronously during tool parsing, bypassing the catch block.', suggestion: 'Wrap the entire stage execution in a try-catch, not just the async portion.' },
    { severity: 'high', category: 'performance', title: 'N+1 query in pipeline listing', description: 'Each pipeline run triggers a separate query for stage results. With 100 pipelines, this creates 100 additional queries.', suggestion: 'Use a single JOIN query or batch the stage result lookups.' },
    { severity: 'medium', category: 'type-safety', title: 'Unsafe type assertion on webhook payload', description: 'Using `as any` to access installation.account bypasses TypeScript safety. The Octokit types provide proper narrowing.' },
    { severity: 'low', category: 'naming', title: 'Inconsistent variable naming', description: 'Mix of camelCase (repoFullName) and snake_case (full_name) in the same function scope. Drizzle column names leak into business logic.' },
    { severity: 'medium', category: 'concurrency', title: 'Race condition in idempotency check', description: 'The query-then-insert pattern in ensurePullRequest allows duplicate rows under concurrent webhook deliveries.', suggestion: 'Use INSERT ... ON CONFLICT (already done for pipeline_runs, should be consistent).' },
    { severity: 'high', category: 'error-handling', title: 'Silent error swallowing in embedding pipeline', description: 'embedFindings() catches all errors and logs them but the pipeline reports COMPLETED even when embeddings fail entirely.' },
  ],
  design: [
    { severity: 'medium', category: 'accessibility', title: 'Color contrast insufficient on verdict badges', description: 'FLAG badge uses yellow (#F59E0B) on dark background. WCAG AA requires 4.5:1 contrast ratio; current ratio is ~3.2:1.' },
    { severity: 'low', category: 'code-quality', title: 'Hardcoded pixel values in pipeline card', description: 'Using px values instead of design tokens for spacing. This will diverge from DESIGN.md as the system evolves.' },
  ],
  qa: [
    { severity: 'high', category: 'testing', title: 'Missing test for webhook signature verification', description: 'No test covers the case where x-hub-signature-256 is invalid or missing. The webhook handler rejects but this path is untested.' },
    { severity: 'medium', category: 'testing', title: 'Test uses mock that diverges from production', description: 'The Octokit mock returns a simplified installation object missing the `permissions` field that production webhooks include.' },
    { severity: 'low', category: 'testing', title: 'Flaky test due to timing dependency', description: 'session-grouper test uses Date.now() comparisons that can fail across midnight boundaries.' },
  ],
  security: [
    { severity: 'critical', category: 'security', title: 'Path traversal in sandbox file reader', description: 'readFile tool resolves relative paths from clone root but does not prevent ../../../etc/passwd traversal after symlink resolution.', suggestion: 'Add path.resolve() + startsWith() check against the clone root after symlink resolution.' },
    { severity: 'high', category: 'security', title: 'API key exposed in error response', description: 'When Anthropic returns a 401, the error message includes the first 8 characters of the API key in the request_id field logged to the client.' },
    { severity: 'medium', category: 'data-validation', title: 'Unsanitized user input in PR title', description: 'PR titles from GitHub are rendered in commit comments without escaping. A crafted PR title could inject markdown formatting.' },
  ],
}

// Simulated commit data for different repos
const PUSH_SESSIONS = [
  { repo: 'quartermint/gstackapp', title: 'fix: defensive installation upsert in repos-added handler', author: 'sternryan', sha: 'c639f98', baseSha: '505a9e3', commits: 1 },
  { repo: 'quartermint/gstackapp', title: 'feat: add commit session grouper for push session detection', author: 'sternryan', sha: 'a47b35b', baseSha: 'f032bb9', commits: 3 },
  { repo: 'quartermint/gstackapp', title: 'fix: e2e pipeline + multi-provider push reviews spec (+5 more)', author: 'sternryan', sha: 'f292696', baseSha: '8afffe', commits: 6 },
  { repo: 'quartermint/gstackapp', title: 'feat(01-03): add test infrastructure — Vitest config', author: 'sternryan', sha: 'aa48cca', baseSha: 'c35112c', commits: 4 },
  { repo: 'quartermint/gstackapp', title: 'docs: start milestone v1.1 @gstackapp/harness (+56 more)', author: 'sternryan', sha: 'c9401a4', baseSha: 'f03bb9', commits: 8 },
  { repo: 'quartermint/cocobanana', title: 'chore: update gitignore', author: 'sternryan', sha: 'abc1234', baseSha: 'def5678', commits: 1 },
  { repo: 'quartermint/sovereign-flight-recorder', title: 'chore: add GSD learnings and Claude Code config', author: 'sternryan', sha: 'fed9876', baseSha: 'bca5432', commits: 1 },
  { repo: 'quartermint/foundry', title: 'chore: update CLAUDE.md with project instructions', author: 'sternryan', sha: '1a2b3c4', baseSha: '5d6e7f8', commits: 1 },
  { repo: 'sternryan/taxnav', title: 'docs: add CLAUDE.md instructions and session handoff', author: 'sternryan', sha: '9a8b7c6', baseSha: 'd5e4f3a', commits: 1 },
  { repo: 'quartermint/gstackapp', title: 'fix: distinguish webhook signature errors from handler errors', author: 'sternryan', sha: '7bb2bf9', baseSha: 'c639f98', commits: 2 },
]

// Source files for findings
const SOURCE_FILES = [
  'packages/api/src/pipeline/orchestrator.ts',
  'packages/api/src/pipeline/stage-runner.ts',
  'packages/api/src/github/handlers.ts',
  'packages/api/src/github/webhook.ts',
  'packages/api/src/github/comment.ts',
  'packages/api/src/db/schema.ts',
  'packages/api/src/routes/pipelines.ts',
  'packages/api/src/lib/idempotency.ts',
  'packages/api/src/embeddings/embed.ts',
  'packages/web/src/components/PipelineCard.tsx',
  'packages/web/src/hooks/useSSEQuerySync.ts',
  'packages/harness/src/registry.ts',
]

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function generateVerdict(): typeof VERDICTS[number] {
  const r = Math.random()
  if (r < 0.55) return 'PASS'
  if (r < 0.85) return 'FLAG'
  return 'BLOCK'
}

function main() {
  console.log('Seeding synthetic review data...\n')

  // Get repos from DB
  const repoMap = new Map<string, { id: number; installationId: number }>()
  const repos = db.select().from(repositories).where(eq(repositories.isActive, true)).all()
  for (const r of repos) {
    repoMap.set(r.fullName, { id: r.id, installationId: r.installationId })
  }

  let totalPipelines = 0
  let totalStages = 0
  let totalFindings = 0

  const now = Date.now()

  for (let i = 0; i < PUSH_SESSIONS.length; i++) {
    const session = PUSH_SESSIONS[i]
    const repoInfo = repoMap.get(session.repo)
    if (!repoInfo) {
      console.log(`  SKIP: ${session.repo} not in database`)
      continue
    }

    // Stagger timestamps over the last 14 days
    const createdAt = new Date(now - (PUSH_SESSIONS.length - i) * 24 * 60 * 60 * 1000)
    const completedAt = new Date(createdAt.getTime() + randomInt(30, 180) * 1000)

    // Create review unit
    const reviewUnitResult = db.insert(reviewUnits).values({
      repoId: repoInfo.id,
      type: 'push',
      title: session.title,
      authorLogin: session.author,
      headSha: session.sha,
      baseSha: session.baseSha,
      ref: 'refs/heads/main',
    }).onConflictDoNothing().run()

    const reviewUnit = db.select({ id: reviewUnits.id }).from(reviewUnits)
      .where(and(
        eq(reviewUnits.repoId, repoInfo.id),
        eq(reviewUnits.type, 'push'),
        eq(reviewUnits.headSha, session.sha),
      )).get()

    if (!reviewUnit) continue

    // Create pipeline run
    const runId = nanoid()
    const deliveryId = `synthetic-${repoInfo.id}-${session.sha}`

    const { changes } = db.insert(pipelineRuns).values({
      id: runId,
      deliveryId,
      reviewUnitId: reviewUnit.id,
      installationId: repoInfo.installationId,
      headSha: session.sha,
      status: 'COMPLETED',
      startedAt: createdAt,
      completedAt,
    }).onConflictDoNothing().run()

    if (changes === 0) {
      console.log(`  SKIP: pipeline already exists for ${session.title}`)
      continue
    }

    totalPipelines++

    // Create stage results
    for (const stage of STAGES) {
      const stageId = nanoid()
      const verdict = generateVerdict()
      const durationMs = randomInt(8000, 45000)
      const templates = FINDING_TEMPLATES[stage]

      // Generate findings for FLAG/BLOCK stages
      const stageFindings: typeof templates = []
      if (verdict !== 'PASS' && templates.length > 0) {
        const numFindings = verdict === 'BLOCK' ? randomInt(2, 4) : randomInt(1, 2)
        const shuffled = [...templates].sort(() => Math.random() - 0.5)
        stageFindings.push(...shuffled.slice(0, Math.min(numFindings, templates.length)))
      }

      const summary = verdict === 'PASS'
        ? `All checks passed. Code changes look clean and well-structured.`
        : verdict === 'FLAG'
          ? `Found ${stageFindings.length} item(s) worth reviewing. See findings below.`
          : `Found ${stageFindings.length} issue(s) that should be addressed before merging.`

      db.insert(stageResults).values({
        id: stageId,
        pipelineRunId: runId,
        stage,
        verdict,
        summary,
        tokenUsage: randomInt(2000, 15000),
        durationMs,
        providerModel: stage === 'ceo' || stage === 'security' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
        completedAt: new Date(createdAt.getTime() + durationMs),
      }).run()
      totalStages++

      // Insert findings
      for (const f of stageFindings) {
        db.insert(findings).values({
          id: nanoid(),
          stageResultId: stageId,
          pipelineRunId: runId,
          severity: f.severity,
          category: f.category,
          title: f.title,
          description: f.description,
          filePath: pick(SOURCE_FILES),
          lineStart: randomInt(10, 200),
          lineEnd: randomInt(201, 300),
          suggestion: f.suggestion ?? null,
        }).run()
        totalFindings++
      }
    }

    console.log(`  Created: ${session.repo} — "${session.title}" (${STAGES.length} stages)`)
  }

  console.log(`\n=== Seed Summary ===`)
  console.log(`  Pipeline runs: ${totalPipelines}`)
  console.log(`  Stage results: ${totalStages}`)
  console.log(`  Findings: ${totalFindings}`)
  console.log(`\nDone.`)
}

main()
