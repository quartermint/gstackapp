import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import app from '../index'
import { signPayload } from './helpers/webhook-signer'
import { getTestDb } from './helpers/test-db'
import { githubInstallations, repositories, pullRequests, pipelineRuns } from '../db/schema'
import installCreatedFixture from './fixtures/installation.created.json'
import installDeletedFixture from './fixtures/installation.deleted.json'
import reposAddedFixture from './fixtures/installation_repositories.added.json'
import prOpenedFixture from './fixtures/pull_request.opened.json'

const TEST_SECRET = process.env.GITHUB_WEBHOOK_SECRET!

/** Send a signed webhook event to the app */
async function sendWebhook(event: string, payload: object, deliveryId: string) {
  const body = JSON.stringify(payload)
  const signature = signPayload(body, TEST_SECRET)
  return app.request('/api/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': deliveryId,
      'x-github-event': event,
      'x-hub-signature-256': signature,
    },
    body,
  })
}

describe('installation.created handler', () => {
  it('persists installation row with correct fields', async () => {
    const res = await sendWebhook('installation', installCreatedFixture, 'install-created-1')
    expect(res.status).toBe(200)

    // Wait briefly for async handler
    await new Promise((r) => setTimeout(r, 100))

    const { db } = getTestDb()
    const installations = db.select().from(githubInstallations).all()
    expect(installations).toHaveLength(1)
    expect(installations[0].id).toBe(98765)
    expect(installations[0].accountLogin).toBe('testorg')
    expect(installations[0].accountType).toBe('Organization')
    expect(installations[0].appId).toBe(12345)
    expect(installations[0].status).toBe('active')
  })

  it('persists repository rows from payload', async () => {
    const res = await sendWebhook('installation', installCreatedFixture, 'install-created-2')
    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 100))

    const { db } = getTestDb()
    const repos = db.select().from(repositories).all()
    expect(repos).toHaveLength(1)
    expect(repos[0].id).toBe(123456)
    expect(repos[0].fullName).toBe('testorg/testrepo')
    expect(repos[0].installationId).toBe(98765)
    expect(repos[0].isActive).toBe(true)
  })
})

describe('installation.deleted handler', () => {
  it('sets installation status to deleted', async () => {
    // First create the installation
    await sendWebhook('installation', installCreatedFixture, 'install-setup-1')
    await new Promise((r) => setTimeout(r, 100))

    // Then delete it
    await sendWebhook('installation', installDeletedFixture, 'install-deleted-1')
    await new Promise((r) => setTimeout(r, 100))

    const { db } = getTestDb()
    const installations = db.select().from(githubInstallations).where(eq(githubInstallations.id, 98765)).all()
    expect(installations).toHaveLength(1)
    expect(installations[0].status).toBe('deleted')
  })
})

describe('installation_repositories.added handler', () => {
  it('inserts new repository rows', async () => {
    // First create the installation
    await sendWebhook('installation', installCreatedFixture, 'install-setup-2')
    await new Promise((r) => setTimeout(r, 100))

    // Then add repos
    await sendWebhook('installation_repositories', reposAddedFixture, 'repos-added-1')
    await new Promise((r) => setTimeout(r, 100))

    const { db } = getTestDb()
    const repos = db.select().from(repositories).all()
    expect(repos.length).toBeGreaterThanOrEqual(2)
    const newRepo = repos.find((r) => r.id === 789012)
    expect(newRepo).toBeDefined()
    expect(newRepo!.fullName).toBe('testorg/newrepo')
  })
})

describe('pull_request event handlers', () => {
  // Seed installation and repo before PR tests
  async function seedInstallation() {
    await sendWebhook('installation', installCreatedFixture, `install-seed-${Date.now()}`)
    await new Promise((r) => setTimeout(r, 100))
  }

  it('pull_request.opened creates PR row and pipeline run', async () => {
    await seedInstallation()

    const res = await sendWebhook('pull_request', prOpenedFixture, 'pr-opened-1')
    expect(res.status).toBe(200)

    await new Promise((r) => setTimeout(r, 100))

    const { db } = getTestDb()
    const prs = db.select().from(pullRequests).all()
    expect(prs).toHaveLength(1)
    expect(prs[0].number).toBe(42)
    expect(prs[0].title).toBe('Add feature X')
    expect(prs[0].headSha).toBe('abc123def456')

    const runs = db.select().from(pipelineRuns).all()
    expect(runs).toHaveLength(1)
    expect(runs[0].deliveryId).toBe('pr-opened-1')
    expect(runs[0].status).toBe('PENDING')
  })

  it('pull_request.synchronize creates a new pipeline run (force-push)', async () => {
    await seedInstallation()

    // First: open the PR
    await sendWebhook('pull_request', prOpenedFixture, 'pr-sync-open-1')
    await new Promise((r) => setTimeout(r, 100))

    // Second: synchronize (force-push) with different sha
    const syncPayload = {
      ...prOpenedFixture,
      action: 'synchronize',
      pull_request: {
        ...prOpenedFixture.pull_request,
        head: { ...prOpenedFixture.pull_request.head, sha: 'newsha789xyz' },
      },
    }
    await sendWebhook('pull_request', syncPayload, 'pr-sync-push-1')
    await new Promise((r) => setTimeout(r, 100))

    const { db } = getTestDb()
    const runs = db.select().from(pipelineRuns).all()
    expect(runs).toHaveLength(2)
    expect(runs[0].deliveryId).toBe('pr-sync-open-1')
    expect(runs[1].deliveryId).toBe('pr-sync-push-1')
  })
})
