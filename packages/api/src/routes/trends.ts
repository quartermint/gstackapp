import { Hono } from 'hono'
import { rawSql } from '../db/client'
import { calculateQualityScore } from '../lib/scoring'

const trendsApp = new Hono()

// ── Shared validation ───────────────────────────────────────────────────────

function parseRepoId(repoIdStr: string | undefined): number | null {
  if (!repoIdStr) return null
  const parsed = parseInt(repoIdStr, 10)
  return isNaN(parsed) ? null : parsed
}

// ── GET /scores — Quality score trend per repo ──────────────────────────────
// Returns [{date, score}] bucketed by day using calculateQualityScore

trendsApp.get('/scores', async (c) => {
  const repoId = parseRepoId(c.req.query('repoId'))
  if (repoId === null) {
    return c.json({ error: 'repoId query parameter required' }, 400)
  }

  const rows = await rawSql`
    SELECT TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
      SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END) AS critical_count,
      SUM(CASE WHEN f.severity = 'notable' THEN 1 ELSE 0 END) AS notable_count,
      SUM(CASE WHEN f.severity = 'minor' THEN 1 ELSE 0 END) AS minor_count
    FROM pipeline_runs pr
    JOIN pull_requests p ON pr.pr_id = p.id
    LEFT JOIN findings f ON f.pipeline_run_id = pr.id
    WHERE p.repo_id = ${repoId} AND pr.status = 'COMPLETED'
    GROUP BY TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    ORDER BY date ASC
  ` as Array<{
    date: string
    critical_count: number
    notable_count: number
    minor_count: number
  }>

  const result = rows.map((row) => ({
    date: row.date,
    score: calculateQualityScore({
      critical: row.critical_count,
      notable: row.notable_count,
      minor: row.minor_count,
    }),
  }))

  return c.json(result)
})

// ── GET /verdicts — Verdict rate trend per repo and stage ───────────────────
// Returns [{date, pass, flag, block, skip}] bucketed by day

trendsApp.get('/verdicts', async (c) => {
  const repoId = parseRepoId(c.req.query('repoId'))
  if (repoId === null) {
    return c.json({ error: 'repoId query parameter required' }, 400)
  }

  const stage = c.req.query('stage') || null

  const rows = stage
    ? await rawSql`
      SELECT TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        SUM(CASE WHEN sr.verdict = 'PASS' THEN 1 ELSE 0 END) AS pass_count,
        SUM(CASE WHEN sr.verdict = 'FLAG' THEN 1 ELSE 0 END) AS flag_count,
        SUM(CASE WHEN sr.verdict = 'BLOCK' THEN 1 ELSE 0 END) AS block_count,
        SUM(CASE WHEN sr.verdict = 'SKIP' THEN 1 ELSE 0 END) AS skip_count
      FROM pipeline_runs pr
      JOIN pull_requests p ON pr.pr_id = p.id
      JOIN stage_results sr ON sr.pipeline_run_id = pr.id
      WHERE p.repo_id = ${repoId} AND sr.stage = ${stage} AND pr.status = 'COMPLETED'
      GROUP BY TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ORDER BY date ASC
    `
    : await rawSql`
      SELECT TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        SUM(CASE WHEN sr.verdict = 'PASS' THEN 1 ELSE 0 END) AS pass_count,
        SUM(CASE WHEN sr.verdict = 'FLAG' THEN 1 ELSE 0 END) AS flag_count,
        SUM(CASE WHEN sr.verdict = 'BLOCK' THEN 1 ELSE 0 END) AS block_count,
        SUM(CASE WHEN sr.verdict = 'SKIP' THEN 1 ELSE 0 END) AS skip_count
      FROM pipeline_runs pr
      JOIN pull_requests p ON pr.pr_id = p.id
      JOIN stage_results sr ON sr.pipeline_run_id = pr.id
      WHERE p.repo_id = ${repoId} AND pr.status = 'COMPLETED'
      GROUP BY TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      ORDER BY date ASC
    ` as Array<{
    date: string
    pass_count: number
    flag_count: number
    block_count: number
    skip_count: number
  }>

  const result = rows.map((row) => ({
    date: row.date,
    pass: row.pass_count,
    flag: row.flag_count,
    block: row.block_count,
    skip: row.skip_count,
  }))

  return c.json(result)
})

// ── GET /findings — Finding frequency trend per repo ────────────────────────
// Returns [{date, critical, notable, minor}] bucketed by day

trendsApp.get('/findings', async (c) => {
  const repoId = parseRepoId(c.req.query('repoId'))
  if (repoId === null) {
    return c.json({ error: 'repoId query parameter required' }, 400)
  }

  const rows = await rawSql`
    SELECT TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
      SUM(CASE WHEN f.severity = 'critical' THEN 1 ELSE 0 END) AS critical,
      SUM(CASE WHEN f.severity = 'notable' THEN 1 ELSE 0 END) AS notable,
      SUM(CASE WHEN f.severity = 'minor' THEN 1 ELSE 0 END) AS minor
    FROM pipeline_runs pr
    JOIN pull_requests p ON pr.pr_id = p.id
    LEFT JOIN findings f ON f.pipeline_run_id = pr.id
    WHERE p.repo_id = ${repoId} AND pr.status = 'COMPLETED'
    GROUP BY TO_CHAR(pr.completed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    ORDER BY date ASC
  ` as Array<{
    date: string
    critical: number
    notable: number
    minor: number
  }>

  return c.json(rows)
})

export default trendsApp
