import { Hono } from 'hono'
import { rawSql } from '../db/client'
import { config } from '../lib/config'
import type { OnboardingStep } from '@gstackapp/shared'

const onboardingApp = new Hono()

// ── GET / — Onboarding status detection ─────────────────────────────────────
// Returns the current onboarding step based on DB state:
//   install       — 0 active installations
//   select-repos  — installations exist but 0 active repos
//   first-review  — repos exist but 0 pipeline runs
//   complete      — at least 1 pipeline run exists

onboardingApp.get('/status', async (c) => {
  // Count active installations
  const [installationRow] = await rawSql`
    SELECT COUNT(*) as cnt FROM github_installations WHERE status = 'active'
  ` as [{ cnt: number }]
  const installationCount = installationRow.cnt

  // Count active repositories
  const [repoRow] = await rawSql`
    SELECT COUNT(*) as cnt FROM repositories WHERE is_active = true
  ` as [{ cnt: number }]
  const repoCount = repoRow.cnt

  // Count pipeline runs
  const [pipelineRow] = await rawSql`
    SELECT COUNT(*) as cnt FROM pipeline_runs
  ` as [{ cnt: number }]
  const pipelineCount = pipelineRow.cnt

  // Determine step
  let step: OnboardingStep
  if (installationCount === 0) {
    step = 'install'
  } else if (repoCount === 0) {
    step = 'select-repos'
  } else if (pipelineCount === 0) {
    step = 'first-review'
  } else {
    step = 'complete'
  }

  // Build GitHub App URL from slug or fallback to settings page
  const githubAppUrl = config.githubAppSlug
    ? `https://github.com/apps/${config.githubAppSlug}`
    : 'https://github.com/settings/installations'

  return c.json({
    step,
    installationCount,
    repoCount,
    pipelineCount,
    githubAppUrl,
  })
})

export default onboardingApp
