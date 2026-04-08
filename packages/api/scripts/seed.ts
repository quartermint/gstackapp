#!/usr/bin/env tsx
/**
 * Seed CLI -- lightweight version of backfill for initial dashboard population.
 *
 * Targets sessions with ≤ MAX_COMMITS commits to avoid timeouts and rate limits.
 * Forces sequential stage execution (PIPELINE_SEQUENTIAL=1).
 *
 * Usage:
 *   npm run seed --workspace=packages/api -- [options]
 *
 * Options:
 *   --days=30          How far back to scan (default: 30)
 *   --max-commits=5    Max commits per session (default: 5)
 *   --max-sessions=8   Max total sessions to process (default: 8)
 *   --repos=a/b,c/d    Comma-separated repo filter (default: all active)
 *   --dry-run          Show sessions without running pipelines
 */

import { parseArgs } from 'node:util'
import { db } from '../src/db/client'
import { repositories, pipelineRuns as pipelineRunsTable } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { getInstallationOctokit } from '../src/github/auth'
import { groupCommitsIntoSessions, type CommitEntry } from '../src/lib/session-grouper'
import { ensureReviewUnit, tryCreatePipelineRun } from '../src/lib/idempotency'
import { executePipeline } from '../src/pipeline/orchestrator'

// Force sequential stage execution to avoid rate limits
process.env.PIPELINE_SEQUENTIAL = '1'
// Force single-provider mode to avoid Gemini fallback bug
process.env.ROUTER_PROVIDER_CHAIN = 'anthropic'

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    days: { type: 'string', default: '30' },
    'max-commits': { type: 'string', default: '5' },
    'max-sessions': { type: 'string', default: '8' },
    'dry-run': { type: 'boolean', default: false },
    repos: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

if (args.help) {
  console.log(`
gstackapp seed -- populate dashboard with small, fast push reviews

Options:
  --days=N            Days of history to scan (default: 30)
  --max-commits=N     Max commits per session (default: 5)
  --max-sessions=N    Max total sessions to seed (default: 8)
  --repos=a/b,c/d     Comma-separated repo filter (default: all active)
  --dry-run           Show sessions without running pipelines
  --help              Show this help
`)
  process.exit(0)
}

const DAYS = parseInt(args.days!, 10)
const MAX_COMMITS = parseInt(args['max-commits']!, 10)
const MAX_SESSIONS = parseInt(args['max-sessions']!, 10)
const DRY_RUN = args['dry-run']!
const REPO_FILTER = args.repos ? args.repos.split(',').map(r => r.trim()) : null

// Use balanced profile
process.env.PIPELINE_PROFILE = 'balanced'

async function main() {
  const since = new Date()
  since.setDate(since.getDate() - DAYS)
  const sinceISO = since.toISOString()

  console.log(`\ngstackapp seed`)
  console.log(`  Days: ${DAYS} (since ${sinceISO.split('T')[0]})`)
  console.log(`  Max commits/session: ${MAX_COMMITS}`)
  console.log(`  Max sessions: ${MAX_SESSIONS}`)
  console.log(`  Dry run: ${DRY_RUN}`)
  console.log(`  Sequential stages: yes`)
  console.log()

  // Fetch active repos
  const allRepos = db
    .select({
      id: repositories.id,
      fullName: repositories.fullName,
      defaultBranch: repositories.defaultBranch,
      installationId: repositories.installationId,
    })
    .from(repositories)
    .where(eq(repositories.isActive, true))
    .all()

  const repos = REPO_FILTER
    ? allRepos.filter(r => REPO_FILTER.includes(r.fullName))
    : allRepos

  if (repos.length === 0) {
    console.log('No active repos found.')
    process.exit(0)
  }

  // Collect small sessions from all repos
  type SessionWithRepo = {
    session: ReturnType<typeof groupCommitsIntoSessions>[0]
    repo: typeof repos[0]
  }
  const candidates: SessionWithRepo[] = []

  for (const repo of repos) {
    const [owner, repoName] = repo.fullName.split('/')
    try {
      const octokit = getInstallationOctokit(repo.installationId)
      const commits: CommitEntry[] = []
      let page = 1

      while (true) {
        const { data } = await octokit.repos.listCommits({
          owner,
          repo: repoName,
          sha: repo.defaultBranch,
          since: sinceISO,
          per_page: 100,
          page,
        })
        if (data.length === 0) break
        for (const c of data) {
          commits.push({
            sha: c.sha,
            message: c.commit.message,
            authorLogin: c.author?.login ?? c.commit.author?.name ?? 'unknown',
            date: c.commit.author?.date ?? new Date().toISOString(),
            parentSha: c.parents?.[0]?.sha,
            additions: (c.stats as any)?.additions,
            deletions: (c.stats as any)?.deletions,
          })
        }
        if (data.length < 100) break
        page++
        if (page > 3) break
      }

      commits.reverse()
      const sessions = groupCommitsIntoSessions(commits)
      const small = sessions.filter(s => s.commitCount <= MAX_COMMITS)

      for (const session of small) {
        candidates.push({ session, repo })
      }
    } catch (err) {
      console.error(`  Error scanning ${repo.fullName}: ${(err as Error).message}`)
    }
  }

  // Sort by most recent first, take top N
  candidates.sort((a, b) =>
    new Date(b.session.lastCommitDate).getTime() - new Date(a.session.lastCommitDate).getTime()
  )
  const selected = candidates.slice(0, MAX_SESSIONS)

  console.log(`Found ${candidates.length} small sessions (≤${MAX_COMMITS} commits), selected ${selected.length}:\n`)

  for (const { session, repo } of selected) {
    console.log(`  ${repo.fullName}: "${session.title}" (${session.commitCount} commits)`)
  }
  console.log()

  if (DRY_RUN) {
    console.log('(DRY RUN -- no pipelines executed)')
    process.exit(0)
  }

  // Execute pipelines sequentially
  let completed = 0
  let failed = 0

  for (let i = 0; i < selected.length; i++) {
    const { session, repo } = selected[i]

    const reviewUnitId = ensureReviewUnit({
      repoId: repo.id,
      type: 'push',
      title: session.title,
      authorLogin: session.authorLogin,
      headSha: session.headSha,
      baseSha: session.baseSha,
      ref: `refs/heads/${repo.defaultBranch}`,
    })

    const deliveryId = `seed-${repo.id}-${session.headSha}`
    const { created } = tryCreatePipelineRun({
      deliveryId,
      reviewUnitId,
      installationId: repo.installationId,
      headSha: session.headSha,
    })

    if (!created) {
      console.log(`  [${i + 1}/${selected.length}] SKIP (already exists): "${session.title}"`)
      continue
    }

    const run = db
      .select({ id: pipelineRunsTable.id })
      .from(pipelineRunsTable)
      .where(eq(pipelineRunsTable.deliveryId, deliveryId))
      .get()

    if (!run) {
      console.error(`  Failed to find pipeline run for ${deliveryId}`)
      failed++
      continue
    }

    console.log(`  [${i + 1}/${selected.length}] Running: "${session.title}" (${session.commitCount} commits)`)
    const start = Date.now()

    try {
      await executePipeline({
        runId: run.id,
        installationId: repo.installationId,
        repoFullName: repo.fullName,
        headSha: session.headSha,
        baseSha: session.baseSha,
        ref: `refs/heads/${repo.defaultBranch}`,
        type: 'push',
      })
      const elapsed = Math.round((Date.now() - start) / 1000)
      console.log(`  [${i + 1}/${selected.length}] Done in ${elapsed}s: "${session.title}"`)
      completed++
    } catch (err) {
      const elapsed = Math.round((Date.now() - start) / 1000)
      console.error(`  [${i + 1}/${selected.length}] Failed in ${elapsed}s: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\n=== Seed Summary ===`)
  console.log(`  Completed: ${completed}`)
  console.log(`  Failed: ${failed}`)
  console.log(`  Skipped: ${selected.length - completed - failed}`)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
