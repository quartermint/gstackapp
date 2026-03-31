import { describe, it, expect, vi } from 'vitest'
import app from '../index'
import { getTestDb } from './helpers/test-db'
import { findings, githubInstallations, repositories, pullRequests, pipelineRuns, stageResults } from '../db/schema'
import { syncReactionFeedback } from '../github/comment'

/** Seed a complete finding chain: installation -> repo -> PR -> pipeline run -> stage result -> finding */
function seedFinding(overrides: { id?: string; ghReviewCommentId?: number | null; feedbackVote?: string | null } = {}) {
  const { db, sqlite } = getTestDb()

  db.insert(githubInstallations).values({
    id: 1, accountLogin: 'test', accountType: 'User', appId: 1, status: 'active',
  }).onConflictDoNothing().run()

  db.insert(repositories).values({
    id: 1, installationId: 1, fullName: 'test/repo', isActive: true,
  }).onConflictDoNothing().run()

  // Use raw SQL for PR insert with explicit ID (SQLite autoincrement counter doesn't reset on DELETE)
  sqlite.prepare(
    `INSERT OR IGNORE INTO pull_requests (id, repo_id, number, title, author_login, head_sha, base_branch) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(1, 1, 1, 'Test PR', 'user', 'abc', 'main')

  db.insert(pipelineRuns).values({
    id: 'run-1', deliveryId: 'del-1', prId: 1, installationId: 1, headSha: 'abc', status: 'COMPLETED',
  }).onConflictDoNothing().run()

  db.insert(stageResults).values({
    id: 'sr-1', pipelineRunId: 'run-1', stage: 'security', verdict: 'FLAG',
  }).onConflictDoNothing().run()

  const findingId = overrides.id || 'finding-1'
  db.insert(findings).values({
    id: findingId,
    stageResultId: 'sr-1',
    pipelineRunId: 'run-1',
    severity: 'critical',
    category: 'auth',
    title: 'Test finding',
    description: 'Test description',
    ghReviewCommentId: overrides.ghReviewCommentId ?? null,
    feedbackVote: overrides.feedbackVote ?? null,
  }).onConflictDoNothing().run()

  return findingId
}

describe('POST /api/feedback', () => {
  it('returns 200 with success for valid feedback', async () => {
    const findingId = seedFinding()

    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ findingId, vote: 'up' }),
    })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)

    // Verify stored in DB
    const { db } = getTestDb()
    const updated = db.select().from(findings).all()
    expect(updated[0].feedbackVote).toBe('up')
    expect(updated[0].feedbackSource).toBe('dashboard')
  })

  it('returns 400 for invalid body', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ findingId: 'x' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 for nonexistent findingId', async () => {
    const res = await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ findingId: 'nonexistent', vote: 'down' }),
    })
    expect(res.status).toBe(404)
  })

  it('overwrites previous feedback on same finding', async () => {
    const findingId = seedFinding()

    await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ findingId, vote: 'up' }),
    })

    await app.request('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ findingId, vote: 'down', note: 'false positive' }),
    })

    const { db } = getTestDb()
    const finding = db.select().from(findings).all()[0]
    expect(finding.feedbackVote).toBe('down')
    expect(finding.feedbackNote).toBe('false positive')
  })
})

describe('syncReactionFeedback', () => {
  it('updates finding with more thumbsUp than thumbsDown', async () => {
    seedFinding({ ghReviewCommentId: 999 })

    const mockOctokit = {
      reactions: {
        listForPullRequestReviewComment: vi.fn().mockResolvedValue({
          data: [
            { content: '+1' },
            { content: '+1' },
            { content: '-1' },
          ],
        }),
      },
    } as any

    const count = await syncReactionFeedback(mockOctokit, 'owner', 'repo')
    expect(count).toBe(1)

    const { db } = getTestDb()
    const finding = db.select().from(findings).all()[0]
    expect(finding.feedbackVote).toBe('up')
    expect(finding.feedbackSource).toBe('github_reaction')
  })

  it('updates finding with more thumbsDown', async () => {
    seedFinding({ ghReviewCommentId: 999 })

    const mockOctokit = {
      reactions: {
        listForPullRequestReviewComment: vi.fn().mockResolvedValue({
          data: [{ content: '-1' }, { content: '-1' }],
        }),
      },
    } as any

    const count = await syncReactionFeedback(mockOctokit, 'owner', 'repo')
    expect(count).toBe(1)

    const { db } = getTestDb()
    const finding = db.select().from(findings).all()[0]
    expect(finding.feedbackVote).toBe('down')
  })

  it('skips findings with no reactions', async () => {
    seedFinding({ ghReviewCommentId: 999 })

    const mockOctokit = {
      reactions: {
        listForPullRequestReviewComment: vi.fn().mockResolvedValue({ data: [] }),
      },
    } as any

    const count = await syncReactionFeedback(mockOctokit, 'owner', 'repo')
    expect(count).toBe(0)
  })

  it('handles deleted comment (404) gracefully', async () => {
    seedFinding({ ghReviewCommentId: 999 })

    const mockOctokit = {
      reactions: {
        listForPullRequestReviewComment: vi.fn().mockRejectedValue({ status: 404 }),
      },
    } as any

    const count = await syncReactionFeedback(mockOctokit, 'owner', 'repo')
    expect(count).toBe(0)
  })

  it('skips findings that already have feedback', async () => {
    seedFinding({ ghReviewCommentId: 999, feedbackVote: 'up' })

    const mockOctokit = {
      reactions: {
        listForPullRequestReviewComment: vi.fn(),
      },
    } as any

    const count = await syncReactionFeedback(mockOctokit, 'owner', 'repo')
    expect(count).toBe(0)
    // Should not have called the API since finding already has feedback
    expect(mockOctokit.reactions.listForPullRequestReviewComment).not.toHaveBeenCalled()
  })
})
