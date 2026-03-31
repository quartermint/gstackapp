import { Hono } from 'hono'
import { db } from '../db/client'
import { repositories } from '../db/schema'
import { eq } from 'drizzle-orm'

const reposApp = new Hono()

// ── GET /repos — List all active repositories ───────────────────────────────

reposApp.get('/repos', (c) => {
  const repos = db
    .select({
      id: repositories.id,
      fullName: repositories.fullName,
      defaultBranch: repositories.defaultBranch,
      installationId: repositories.installationId,
      createdAt: repositories.createdAt,
    })
    .from(repositories)
    .where(eq(repositories.isActive, true))
    .all()

  return c.json(repos)
})

export default reposApp
