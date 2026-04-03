#!/usr/bin/env tsx
/**
 * Backfill CLI -- walk git history, group into push sessions, run pipelines.
 *
 * Usage:
 *   npm run backfill --workspace=packages/api -- [options]
 *
 * Options:
 *   --days=30          How far back to scan (default: 30)
 *   --profile=budget   Pipeline model profile (default: budget)
 *   --concurrency=2    Max parallel pipeline runs (default: 2)
 *   --dry-run          Show sessions without running pipelines
 *   --repos=a/b,c/d    Comma-separated repo filter (default: all active)
 *   --help             Show this help message
 */

import { parseArgs } from 'node:util'
import { db } from '../src/db/client'
import { repositories, pipelineRuns as pipelineRunsTable } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { getInstallationOctokit } from '../src/github/auth'
import { groupCommitsIntoSessions, type CommitEntry } from '../src/lib/session-grouper'
import { ensureReviewUnit, tryCreatePipelineRun } from '../src/lib/idempotency'
import { executePipeline } from '../src/pipeline/orchestrator'

// -- Arg parsing --

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    days: { type: 'string', default: '30' },
    profile: { type: 'string', default: 'budget' },
    concurrency: { type: 'string', default: '2' },
    'dry-run': { type: 'boolean', default: false },
    repos: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
})

if (args.help) {
  console.log(`
gstackapp backfill -- seed dashboard with historical push reviews

Options:
  --days=N          Days of history to scan (default: 30)
  --profile=NAME    Pipeline model profile: quality|balanced|budget|local (default: budget)
  --concurrency=N   Max parallel pipeline runs (default: 2)
  --dry-run         Show sessions without running pipelines
  --repos=a/b,c/d   Comma-separated repo filter (default: all active)
  --help            Show this help
`)
  process.exit(0)
}

const DAYS = parseInt(args.days!, 10)
const PROFILE = args.profile!
const CONCURRENCY = parseInt(args.concurrency!, 10)
const DRY_RUN = args['dry-run']!
const REPO_FILTER = args.repos ? args.repos.split(',').map(r => r.trim()) : null

// Set pipeline profile via env var (read by provider resolution)
process.env.PIPELINE_PROFILE = PROFILE

// -- Semaphore for concurrency control --

class Semaphore {
  private queue: Array<() => void> = []
  private active = 0

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++
      return
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++
        resolve()
      })
    })
  }

  release(): void {
    this.active--
    const next = this.queue.shift()
    if (next) next()
  }
}

// -- Main --

async function main() {
  const since = new Date()
  since.setDate(since.getDate() - DAYS)
  const sinceISO = since.toISOString()

  console.log(`\ngstackapp backfill`)
  console.log(`  Days: ${DAYS} (since ${sinceISO.split('T')[0]})`)
  console.log(`  Profile: ${PROFILE}`)
  console.log(`  Concurrency: ${CONCURRENCY}`)
  console.log(`  Dry run: ${DRY_RUN}`)
  console.log()

  // Fetch active repos from DB
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
    console.log('No active repos found. Run the GitHub App installation first.')
    process.exit(0)
  }

  console.log(`Scanning ${repos.length} repo(s)...\n`)

  const semaphore = new Semaphore(CONCURRENCY)
  let totalSessions = 0
  let totalNew = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const repo of repos) {
    const [owner, repoName] = repo.fullName.split('/')
    console.log(`-- ${repo.fullName} --`)

    try {
      const octokit = getInstallationOctokit(repo.installationId)

      // Fetch commit history (paginate up to 300 commits)
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
        if (page > 3) break // Cap at 300 commits per repo
      }

      // Sort chronologically (API returns newest first)
      commits.reverse()

      // Group into push sessions
      const sessions = groupCommitsIntoSessions(commits)
      totalSessions += sessions.length

      // Create review units and check which are new
      const newSessions: typeof sessions = []
      let skipped = 0

      for (const session of sessions) {
        const reviewUnitId = ensureReviewUnit({
          repoId: repo.id,
          type: 'push',
          title: session.title,
          authorLogin: session.authorLogin,
          headSha: session.headSha,
          baseSha: session.baseSha,
          ref: `refs/heads/${repo.defaultBranch}`,
        })

        // Check if pipeline already exists for this review unit
        const deliveryId = `backfill-${repo.id}-${session.headSha}`
        const { created } = tryCreatePipelineRun({
          deliveryId,
          reviewUnitId,
          installationId: repo.installationId,
          headSha: session.headSha,
        })

        if (created) {
          newSessions.push(session)
        } else {
          skipped++
        }
      }

      totalNew += newSessions.length
      totalSkipped += skipped

      console.log(`  ${sessions.length} sessions found, ${newSessions.length} new, ${skipped} skipped`)

      if (DRY_RUN) {
        for (const session of sessions) {
          const isNew = newSessions.includes(session)
          console.log(
            `  ${isNew ? '+' : ' '} ${session.title} (${session.commitCount} commits, +${session.additions}/-${session.deletions}) [${session.authorLogin}]`
          )
        }
        continue
      }

      // Run pipelines for new sessions
      const promises: Promise<void>[] = []

      for (let i = 0; i < newSessions.length; i++) {
        const session = newSessions[i]
        const deliveryId = `backfill-${repo.id}-${session.headSha}`

        promises.push((async () => {
          await semaphore.acquire()
          try {
            console.log(
              `  Running ${i + 1}/${newSessions.length}: "${session.title}" (${session.commitCount} commits)`
            )

            // Find pipeline run by delivery_id
            const run = db
              .select({ id: pipelineRunsTable.id })
              .from(pipelineRunsTable)
              .where(eq(pipelineRunsTable.deliveryId, deliveryId))
              .get()

            if (!run) {
              console.error(`  Failed to find pipeline run for ${deliveryId}`)
              totalFailed++
              return
            }

            await executePipeline({
              runId: run.id,
              installationId: repo.installationId,
              repoFullName: repo.fullName,
              headSha: session.headSha,
              baseSha: session.baseSha,
              ref: `refs/heads/${repo.defaultBranch}`,
              type: 'push',
            })

            console.log(`  Completed: "${session.title}"`)
          } catch (err) {
            console.error(`  Failed: "${session.title}" -- ${(err as Error).message}`)
            totalFailed++
          } finally {
            semaphore.release()
          }
        })())
      }

      await Promise.all(promises)
    } catch (err) {
      console.error(`  Error scanning ${repo.fullName}: ${(err as Error).message}`)
    }

    console.log()
  }

  // Summary
  console.log(`\n=== Backfill Summary ===`)
  console.log(`  Total sessions found: ${totalSessions}`)
  console.log(`  New pipelines run: ${totalNew - totalFailed}`)
  console.log(`  Skipped (already processed): ${totalSkipped}`)
  if (totalFailed > 0) {
    console.log(`  Failed: ${totalFailed}`)
  }
  console.log(`  Profile: ${PROFILE}`)
  if (DRY_RUN) {
    console.log(`  (DRY RUN -- no pipelines were executed)`)
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
