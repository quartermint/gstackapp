import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { logger as honoLogger } from 'hono/logger'
import { config } from './lib/config'
import { reconcileStaleRuns } from './db/reconcile'
import webhookApp from './github/webhook'
import healthApp from './routes/health'
import feedbackApp from './routes/feedback'
import pipelinesApp from './routes/pipelines'
import reposApp from './routes/repos'
import onboardingApp from './routes/onboarding'
import trendsApp from './routes/trends'
import sseApp from './routes/sse'
import sessionsApp from './routes/sessions'
import agentApp from './routes/agent'

// Build chained API routes for RPC type inference
const apiRoutes = new Hono()
  .route('/pipelines', pipelinesApp)
  .route('/repos', reposApp)
  .route('/feedback', feedbackApp)
  .route('/onboarding', onboardingApp)
  .route('/trends', trendsApp)
  .route('/sessions', sessionsApp)
  .route('/agent', agentApp)
  .route('/', sseApp)

// Build app with chained routes — method chaining is REQUIRED for Hono RPC type inference
const app = new Hono()
  .use('/api/*', honoLogger())
  .route('/', webhookApp)
  .route('/', healthApp)
  .route('/api', apiRoutes)

// Serve frontend static files from packages/web/dist
app.use('/*', serveStatic({ root: 'packages/web/dist' }))
// SPA fallback: serve index.html for all non-API, non-file routes
app.get('/*', serveStatic({ root: 'packages/web/dist', path: 'index.html' }))

// Export AppType for frontend Hono RPC client consumption
export type AppType = typeof app

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
