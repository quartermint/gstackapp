# Backfill CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI that walks git history for active repos, groups commits into push sessions, and runs the AI review pipeline with Gemini Flash to seed 30 days of quality trend data on the dashboard.

**Architecture:** Single script `packages/api/scripts/backfill.ts` that reads repos from the database, fetches commit history via GitHub API, groups consecutive commits by author with <30min gaps into push sessions, creates review_units for each session, and runs `executePipeline()` with a concurrency semaphore. Idempotent via the `review_units` dedup index — re-running skips already-processed sessions.

**Tech Stack:** tsx, @octokit/rest, better-sqlite3, Drizzle ORM, parseArgs (node:util), Vitest

**Dependency:** Requires Plan 2 (Push Reviews) to be implemented first — uses `review_units` table and `ensureReviewUnit()`.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `packages/api/scripts/backfill.ts` | CLI entry point: arg parsing, repo iteration, pipeline dispatch |
| Create | `packages/api/src/lib/session-grouper.ts` | Pure function: groups commits into push sessions |
| Create | `packages/api/tests/session-grouper.test.ts` | Tests for commit grouping logic |
| Create | `packages/api/tests/backfill-cli.test.ts` | Tests for CLI arg parsing and dry-run output |
| Modify | `packages/api/package.json` | Add `backfill` script |

---

### Task 1: Implement commit session grouper (pure function)

**Files:**
- Create: `packages/api/src/lib/session-grouper.ts`
- Create: `packages/api/tests/session-grouper.test.ts`

- [ ] **Step 1: Write the test**

Create `packages/api/tests/session-grouper.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupCommitsIntoSessions, type CommitEntry, type PushSession } from '../src/lib/session-grouper'

describe('groupCommitsIntoSessions', () => {
  it('groups consecutive commits by same author within 30 min', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'feat: add login', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
      { sha: 'a2', message: 'fix: login redirect', authorLogin: 'rstern', date: '2026-03-20T10:15:00Z' },
      { sha: 'a3', message: 'test: login tests', authorLogin: 'rstern', date: '2026-03-20T10:25:00Z' },
    ]

    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].headSha).toBe('a3')
    expect(sessions[0].baseSha).toBe('a1')
    expect(sessions[0].commitCount).toBe(3)
    expect(sessions[0].authorLogin).toBe('rstern')
    expect(sessions[0].title).toBe('feat: add login (+2 more)')
  })

  it('splits on author change', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'feat: add login', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
      { sha: 'b1', message: 'fix: css layout', authorLogin: 'jdoe', date: '2026-03-20T10:05:00Z' },
    ]

    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(2)
    expect(sessions[0].authorLogin).toBe('rstern')
    expect(sessions[1].authorLogin).toBe('jdoe')
  })

  it('splits on 30-minute gap', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'morning work', authorLogin: 'rstern', date: '2026-03-20T09:00:00Z' },
      { sha: 'a2', message: 'after break', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
    ]

    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(2)
  })

  it('handles single commit as one session', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'hotfix: critical bug', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z' },
    ]

    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].commitCount).toBe(1)
    expect(sessions[0].title).toBe('hotfix: critical bug')
    expect(sessions[0].headSha).toBe('a1')
  })

  it('handles empty commits array', () => {
    const sessions = groupCommitsIntoSessions([])
    expect(sessions).toHaveLength(0)
  })

  it('uses parent SHA for baseSha (commit before first in session)', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'first', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z', parentSha: 'parent-of-a1' },
      { sha: 'a2', message: 'second', authorLogin: 'rstern', date: '2026-03-20T10:10:00Z', parentSha: 'a1' },
    ]

    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].baseSha).toBe('parent-of-a1')
  })

  it('computes additions and deletions sum', () => {
    const commits: CommitEntry[] = [
      { sha: 'a1', message: 'feat', authorLogin: 'rstern', date: '2026-03-20T10:00:00Z', additions: 50, deletions: 10 },
      { sha: 'a2', message: 'fix', authorLogin: 'rstern', date: '2026-03-20T10:10:00Z', additions: 20, deletions: 5 },
    ]

    const sessions = groupCommitsIntoSessions(commits)
    expect(sessions[0].additions).toBe(70)
    expect(sessions[0].deletions).toBe(15)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/api/tests/session-grouper.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement session-grouper.ts**

Create `packages/api/src/lib/session-grouper.ts`:

```ts
/**
 * Groups a chronologically-sorted list of commits into push sessions.
 *
 * A new session starts when:
 * - Author changes
 * - Gap between consecutive commits exceeds 30 minutes
 *
 * Commits MUST be sorted chronologically (oldest first).
 */

const SESSION_GAP_MS = 30 * 60 * 1000 // 30 minutes

export interface CommitEntry {
  sha: string
  message: string
  authorLogin: string
  date: string // ISO 8601
  parentSha?: string
  additions?: number
  deletions?: number
}

export interface PushSession {
  baseSha: string       // parent of first commit (for diff base)
  headSha: string       // last commit SHA
  authorLogin: string
  title: string         // first commit message, with (+N more) if multiple
  commitCount: number
  additions: number
  deletions: number
  firstCommitDate: string
  lastCommitDate: string
}

export function groupCommitsIntoSessions(commits: CommitEntry[]): PushSession[] {
  if (commits.length === 0) return []

  const sessions: PushSession[] = []
  let currentSession: {
    commits: CommitEntry[]
    baseSha: string
    authorLogin: string
  } = {
    commits: [commits[0]],
    baseSha: commits[0].parentSha ?? commits[0].sha,
    authorLogin: commits[0].authorLogin,
  }

  for (let i = 1; i < commits.length; i++) {
    const prev = commits[i - 1]
    const curr = commits[i]

    const gapMs = new Date(curr.date).getTime() - new Date(prev.date).getTime()
    const authorChanged = curr.authorLogin !== currentSession.authorLogin
    const gapExceeded = gapMs > SESSION_GAP_MS

    if (authorChanged || gapExceeded) {
      // Finalize current session
      sessions.push(finalizeSession(currentSession.commits, currentSession.baseSha))
      // Start new session
      currentSession = {
        commits: [curr],
        baseSha: curr.parentSha ?? curr.sha,
        authorLogin: curr.authorLogin,
      }
    } else {
      currentSession.commits.push(curr)
    }
  }

  // Finalize last session
  sessions.push(finalizeSession(currentSession.commits, currentSession.baseSha))

  return sessions
}

function finalizeSession(commits: CommitEntry[], baseSha: string): PushSession {
  const firstLine = commits[0].message.split('\n')[0]
  const title = commits.length === 1
    ? firstLine
    : `${firstLine} (+${commits.length - 1} more)`

  return {
    baseSha,
    headSha: commits[commits.length - 1].sha,
    authorLogin: commits[0].authorLogin,
    title,
    commitCount: commits.length,
    additions: commits.reduce((sum, c) => sum + (c.additions ?? 0), 0),
    deletions: commits.reduce((sum, c) => sum + (c.deletions ?? 0), 0),
    firstCommitDate: commits[0].date,
    lastCommitDate: commits[commits.length - 1].date,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/api/tests/session-grouper.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/lib/session-grouper.ts packages/api/tests/session-grouper.test.ts
git commit -m "feat: add commit session grouper for push session detection"
```

---

### Task 2: Add backfill script entry to package.json

**Files:**
- Modify: `packages/api/package.json`

- [ ] **Step 1: Add the script**

In `packages/api/package.json`, add to the `scripts` section:

```json
"backfill": "tsx scripts/backfill.ts"
```

- [ ] **Step 2: Verify script resolves**

Run: `npm run backfill --workspace=packages/api -- --help 2>&1 || true`
Expected: Error about missing file (we'll create it next) — confirms script wiring works

- [ ] **Step 3: Commit**

```bash
git add packages/api/package.json
git commit -m "chore: add backfill script to package.json"
```

---

### Task 3: Implement backfill CLI with arg parsing and dry-run

**Files:**
- Create: `packages/api/scripts/backfill.ts`
- Create: `packages/api/tests/backfill-cli.test.ts`

- [ ] **Step 1: Write the test for arg parsing**

Create `packages/api/tests/backfill-cli.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseArgs } from 'node:util'

describe('backfill CLI arg parsing', () => {
  it('parses default args', () => {
    const { values } = parseArgs({
      args: [],
      options: {
        days: { type: 'string', default: '30' },
        profile: { type: 'string', default: 'budget' },
        concurrency: { type: 'string', default: '2' },
        'dry-run': { type: 'boolean', default: false },
        repos: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    })

    expect(values.days).toBe('30')
    expect(values.profile).toBe('budget')
    expect(values.concurrency).toBe('2')
    expect(values['dry-run']).toBe(false)
    expect(values.repos).toBeUndefined()
  })

  it('parses custom args', () => {
    const { values } = parseArgs({
      args: ['--days', '7', '--profile', 'balanced', '--concurrency', '4', '--dry-run', '--repos', 'test/repo,test/repo2'],
      options: {
        days: { type: 'string', default: '30' },
        profile: { type: 'string', default: 'budget' },
        concurrency: { type: 'string', default: '2' },
        'dry-run': { type: 'boolean', default: false },
        repos: { type: 'string' },
        help: { type: 'boolean', default: false },
      },
    })

    expect(values.days).toBe('7')
    expect(values.profile).toBe('balanced')
    expect(values.concurrency).toBe('4')
    expect(values['dry-run']).toBe(true)
    expect(values.repos).toBe('test/repo,test/repo2')
  })

  it('splits repos filter correctly', () => {
    const reposArg = 'quartermint/openefb,quartermint/gstackapp'
    const repoFilter = reposArg.split(',').map(r => r.trim())
    expect(repoFilter).toEqual(['quartermint/openefb', 'quartermint/gstackapp'])
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run packages/api/tests/backfill-cli.test.ts`
Expected: PASS

- [ ] **Step 3: Implement backfill.ts**

Create `packages/api/scripts/backfill.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Backfill CLI — walk git history, group into push sessions, run pipelines.
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
import { repositories, githubInstallations } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { getInstallationOctokit } from '../src/github/auth'
import { groupCommitsIntoSessions, type CommitEntry } from '../src/lib/session-grouper'
import { ensureReviewUnit, tryCreatePipelineRun } from '../src/lib/idempotency'
import { executePipeline } from '../src/pipeline/orchestrator'
import { nanoid } from 'nanoid'

// ── Arg parsing ─────────────────────────────────────────────────────────────

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
gstackapp backfill — seed dashboard with historical push reviews

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

// ── Semaphore for concurrency control ───────────────────────────────────────

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

// ── Main ────────────────────────────────────────────────────────────────────

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
    console.log(`── ${repo.fullName} ──`)

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

        // Re-retrieve the runId (tryCreatePipelineRun already created it above)
        // We need to query it back since we can't store it from the first call easily
        // Actually, the pipeline was already created above. We need the runId.
        // Let's restructure: create pipeline run inline here instead.

        promises.push((async () => {
          await semaphore.acquire()
          try {
            console.log(
              `  Running ${i + 1}/${newSessions.length}: "${session.title}" (${session.commitCount} commits)`
            )

            // The pipeline run was already created by tryCreatePipelineRun above.
            // We need to find its runId. Query by delivery_id.
            const { pipelineRuns: pipelineRunsTable } = await import('../src/db/schema')
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
            console.error(`  Failed: "${session.title}" — ${(err as Error).message}`)
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
  console.log(`\n═══ Backfill Summary ═══`)
  console.log(`  Total sessions found: ${totalSessions}`)
  console.log(`  New pipelines run: ${totalNew - totalFailed}`)
  console.log(`  Skipped (already processed): ${totalSkipped}`)
  if (totalFailed > 0) {
    console.log(`  Failed: ${totalFailed}`)
  }
  console.log(`  Profile: ${PROFILE}`)
  if (DRY_RUN) {
    console.log(`  (DRY RUN — no pipelines were executed)`)
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run packages/api/tests/backfill-cli.test.ts`
Expected: PASS

- [ ] **Step 5: Run dry-run to verify it works**

Run: `npm run backfill --workspace=packages/api -- --dry-run --days=7`
Expected: Lists repos and sessions without running pipelines. If no repos in DB, prints "No active repos found."

- [ ] **Step 6: Commit**

```bash
git add packages/api/scripts/backfill.ts packages/api/tests/backfill-cli.test.ts
git commit -m "feat: add backfill CLI for seeding dashboard with historical push reviews"
```

---

### Task 4: Test full backfill flow with budget profile

**Files:**
- No new files

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (existing + session-grouper + CLI arg parsing)

- [ ] **Step 2: Run backfill with small scope**

Run: `npm run backfill --workspace=packages/api -- --days=3 --profile=budget --repos=quartermint/gstackapp --concurrency=1`
Expected: Finds recent commits, groups into sessions, runs pipeline with Gemini Flash

- [ ] **Step 3: Verify dashboard shows backfilled data**

Start dev server: `npm run dev --workspace=packages/api`
Start frontend: `npm run dev --workspace=packages/web`
Navigate to dashboard. Verify:
- Backfilled push reviews appear in the feed with "Push" badge
- Trends charts show data points for the backfilled period
- Stage results show provider badge (e.g., "via gemini:gemini-3-flash-preview")

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: backfill integration fixes from end-to-end testing"
```

---

### Task 5: Run full 30-day backfill

**Files:**
- No new files

- [ ] **Step 1: Dry run first**

Run: `npm run backfill --workspace=packages/api -- --dry-run --days=30`
Expected: Shows session counts per repo, estimated scope

- [ ] **Step 2: Execute full backfill**

Run: `npm run backfill --workspace=packages/api -- --days=30 --profile=budget --concurrency=2`
Expected: Processes all active repos, ~50-80 sessions, takes 2-3 hours

- [ ] **Step 3: Verify trends populated**

Check dashboard trends view — should now show 30 days of quality data across repos.

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: complete 30-day backfill — dashboard trends populated"
```
