interface HealthResult {
  status: 'ok' | 'error'
  latencyMs: number
  error?: string
}

export async function checkHealth(backendUrl: string): Promise<HealthResult> {
  const startTime = Date.now()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${backendUrl}/v1/models`, {
      signal: controller.signal,
    })

    clearTimeout(timeout)

    const latencyMs = Date.now() - startTime

    if (!response.ok) {
      return {
        status: 'error',
        latencyMs,
        error: `Backend returned ${response.status}`,
      }
    }

    return { status: 'ok', latencyMs }
  } catch (err) {
    return {
      status: 'error',
      latencyMs: 0,
      error: (err as Error).message,
    }
  }
}
