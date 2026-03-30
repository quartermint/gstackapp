import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import { config } from '../lib/config'

/**
 * GitHub App authentication factory and installation client cache.
 *
 * @octokit/auth-app internally caches up to 15K installation tokens
 * and auto-refreshes them at 59 min before expiration. No manual
 * token management is needed -- just use the Octokit instance.
 */

// Cache installation Octokit instances keyed by installation ID
const installationClients = new Map<number, Octokit>()

/**
 * Get an authenticated Octokit client for a specific GitHub App installation.
 * Creates a new client on first call and caches it for subsequent calls.
 * The client automatically handles token refresh via @octokit/auth-app.
 */
export function getInstallationOctokit(installationId: number): Octokit {
  const cached = installationClients.get(installationId)
  if (cached) {
    return cached
  }

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: config.githubAppId,
      privateKey: config.githubPrivateKey,
      installationId,
    },
  })

  installationClients.set(installationId, octokit)
  return octokit
}

/**
 * Remove a cached installation client.
 * Called when an installation is deleted to free resources.
 */
export function clearInstallationClient(installationId: number): void {
  installationClients.delete(installationId)
}
