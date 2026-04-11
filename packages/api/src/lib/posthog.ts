import { PostHog } from 'posthog-node'

const posthogKey = process.env.POSTHOG_API_KEY
const posthogHost = process.env.POSTHOG_HOST

let client: PostHog | null = null

if (posthogKey) {
  client = new PostHog(posthogKey, {
    host: posthogHost || 'https://us.i.posthog.com',
    flushAt: 10,
    flushInterval: 30000,
  })
}

export function trackLLMCall(params: {
  stage: string
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  runId: string
  pipeline: 'review' | 'ideation'
  success: boolean
  error?: string
}) {
  if (!client) return

  client.capture({
    distinctId: 'gstackapp-server',
    event: 'llm_call',
    properties: {
      $lib: 'posthog-node',
      stage: params.stage,
      provider: params.provider,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      total_tokens: params.inputTokens + params.outputTokens,
      duration_ms: params.durationMs,
      run_id: params.runId,
      pipeline: params.pipeline,
      success: params.success,
      error: params.error,
    },
  })
}

export function shutdownPostHog() {
  return client?.shutdown()
}
