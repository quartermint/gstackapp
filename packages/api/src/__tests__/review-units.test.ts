import { describe, it, expect } from 'vitest'
import { getTestDb } from './helpers/test-db'
import { githubInstallations, repositories, pullRequests } from '../db/schema'
import { ensureReviewUnit, tryCreatePipelineRun } from '../lib/idempotency'

async function seedPrerequisites() {
  const { db } = getTestDb()

  await db.insert(githubInstallations)
    .values({
      id: 98765,
      accountLogin: 'testorg',
      accountType: 'Organization',
      appId: 12345,
      status: 'active',
    })

  await db.insert(repositories)
    .values({
      id: 123456,
      installationId: 98765,
      fullName: 'testorg/testrepo',
      isActive: true,
    })

  return { installationId: 98765, repoId: 123456 }
}

describe('ensureReviewUnit', () => {
  it('creates a push review unit and returns its id', async () => {
    const { repoId } = await seedPrerequisites()

    const id = await ensureReviewUnit({
      repoId,
      type: 'push',
      title: 'feat: add auth',
      authorLogin: 'rstern',
      headSha: 'abc123',
      baseSha: 'def456',
      ref: 'refs/heads/main',
    })

    expect(id).toBeGreaterThan(0)
  })

  it('creates a PR review unit with prNumber', async () => {
    const { repoId } = await seedPrerequisites()

    const id = await ensureReviewUnit({
      repoId,
      type: 'pr',
      title: 'Fix login bug',
      authorLogin: 'rstern',
      headSha: 'xyz789',
      baseSha: 'main',
      ref: 'refs/heads/fix-login',
      prNumber: 42,
    })

    expect(id).toBeGreaterThan(0)
  })

  it('returns existing id on duplicate (idempotent)', async () => {
    const { repoId } = await seedPrerequisites()

    const id1 = await ensureReviewUnit({
      repoId,
      type: 'push',
      title: 'first',
      authorLogin: 'rstern',
      headSha: 'dup123',
    })
    const id2 = await ensureReviewUnit({
      repoId,
      type: 'push',
      title: 'updated title',
      authorLogin: 'rstern',
      headSha: 'dup123',
    })

    expect(id1).toBe(id2)
  })

  it('allows same head_sha for different types', async () => {
    const { repoId } = await seedPrerequisites()

    const pushId = await ensureReviewUnit({
      repoId,
      type: 'push',
      title: 'push commit',
      authorLogin: 'rstern',
      headSha: 'same-sha',
    })

    const prId = await ensureReviewUnit({
      repoId,
      type: 'pr',
      title: 'PR for same commit',
      authorLogin: 'rstern',
      headSha: 'same-sha',
      prNumber: 1,
    })

    expect(pushId).not.toBe(prId)
  })
})

describe('tryCreatePipelineRun with reviewUnitId', () => {
  it('creates a pipeline run with reviewUnitId (no prId)', async () => {
    const { repoId, installationId } = await seedPrerequisites()

    const ruId = await ensureReviewUnit({
      repoId,
      type: 'push',
      title: 'test push',
      authorLogin: 'rstern',
      headSha: 'pipeline-test-sha',
    })

    const { created, runId } = await tryCreatePipelineRun({
      deliveryId: 'test-delivery-ru-1',
      reviewUnitId: ruId,
      installationId,
      headSha: 'pipeline-test-sha',
    })

    expect(created).toBe(true)
    expect(runId).toBeTruthy()
  })

  it('creates a pipeline run with both prId and reviewUnitId', async () => {
    const { repoId, installationId } = await seedPrerequisites()
    const { db } = getTestDb()

    // Create a PR first
    const prRows = await db.insert(pullRequests).values({
      repoId,
      number: 10,
      title: 'Test PR',
      authorLogin: 'rstern',
      headSha: 'pr-sha',
      baseBranch: 'main',
    }).returning({ id: pullRequests.id })
    const pr = prRows[0]

    const ruId = await ensureReviewUnit({
      repoId,
      type: 'pr',
      title: 'Test PR',
      authorLogin: 'rstern',
      headSha: 'pr-sha',
      prNumber: 10,
    })

    const { created, runId } = await tryCreatePipelineRun({
      deliveryId: 'test-delivery-both',
      prId: pr.id,
      reviewUnitId: ruId,
      installationId,
      headSha: 'pr-sha',
    })

    expect(created).toBe(true)
    expect(runId).toBeTruthy()
  })
})
