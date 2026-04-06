import { Hono } from 'hono'
import { Webhooks } from '@octokit/webhooks'
import { config } from '../lib/config'
import { registerHandlers } from './handlers'

/**
 * Webhook sub-application.
 *
 * Mounts POST /api/webhook with:
 * 1. Raw body read FIRST (before any JSON parsing) -- critical for HMAC verification
 * 2. GitHub header extraction and validation
 * 3. Signature verification via @octokit/webhooks verifyAndReceive
 * 4. Fast ACK -- event handlers run async inside the Webhooks instance
 *
 * CRITICAL: Do NOT apply JSON parsing middleware to this route.
 * The raw body must be preserved for HMAC-SHA256 signature verification.
 */

// Create webhooks instance with the shared secret
const webhooks = new Webhooks({ secret: config.githubWebhookSecret })

// Wire up event handlers
registerHandlers(webhooks)

const webhookApp = new Hono()

webhookApp.post('/api/webhook', async (c) => {
  // 1. Read raw body FIRST -- before any JSON parsing (Pitfall 1)
  const rawBody = await c.req.text()

  // 2. Extract required GitHub webhook headers
  const deliveryId = c.req.header('x-github-delivery')
  const signature = c.req.header('x-hub-signature-256')
  const eventName = c.req.header('x-github-event')

  if (!deliveryId || !signature || !eventName) {
    return c.json({ error: 'Missing required GitHub headers' }, 400)
  }

  // 3. Verify HMAC-SHA256 signature and dispatch to event handlers
  try {
    await webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName,
      signature,
      payload: rawBody, // Raw string, NOT parsed JSON
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isSignatureError = msg.includes('signature does not match')
    if (isSignatureError) {
      console.error('[webhook] Signature verification failed:', err)
      return c.json({ error: 'Signature verification failed' }, 401)
    }
    // Signature passed but a handler threw
    console.error('[webhook] Handler error (signature OK):', err)
    return c.json({ error: 'Internal handler error' }, 500)
  }

  // 4. Fast ACK -- event handlers already dispatched async
  return c.json({ ok: true })
})

export default webhookApp
