import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import { config } from './lib/config'
import { reconcileStaleRuns } from './db/reconcile'
import webhookApp from './github/webhook'
import healthApp from './routes/health'

const app = new Hono()

// Request logging for API routes
// Note: Hono's logger only logs request info (method, path, status, duration),
// it does NOT consume the request body, so it's safe to use before webhookApp.
app.use('/api/*', honoLogger())

// Mount webhook route (receives GitHub webhook POSTs with HMAC signature)
app.route('/', webhookApp)

// Mount health check route
app.route('/', healthApp)

// Startup reconciliation: mark any orphaned RUNNING/PENDING pipeline runs as STALE
reconcileStaleRuns()

// Start the Node.js HTTP server
serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(`gstackapp API listening on http://localhost:${info.port}`)
  }
)

export default app
