import { Hono } from 'hono'
import { db } from '../db/client'
import { repositories } from '../db/schema'
import { eq } from 'drizzle-orm'

const reposApp = new Hono()

// ── GET / — List all active repositories ────────────────────────────────────
// Mounted at /repos via apiRoutes.route('/repos', reposApp)

reposApp.get('/', async (c) => {
  const repos = await db
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
