import { simpleGit } from 'simple-git'
import { execFileSync } from 'node:child_process'
import { rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { getInstallationOctokit } from '../github/auth'
import { logger } from '../lib/logger'

/**
 * Shallow clone a repository for AI code reading.
 *
 * Security: After clone, all symlinks are removed to prevent sandbox escape.
 * The clone is depth-1 single-branch for speed and minimal disk usage.
 *
 * @param installationId - GitHub App installation ID for authentication
 * @param repoFullName - Full repo name (e.g., "owner/repo")
 * @param headRef - Branch or ref to clone
 * @returns Path to the cloned directory
 */
export async function cloneRepo(
  installationId: number,
  repoFullName: string,
  headRef: string
): Promise<string> {
  const safeName = repoFullName.replace('/', '-')
  const clonePath = await mkdtemp(join(tmpdir(), `gstack-${safeName}-`))

  // Get authenticated clone URL via installation token
  const octokit = getInstallationOctokit(installationId)
  let token: string

  try {
    // Primary: use octokit auth to get installation token
    const auth = await (octokit as any).auth({
      type: 'installation',
      installationId,
    })
    token = auth.token
  } catch {
    // Fallback: request token via REST API
    const response = await octokit.rest.apps.createInstallationAccessToken({
      installation_id: installationId,
    })
    token = response.data.token
  }

  const cloneUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`

  // Shallow clone: depth 1, single branch for speed
  await simpleGit().clone(cloneUrl, clonePath, [
    '--depth',
    '1',
    '--single-branch',
    '--branch',
    headRef,
  ])

  // Remove all symlinks to prevent sandbox escape
  try {
    execFileSync('find', ['.', '-type', 'l', '-delete'], {
      cwd: clonePath,
      timeout: 5000,
    })
  } catch {
    // No symlinks is the common case -- errors here are fine
  }

  logger.info({ repoFullName, headRef, clonePath }, 'Repository cloned')
  return clonePath
}

/**
 * Clean up a cloned repository directory.
 * Logs errors but does not throw -- cleanup failure is non-fatal.
 */
export async function cleanupClone(clonePath: string): Promise<void> {
  try {
    await rm(clonePath, { recursive: true, force: true })
    logger.info({ clonePath }, 'Clone cleaned up')
  } catch (err) {
    logger.error({ clonePath, err }, 'Failed to clean up clone')
  }
}
