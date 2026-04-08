import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { forwardCompletion } from './inference'
import { ModelManager } from './models'
import { checkHealth } from './health'
import pino from 'pino'

const logger = pino({ name: 'mlx-proxy' })

const BACKEND_URL = process.env.MLX_BACKEND_URL ?? 'http://localhost:8080'
const PROXY_PORT = parseInt(process.env.MLX_PROXY_PORT ?? '8090', 10)
const BIND_HOST = process.env.MLX_BIND_HOST ?? '100.123.8.125' // Tailscale IP only

const modelManager = new ModelManager(BACKEND_URL)

export const app = new Hono()

app.post('/v1/chat/completions', async (c) => {
  const body = await c.req.json()
  try {
    const result = await forwardCompletion(body, BACKEND_URL)
    return c.json(result)
  } catch (err) {
    logger.error({ err, model: body.model }, 'Inference forwarding failed')
    return c.json({ error: (err as Error).message }, 502)
  }
})

app.get('/v1/models/status', (c) => {
  return c.json(modelManager.getStatus())
})

app.post('/v1/models/load', async (c) => {
  const { model } = await c.req.json()
  if (!model || typeof model !== 'string') {
    return c.json({ error: 'model field required' }, 400)
  }
  try {
    await modelManager.loadModel(model)
    return c.json({ status: 'loaded', model })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

app.get('/health', async (c) => {
  const health = await checkHealth(BACKEND_URL)
  return c.json(health, health.status === 'ok' ? 200 : 503)
})

// Only start server when run directly (not imported for tests)
if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: PROXY_PORT, hostname: BIND_HOST }, (info) => {
    logger.info(
      { port: info.port, host: BIND_HOST, backend: BACKEND_URL },
      'MLX proxy started'
    )
  })
}
