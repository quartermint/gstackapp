import { Hono } from 'hono'
import { db } from '../db/client'
import { findings } from '../db/schema'
import { eq } from 'drizzle-orm'
import { FeedbackSubmissionSchema } from '@gstackapp/shared'

const feedbackApp = new Hono()

feedbackApp.post('/feedback', async (c) => {
  const raw = await c.req.json().catch(() => null)
  if (!raw) {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const result = FeedbackSubmissionSchema.safeParse(raw)
  if (!result.success) {
    return c.json({ error: 'Invalid request', details: result.error.issues }, 400)
  }

  const { findingId, vote, note } = result.data

  // Check finding exists
  const finding = db.select().from(findings).where(eq(findings.id, findingId)).get()
  if (!finding) {
    return c.json({ error: 'Finding not found' }, 404)
  }

  // Store feedback
  db.update(findings)
    .set({
      feedbackVote: vote,
      feedbackNote: note ?? null,
      feedbackSource: 'dashboard',
      feedbackAt: new Date(),
    })
    .where(eq(findings.id, findingId))
    .run()

  return c.json({ success: true })
})

export default feedbackApp
