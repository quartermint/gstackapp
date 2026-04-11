import type { Webhooks } from '@octokit/webhooks'
import { db } from '../db/client'
import { githubInstallations, repositories } from '../db/schema'
import { getInstallationOctokit, clearInstallationClient } from './auth'
import { ensurePullRequest, ensureReviewUnit, tryCreatePipelineRun } from '../lib/idempotency'
import { executePipeline } from '../pipeline/orchestrator'
import { eq } from 'drizzle-orm'

/**
 * Ensure installation and repo rows exist before writing review units or pipeline runs.
 * Prevents FK constraint failures when events arrive before installation.created.
 */
async function ensureInstallationAndRepo(payload: {
  installation: { id: number; account?: any; app_id?: number }
  repository: { id: number; full_name: string; default_branch?: string; owner?: { login?: string } }
  sender?: { login?: string }
}): Promise<void> {
  // Always upsert installation -- use account info if available, fall back to sender/repo owner
  const account = payload.installation.account
  const accountLogin = account && 'login' in account
    ? account.login
    : payload.repository.owner?.login ?? payload.sender?.login ?? 'unknown'
  const accountType = account && 'type' in account
    ? (account as { type: string }).type
    : 'User'
  await db.insert(githubInstallations)
    .values({
      id: payload.installation.id,
      accountLogin,
      accountType,
      appId: payload.installation.app_id ?? 0,
      status: 'active',
    })
    .onConflictDoUpdate({
      target: githubInstallations.id,
      set: { status: 'active', updatedAt: new Date() },
    })

  await db.insert(repositories)
    .values({
      id: payload.repository.id,
      installationId: payload.installation.id,
      fullName: payload.repository.full_name,
      defaultBranch: payload.repository.default_branch ?? 'main',
      isActive: true,
    })
    .onConflictDoNothing()
}

/**
 * Summarize push commits into a title string.
 * Single commit: first line of message.
 * Multiple commits: first commit message + "(+N more)".
 */
function summarizePushCommits(commits: Array<{ message: string }>): string {
  if (commits.length === 0) return 'Empty push'
  const firstLine = commits[0].message.split('\n')[0]
  if (commits.length === 1) return firstLine
  return `${firstLine} (+${commits.length - 1} more)`
}

/**
 * Register all webhook event handlers on the Webhooks instance.
 *
 * Handles:
 * - installation.created / installation.deleted
 * - installation_repositories.added / installation_repositories.removed
 * - pull_request.opened / pull_request.synchronize / pull_request.reopened
 */
export function registerHandlers(webhooks: Webhooks): void {
  // ── Installation Created ─────────────────────────────────────────────────
  // User installed the GitHub App on their account/org
  webhooks.on('installation.created', async ({ payload }) => {
    const { installation, repositories: repos } = payload
    const account = installation.account!
    // Account is a union of User | Enterprise; extract login/type safely
    const accountLogin = 'login' in account ? account.login : account.name
    const accountType = 'type' in account ? (account as { type: string }).type : 'Enterprise'

    // Upsert installation record
    await db.insert(githubInstallations)
      .values({
        id: installation.id,
        accountLogin,
        accountType,
        appId: installation.app_id,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: githubInstallations.id,
        set: { status: 'active', updatedAt: new Date() },
      })

    // Persist selected repositories from the payload
    if (repos) {
      for (const repo of repos) {
        await db.insert(repositories)
          .values({
            id: repo.id,
            installationId: installation.id,
            fullName: repo.full_name,
            isActive: true,
          })
          .onConflictDoNothing()
      }
    }

    // Per Pitfall 4: When user selects "All repositories", the payload may
    // not include the full list. Fetch via API to ensure completeness.
    if (installation.repository_selection === 'all') {
      try {
        const octokit = getInstallationOctokit(installation.id)
        const { data } = await octokit.apps.listReposAccessibleToInstallation()
        for (const repo of data.repositories) {
          await db.insert(repositories)
            .values({
              id: repo.id,
              installationId: installation.id,
              fullName: repo.full_name,
              defaultBranch: repo.default_branch,
              isActive: true,
            })
            .onConflictDoNothing()
        }
      } catch (err) {
        console.error(
          `[handlers] Failed to fetch repos for installation ${installation.id}:`,
          err
        )
      }
    }

    console.log(
      `[handlers] Installation created: ${accountLogin} (${installation.id})`
    )
  })

  // ── Installation Deleted ─────────────────────────────────────────────────
  // User uninstalled the GitHub App
  webhooks.on('installation.deleted', async ({ payload }) => {
    await db.update(githubInstallations)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(githubInstallations.id, payload.installation.id))

    // Clear cached Octokit client since the installation is gone
    clearInstallationClient(payload.installation.id)

    const deletedAccount = payload.installation.account
    const deletedLogin = deletedAccount && 'login' in deletedAccount ? deletedAccount.login : String(payload.installation.id)
    console.log(
      `[handlers] Installation deleted: ${deletedLogin} (${payload.installation.id})`
    )
  })

  // ── Repositories Added to Installation ───────────────────────────────────
  webhooks.on('installation_repositories.added', async ({ payload }) => {
    // Defensive: upsert installation in case installation.created was missed
    const account = payload.installation.account
    if (account) {
      const accountLogin = 'login' in account ? account.login : account.name
      const accountType = 'type' in account ? (account as { type: string }).type : 'Enterprise'
      await db.insert(githubInstallations)
        .values({
          id: payload.installation.id,
          accountLogin,
          accountType,
          appId: payload.installation.app_id,
          status: 'active',
        })
        .onConflictDoUpdate({
          target: githubInstallations.id,
          set: { status: 'active', updatedAt: new Date() },
        })
    }

    for (const repo of payload.repositories_added) {
      await db.insert(repositories)
        .values({
          id: repo.id,
          installationId: payload.installation.id,
          fullName: repo.full_name,
          isActive: true,
        })
        .onConflictDoNothing()
    }

    console.log(
      `[handlers] ${payload.repositories_added.length} repo(s) added to installation ${payload.installation.id}`
    )
  })

  // ── Repositories Removed from Installation ───────────────────────────────
  webhooks.on('installation_repositories.removed', async ({ payload }) => {
    for (const repo of payload.repositories_removed) {
      await db.update(repositories)
        .set({ isActive: false })
        .where(eq(repositories.id, repo.id))
    }

    console.log(
      `[handlers] ${payload.repositories_removed.length} repo(s) removed from installation ${payload.installation.id}`
    )
  })

  // ── Pull Request Events ──────────────────────────────────────────────────
  // The main trigger for pipeline runs. Phase 2 will add actual AI pipeline
  // dispatch here. For now, persist the PR data and create an idempotent
  // pipeline run record.
  webhooks.on(
    [
      'pull_request.opened',
      'pull_request.synchronize',
      'pull_request.reopened',
    ],
    async ({ id, payload }) => {
      // Ensure parent rows exist before FK-dependent writes
      await ensureInstallationAndRepo(payload as any)

      // Upsert the pull request record (updates headSha on force-push)
      const prId = await ensurePullRequest({
        repoId: payload.repository.id,
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        authorLogin: payload.pull_request.user?.login ?? 'unknown',
        headSha: payload.pull_request.head.sha,
        baseBranch: payload.pull_request.base.ref,
      })

      const reviewUnitId = await ensureReviewUnit({
        repoId: payload.repository.id,
        type: 'pr',
        title: payload.pull_request.title,
        authorLogin: payload.pull_request.user?.login ?? 'unknown',
        headSha: payload.pull_request.head.sha,
        baseSha: payload.pull_request.base.ref,
        ref: payload.pull_request.head.ref,
        prNumber: payload.pull_request.number,
      })

      // Create pipeline run with idempotency on X-GitHub-Delivery
      const { created, runId } = await tryCreatePipelineRun({
        deliveryId: id,
        prId,
        reviewUnitId,
        installationId: payload.installation!.id,
        headSha: payload.pull_request.head.sha,
      })

      if (created) {
        console.log(
          `[handlers] Pipeline run created: ${runId} for PR #${payload.pull_request.number} on ${payload.repository.full_name}`
        )
        // Fire-and-forget: pipeline runs asynchronously (GHUB-05: ACK within 10 seconds)
        executePipeline({
          runId,
          installationId: payload.installation!.id,
          repoFullName: payload.repository.full_name,
          prNumber: payload.pull_request.number,
          headSha: payload.pull_request.head.sha,
          headRef: payload.pull_request.head.ref,
          type: 'pr',
        }).catch((err) => {
          console.error(`[handlers] Pipeline failed for run ${runId}:`, err)
        })
      } else {
        console.log(`[handlers] Duplicate delivery ignored: ${id}`)
      }
    }
  )

  // ── Push Events ───────────────────────────────────────────────────────────
  // Review pushes to default branch. Creates review_units with type='push'
  // and dispatches pipeline with commit comparison diff.
  webhooks.on('push', async ({ id, payload }) => {
    // Only review pushes to the default branch
    if (payload.ref !== `refs/heads/${payload.repository.default_branch}`) return
    // Skip empty pushes (branch create/delete)
    if (!payload.commits || payload.commits.length === 0) return
    // Skip force-pushes
    if (payload.forced) return

    // Ensure parent rows exist before FK-dependent writes
    await ensureInstallationAndRepo(payload as any)

    const reviewUnitId = await ensureReviewUnit({
      repoId: payload.repository.id,
      type: 'push',
      title: summarizePushCommits(payload.commits),
      authorLogin: payload.pusher.name ?? 'unknown',
      headSha: payload.after,
      baseSha: payload.before,
      ref: payload.ref,
    })

    const { created, runId } = await tryCreatePipelineRun({
      deliveryId: id,
      reviewUnitId,
      installationId: payload.installation!.id,
      headSha: payload.after,
    })

    if (created) {
      console.log(
        `[handlers] Pipeline run created: ${runId} for push to ${payload.repository.full_name} (${payload.before.slice(0, 7)}..${payload.after.slice(0, 7)})`
      )
      executePipeline({
        runId,
        installationId: payload.installation!.id,
        repoFullName: payload.repository.full_name,
        headSha: payload.after,
        baseSha: payload.before,
        ref: payload.ref,
        type: 'push',
      }).catch((err) => {
        console.error(`[handlers] Pipeline failed for run ${runId}:`, err)
      })
    } else {
      console.log(`[handlers] Duplicate push delivery ignored: ${id}`)
    }
  })
}
