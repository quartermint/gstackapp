import { Hono } from 'hono'

const startTime = Date.now()

const healthApp = new Hono()

healthApp.get('/health', (c) => {
  return c.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  })
})

export default healthApp
