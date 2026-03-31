import { Hono } from 'hono'
import { db } from '../db/client'
import {
  pipelineRuns,
  pullRequests,
  repositories,
  stageResults,
  findings,
} from '../db/schema'
import { eq, desc } from 'drizzle-orm'

const pipelinesApp = new Hono()

// ── GET / — List all pipeline runs (reverse-chronological) ──────────────────
// Mounted at /pipelines via apiRoutes.route('/pipelines', pipelinesApp)

pipelinesApp.get('/', (c) => {
  // Query pipeline runs with joined PR, repo, and stage verdict data
  const runs = db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      headSha: pipelineRuns.headSha,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
      createdAt: pipelineRuns.createdAt,
      prNumber: pullRequests.number,
      prTitle: pullRequests.title,
      prAuthorLogin: pullRequests.authorLogin,
      prBaseBranch: pullRequests.baseBranch,
      prState: pullRequests.state,
      repoFullName: repositories.fullName,
    })
    .from(pipelineRuns)
    .innerJoin(pullRequests, eq(pipelineRuns.prId, pullRequests.id))
    .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
    .orderBy(desc(pipelineRuns.createdAt))
    .all()

  // Fetch stage verdicts for all pipeline runs
  const runIds = runs.map((r) => r.id)
  const stages = runIds.length > 0
    ? db
        .select({
          pipelineRunId: stageResults.pipelineRunId,
          stage: stageResults.stage,
          verdict: stageResults.verdict,
        })
        .from(stageResults)
        .all()
        .filter((s) => runIds.includes(s.pipelineRunId))
    : []

  // Group stages by pipeline run
  const stagesByRun = new Map<string, Array<{ stage: string; verdict: string }>>()
  for (const s of stages) {
    const list = stagesByRun.get(s.pipelineRunId) ?? []
    list.push({ stage: s.stage, verdict: s.verdict })
    stagesByRun.set(s.pipelineRunId, list)
  }

  // Build response
  const result = runs.map((run) => ({
    id: run.id,
    status: run.status,
    headSha: run.headSha,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    pr: {
      number: run.prNumber,
      title: run.prTitle,
      authorLogin: run.prAuthorLogin,
      baseBranch: run.prBaseBranch,
      state: run.prState,
    },
    repo: {
      fullName: run.repoFullName,
    },
    stages: stagesByRun.get(run.id) ?? [],
  }))

  return c.json(result)
})

// ── GET /:id — Single pipeline run with full details ────────────────────────

pipelinesApp.get('/:id', (c) => {
  const id = c.req.param('id')

  // Fetch pipeline run with joined PR and repo data
  const run = db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      headSha: pipelineRuns.headSha,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
      createdAt: pipelineRuns.createdAt,
      prNumber: pullRequests.number,
      prTitle: pullRequests.title,
      prAuthorLogin: pullRequests.authorLogin,
      prBaseBranch: pullRequests.baseBranch,
      prState: pullRequests.state,
      repoFullName: repositories.fullName,
    })
    .from(pipelineRuns)
    .innerJoin(pullRequests, eq(pipelineRuns.prId, pullRequests.id))
    .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
    .where(eq(pipelineRuns.id, id))
    .get()

  if (!run) {
    return c.json({ error: 'Pipeline run not found' }, 404)
  }

  // Fetch stage results for this run
  const stageResultRows = db
    .select()
    .from(stageResults)
    .where(eq(stageResults.pipelineRunId, id))
    .all()

  // Fetch all findings for this run
  const findingRows = db
    .select()
    .from(findings)
    .where(eq(findings.pipelineRunId, id))
    .all()

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

  return c.json({
    id: run.id,
    status: run.status,
    headSha: run.headSha,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    createdAt: run.createdAt,
    pr: {
      number: run.prNumber,
      title: run.prTitle,
      authorLogin: run.prAuthorLogin,
      baseBranch: run.prBaseBranch,
      state: run.prState,
    },
    repo: {
      fullName: run.repoFullName,
    },
    stages: stagesWithFindings,
  })
})

export default pipelinesApp
