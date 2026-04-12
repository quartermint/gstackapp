/**
 * Intelligence feed route — aggregates cross-repo patterns from findingEmbeddings.
 *
 * Groups findings by title across repositories, returning only patterns
 * that appear in 2+ repos ("Seen in your other repos").
 *
 * T-20-09: Returns aggregated data already visible in pipeline views — no new exposure.
 */

import { Hono } from 'hono'
import { db } from '../db/client'
import { findingEmbeddings } from '../db/schema'
import { sql, desc } from 'drizzle-orm'

const intelligenceApp = new Hono()

intelligenceApp.get('/feed', async (c) => {
  try {
    // Group findings by title to find cross-repo patterns
    const patterns = await db
      .select({
        title: findingEmbeddings.title,
        description: findingEmbeddings.description,
        severity: findingEmbeddings.severity,
        stage: findingEmbeddings.stage,
        repos: sql<string>`string_agg(DISTINCT ${findingEmbeddings.repoFullName}, ',')`,
        count: sql<number>`count(*)::int`,
      })
      .from(findingEmbeddings)
      .groupBy(
        findingEmbeddings.title,
        findingEmbeddings.description,
        findingEmbeddings.severity,
        findingEmbeddings.stage,
      )
      .having(sql`count(DISTINCT ${findingEmbeddings.repoFullName}) >= 2`)
      .orderBy(desc(sql`count(*)`))
      .limit(50)

    const alerts = patterns.map(p => ({
      title: p.title,
      description: p.description,
      severity: p.severity,
      stage: p.stage,
      repos: (p.repos as string).split(','),
      count: p.count,
    }))

    return c.json({ alerts, total: alerts.length })
  } catch (err) {
    console.error('[intelligence] feed error:', err)
    return c.json({ alerts: [], total: 0 })
  }
})

export default intelligenceApp
