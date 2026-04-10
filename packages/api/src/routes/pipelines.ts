import { Hono } from 'hono'
import { db, rawSql } from '../db/client'
import {
  pipelineRuns,
  pullRequests,
  repositories,
  reviewUnits,
  stageResults,
  findings,
} from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import { findCrossRepoMatches, type CrossRepoMatch } from '../embeddings/search'

const pipelinesApp = new Hono()

// ── GET / — List all pipeline runs (reverse-chronological) ──────────────────
// Mounted at /pipelines via apiRoutes.route('/pipelines', pipelinesApp)

pipelinesApp.get('/', async (c) => {
  // Query pipeline runs with joined review_units, PR (legacy), and repo data
  const runs = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      headSha: pipelineRuns.headSha,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
      createdAt: pipelineRuns.createdAt,
      // Review unit fields (new: unified PR + push)
      ruType: reviewUnits.type,
      ruTitle: reviewUnits.title,
      ruAuthorLogin: reviewUnits.authorLogin,
      ruPrNumber: reviewUnits.prNumber,
      ruRef: reviewUnits.ref,
      ruRepoId: reviewUnits.repoId,
      // Legacy PR fields (backward compat)
      prNumber: pullRequests.number,
      prTitle: pullRequests.title,
      prAuthorLogin: pullRequests.authorLogin,
      prBaseBranch: pullRequests.baseBranch,
      prState: pullRequests.state,
      prRepoId: pullRequests.repoId,
    })
    .from(pipelineRuns)
    .leftJoin(reviewUnits, eq(pipelineRuns.reviewUnitId, reviewUnits.id))
    .leftJoin(pullRequests, eq(pipelineRuns.prId, pullRequests.id))
    .orderBy(desc(pipelineRuns.createdAt))

  // Resolve repo names from review_unit.repo_id or pr.repo_id
  const repoIds = [...new Set(runs.map(r => r.ruRepoId ?? r.prRepoId).filter(Boolean))] as number[]
  const repos = repoIds.length > 0
    ? await db.select({ id: repositories.id, fullName: repositories.fullName }).from(repositories)
    : []
  const repoMap = new Map(repos.map(r => [r.id, r.fullName]))

  // Fetch stage verdicts for all pipeline runs
  const runIds = runs.map((r) => r.id)
  const stages = runIds.length > 0
    ? (await db
        .select({
          pipelineRunId: stageResults.pipelineRunId,
          stage: stageResults.stage,
          verdict: stageResults.verdict,
        })
        .from(stageResults))
        .filter((s) => runIds.includes(s.pipelineRunId))
    : []

  // Group stages by pipeline run
  const stagesByRun = new Map<string, Array<{ stage: string; verdict: string }>>()
  for (const s of stages) {
    const list = stagesByRun.get(s.pipelineRunId) ?? []
    list.push({ stage: s.stage, verdict: s.verdict })
    stagesByRun.set(s.pipelineRunId, list)
  }

  // Build response with unified reviewUnit shape
  const result = runs.map((run) => ({
    id: run.id,
    status: run.status,
    headSha: run.headSha,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    reviewUnit: {
      type: run.ruType ?? 'pr',
      title: run.ruTitle ?? run.prTitle ?? 'Unknown',
      authorLogin: run.ruAuthorLogin ?? run.prAuthorLogin ?? 'unknown',
      prNumber: run.ruPrNumber ?? run.prNumber ?? null,
      ref: run.ruRef ?? run.prBaseBranch ?? null,
    },
    repo: {
      fullName: repoMap.get(run.ruRepoId ?? run.prRepoId ?? 0) ?? 'unknown',
    },
    stages: stagesByRun.get(run.id) ?? [],
  }))

  return c.json(result)
})

// ── GET /:id — Single pipeline run with full details ────────────────────────

pipelinesApp.get('/:id', async (c) => {
  const id = c.req.param('id')

  // Fetch pipeline run with joined review_units, PR (legacy), and repo data
  const runRows = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      headSha: pipelineRuns.headSha,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
      createdAt: pipelineRuns.createdAt,
      ruType: reviewUnits.type,
      ruTitle: reviewUnits.title,
      ruAuthorLogin: reviewUnits.authorLogin,
      ruPrNumber: reviewUnits.prNumber,
      ruRef: reviewUnits.ref,
      ruRepoId: reviewUnits.repoId,
      prNumber: pullRequests.number,
      prTitle: pullRequests.title,
      prAuthorLogin: pullRequests.authorLogin,
      prBaseBranch: pullRequests.baseBranch,
      prState: pullRequests.state,
      prRepoId: pullRequests.repoId,
    })
    .from(pipelineRuns)
    .leftJoin(reviewUnits, eq(pipelineRuns.reviewUnitId, reviewUnits.id))
    .leftJoin(pullRequests, eq(pipelineRuns.prId, pullRequests.id))
    .where(eq(pipelineRuns.id, id))

  const run = runRows[0]
  if (!run) {
    return c.json({ error: 'Pipeline run not found' }, 404)
  }

  // Resolve repo name
  const repoId = run.ruRepoId ?? run.prRepoId
  const repoRow = repoId
    ? (await db.select({ fullName: repositories.fullName }).from(repositories).where(eq(repositories.id, repoId)))[0] ?? null
    : null

  // Fetch stage results for this run
  const stageResultRows = await db
    .select()
    .from(stageResults)
    .where(eq(stageResults.pipelineRunId, id))

  // Fetch all findings for this run
  const findingRows = await db
    .select()
    .from(findings)
    .where(eq(findings.pipelineRunId, id))

  // Group findings by stage result
  const findingsByStageResult = new Map<string, typeof findingRows>()
  for (const f of findingRows) {
    const list = findingsByStageResult.get(f.stageResultId) ?? []
    list.push(f)
    findingsByStageResult.set(f.stageResultId, list)
  }

  // Build stage results with nested findings
  const stagesWithFindings = stageResultRows.map((sr) => ({
    stage: sr.stage,
    verdict: sr.verdict,
    summary: sr.summary,
    durationMs: sr.durationMs,
    findings: (findingsByStageResult.get(sr.id) ?? []).map((f) => ({
      id: f.id,
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      filePath: f.filePath,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      suggestion: f.suggestion,
      codeSnippet: f.codeSnippet,
      feedbackVote: f.feedbackVote,
    })),
  }))

  // Cross-repo intelligence: find similar findings in other repos
  // Wrapped in try/catch -- if finding_embeddings doesn't exist or has no data, return empty array
  let crossRepoMatches: CrossRepoMatch[] = []
  try {
    const findingIds = findingRows.map((f) => f.id)
    if (findingIds.length > 0) {
      const embeddingRows = await rawSql`
        SELECT finding_id, embedding::text FROM finding_embeddings
        WHERE finding_id = ANY(${findingIds})
      ` as { finding_id: string; embedding: string }[]

      const matchMap = new Map<string, CrossRepoMatch>()
      for (const row of embeddingRows) {
        const nums = row.embedding.slice(1, -1).split(',').map(Number)
        const queryEmbedding = new Float32Array(nums)
        const matches = await findCrossRepoMatches(rawSql, queryEmbedding, repoRow?.fullName ?? 'unknown')
        for (const m of matches) {
          if (!matchMap.has(m.finding_id)) {
            matchMap.set(m.finding_id, m)
          }
        }
      }
      crossRepoMatches = Array.from(matchMap.values())
    }
  } catch {
    // finding_embeddings may not exist yet or no embeddings -- return empty
  }

  return c.json({
    id: run.id,
    status: run.status,
    headSha: run.headSha,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    reviewUnit: {
      type: run.ruType ?? 'pr',
      title: run.ruTitle ?? run.prTitle ?? 'Unknown',
      authorLogin: run.ruAuthorLogin ?? run.prAuthorLogin ?? 'unknown',
      prNumber: run.ruPrNumber ?? run.prNumber ?? null,
      ref: run.ruRef ?? run.prBaseBranch ?? null,
    },
    repo: {
      fullName: repoRow?.fullName ?? 'unknown',
    },
    stages: stagesWithFindings,
    crossRepoMatches,
  })
})

export default pipelinesApp
