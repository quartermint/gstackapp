import type { Webhooks } from '@octokit/webhooks'
import { db } from '../db/client'
import { githubInstallations, repositories } from '../db/schema'
import { getInstallationOctokit, clearInstallationClient } from './auth'
import { ensurePullRequest, tryCreatePipelineRun } from '../lib/idempotency'
import { eq } from 'drizzle-orm'

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
    db.insert(githubInstallations)
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
      .run()

    // Persist selected repositories from the payload
    if (repos) {
      for (const repo of repos) {
        db.insert(repositories)
          .values({
            id: repo.id,
            installationId: installation.id,
            fullName: repo.full_name,
            isActive: true,
          })
          .onConflictDoNothing()
          .run()
      }
    }

    // Per Pitfall 4: When user selects "All repositories", the payload may
    // not include the full list. Fetch via API to ensure completeness.
    if (installation.repository_selection === 'all') {
      try {
        const octokit = getInstallationOctokit(installation.id)
        const { data } = await octokit.apps.listReposAccessibleToInstallation()
        for (const repo of data.repositories) {
          db.insert(repositories)
            .values({
              id: repo.id,
              installationId: installation.id,
              fullName: repo.full_name,
              defaultBranch: repo.default_branch,
              isActive: true,
            })
            .onConflictDoNothing()
            .run()
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
    db.update(githubInstallations)
      .set({ status: 'deleted', updatedAt: new Date() })
      .where(eq(githubInstallations.id, payload.installation.id))
      .run()

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
    for (const repo of payload.repositories_added) {
      db.insert(repositories)
        .values({
          id: repo.id,
          installationId: payload.installation.id,
          fullName: repo.full_name,
          isActive: true,
        })
        .onConflictDoNothing()
        .run()
    }

    console.log(
      `[handlers] ${payload.repositories_added.length} repo(s) added to installation ${payload.installation.id}`
    )
  })

  // ── Repositories Removed from Installation ───────────────────────────────
  webhooks.on('installation_repositories.removed', async ({ payload }) => {
    for (const repo of payload.repositories_removed) {
      db.update(repositories)
        .set({ isActive: false })
        .where(eq(repositories.id, repo.id))
        .run()
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
      // Upsert the pull request record (updates headSha on force-push)
      const prId = await ensurePullRequest({
        repoId: payload.repository.id,
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        authorLogin: payload.pull_request.user?.login ?? 'unknown',
        headSha: payload.pull_request.head.sha,
        baseBranch: payload.pull_request.base.ref,
      })

      // Create pipeline run with idempotency on X-GitHub-Delivery
      const { created, runId } = tryCreatePipelineRun({
        deliveryId: id,
        prId,
        installationId: payload.installation!.id,
        headSha: payload.pull_request.head.sha,
      })

      if (created) {
        console.log(
          `[handlers] Pipeline run created: ${runId} for PR #${payload.pull_request.number} on ${payload.repository.full_name}`
        )
        // TODO: Phase 2 will dispatch pipeline execution here
      } else {
        console.log(`[handlers] Duplicate delivery ignored: ${id}`)
      }
    }
  )
}
