// ── Scaffold Routes ──────────────────────────────────────────────────────────
// POST /scaffold — Create a new repo from ideation output with template files.
// Per IDEA-04: generates CLAUDE.md + .planning/ structure from ideation context.

import { Hono } from 'hono'
import { z } from 'zod'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { scaffoldRepo } from '../ideation/templates'

const scaffoldApp = new Hono()

const scaffoldSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/, 'Name must be lowercase alphanumeric with hyphens').min(1).max(50),
  stack: z.enum(['react', 'python', 'swift', 'go']),
  description: z.string().max(2000).default(''),
  ideationSessionId: z.string().optional(),
})

// ── POST /scaffold ───────────────────────────────────────────────────────────

scaffoldApp.post('/scaffold', async (c) => {
  const body = await c.req.json()
  const parsed = scaffoldSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.issues }, 400)
  }

  const { name, stack, description, ideationSessionId } = parsed.data

  // Construct target path in home directory
  const targetPath = resolve(homedir(), name)

  // Build ideation excerpt if session ID provided
  let ideationExcerpt: string | undefined
  if (ideationSessionId) {
    // Note: ideation artifacts loading comes from Plan 01
    // Gracefully provide basic context for now
    ideationExcerpt = `Ideation session: ${ideationSessionId}`
  }

  try {
    const result = await scaffoldRepo({
      name,
      path: targetPath,
      stack,
      description,
      ideationExcerpt,
    })

    return c.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scaffold failed'

    if (message.includes('already exists')) {
      return c.json({ error: message }, 409)
    }
    if (message.includes('Invalid project name')) {
      return c.json({ error: message }, 400)
    }

    return c.json({ error: message }, 500)
  }
})

export default scaffoldApp
