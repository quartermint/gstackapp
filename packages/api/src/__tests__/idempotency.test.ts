import { describe, it, expect } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { githubInstallations, repositories } from '../db/schema'
import { ensurePullRequest, tryCreatePipelineRun } from '../lib/idempotency'

/** Seed prerequisite data: installation + repo + return repoId */
function seedPrerequisites() {
  const { db } = getTestDb()

  db.insert(githubInstallations)
    .values({
      id: 98765,
      accountLogin: 'testorg',
      accountType: 'Organization',
      appId: 12345,
      status: 'active',
    })
    .run()

  db.insert(repositories)
    .values({
      id: 123456,
      installationId: 98765,
      fullName: 'testorg/testrepo',
      isActive: true,
    })
    .run()

  return { installationId: 98765, repoId: 123456 }
}

describe('tryCreatePipelineRun', () => {
  it('creates a pipeline run with new deliveryId', async () => {
    const { installationId, repoId } = seedPrerequisites()

    const prId = await ensurePullRequest({
      repoId,
      number: 42,
      title: 'Test PR',
      authorLogin: 'testuser',
      headSha: 'abc123',
      baseBranch: 'main',
    })

    const result = tryCreatePipelineRun({
      deliveryId: 'unique-delivery-1',
      prId,
      installationId,
      headSha: 'abc123',
    })

    expect(result.created).toBe(true)
    expect(result.runId).toBeTruthy()
    expect(result.runId.length).toBeGreaterThan(0)
  })

  it('returns created=false for duplicate deliveryId', async () => {
    const { installationId, repoId } = seedPrerequisites()

    const prId = await ensurePullRequest({
      repoId,
      number: 42,
      title: 'Test PR',
      authorLogin: 'testuser',
      headSha: 'abc123',
      baseBranch: 'main',
    })

    const first = tryCreatePipelineRun({
      deliveryId: 'duplicate-delivery-1',
      prId,
      installationId,
      headSha: 'abc123',
    })
    expect(first.created).toBe(true)

    const second = tryCreatePipelineRun({
      deliveryId: 'duplicate-delivery-1',
      prId,
      installationId,
      headSha: 'abc123',
    })
    expect(second.created).toBe(false)
    expect(second.runId).toBe('')
  })

  it('creates new run for different deliveryId on same PR (force-push)', async () => {
    const { installationId, repoId } = seedPrerequisites()

    const prId = await ensurePullRequest({
      repoId,
      number: 42,
      title: 'Test PR',
      authorLogin: 'testuser',
      headSha: 'abc123',
      baseBranch: 'main',
    })

    const first = tryCreatePipelineRun({
      deliveryId: 'force-push-delivery-1',
      prId,
      installationId,
      headSha: 'abc123',
    })
    expect(first.created).toBe(true)

    const second = tryCreatePipelineRun({
      deliveryId: 'force-push-delivery-2',
      prId,
      installationId,
      headSha: 'newsha789',
    })
    expect(second.created).toBe(true)
    expect(second.runId).not.toBe(first.runId)
  })
})

describe('ensurePullRequest', () => {
  it('inserts a new pull request and returns its id', async () => {
    seedPrerequisites()

    const id = await ensurePullRequest({
      repoId: 123456,
      number: 42,
      title: 'Test PR',
      authorLogin: 'testuser',
      headSha: 'abc123',
      baseBranch: 'main',
    })

    expect(id).toBeTypeOf('number')
    expect(id).toBeGreaterThan(0)
  })

  it('updates headSha on conflict (same repo + number)', async () => {
    seedPrerequisites()

    const id1 = await ensurePullRequest({
      repoId: 123456,
      number: 42,
      title: 'Test PR',
      authorLogin: 'testuser',
      headSha: 'original-sha',
      baseBranch: 'main',
    })

    const id2 = await ensurePullRequest({
      repoId: 123456,
      number: 42,
      title: 'Updated PR title',
      authorLogin: 'testuser',
      headSha: 'updated-sha',
      baseBranch: 'main',
    })

    expect(id2).toBe(id1) // Same PR, same ID

    // Verify headSha was updated
    const { db } = getTestDb()
    const { pullRequests } = await import('../db/schema')
    const prs = db.select().from(pullRequests).all()
    expect(prs).toHaveLength(1)
    expect(prs[0].headSha).toBe('updated-sha')
    expect(prs[0].title).toBe('Updated PR title')
  })
})
