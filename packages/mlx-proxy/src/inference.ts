interface GstackMetadata {
  provider: 'local'
  model: string
  latencyMs: number
  tokensPerSecond: number | null
}

interface ForwardResult {
  _gstack: GstackMetadata
  [key: string]: unknown
}

export async function forwardCompletion(
  body: { model?: string; [key: string]: unknown },
  backendUrl: string
): Promise<ForwardResult> {
  const startTime = Date.now()

  const response = await fetch(`${backendUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const latencyMs = Date.now() - startTime

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Backend returned ${response.status}: ${errorText}`)
  }

  const result = await response.json() as Record<string, unknown>

  const usage = result.usage as { completion_tokens?: number } | undefined
  const tokensPerSecond =
    usage?.completion_tokens && latencyMs > 0
      ? usage.completion_tokens / (latencyMs / 1000)
      : null

  return {
    ...result,
    _gstack: {
      provider: 'local',
      model: body.model ?? 'unknown',
      latencyMs,
      tokensPerSecond,
    },
  }
}
