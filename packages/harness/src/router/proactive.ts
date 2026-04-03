/**
 * Proactive poller for Anthropic Admin API.
 *
 * Periodically queries the Anthropic usage endpoint to recalibrate
 * burn rate predictions. Best-effort: errors are logged, not thrown.
 * Disabled when no anthropicAdminApiKey is configured.
 */

interface ProactivePollerConfig {
  anthropicAdminApiKey?: string
  pollingMinutes: number
  onRecalibrate: (provider: string, actualUsage: number) => void
}

interface PollerLogger {
  info: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
  error: (obj: Record<string, unknown>, msg: string) => void
}

export class ProactivePoller {
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private hasLoggedNoKey = false

  constructor(
    private config: ProactivePollerConfig,
    private logger: PollerLogger,
  ) {}

  /**
   * Start periodic polling. If no API key configured, logs info once and returns.
   */
  start(): void {
    if (!this.config.anthropicAdminApiKey) {
      if (!this.hasLoggedNoKey) {
        this.logger.info(
          { event: 'proactive_polling_disabled', provider: 'anthropic' },
          'Proactive polling disabled for Anthropic: no admin API key configured',
        )
        this.hasLoggedNoKey = true
      }
      return
    }

    // Immediate first poll
    this.poll().catch(() => {})

    // Set up interval
    this.pollInterval = setInterval(
      () => this.poll().catch(() => {}),
      this.config.pollingMinutes * 60 * 1000,
    )
  }

  /**
   * Stop polling and clear interval.
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  /**
   * Poll Anthropic Admin API for usage data.
   * Best-effort: logs errors, does not throw.
   */
  private async poll(): Promise<void> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/organizations/usage', {
        headers: {
          'x-api-key': this.config.anthropicAdminApiKey!,
          'anthropic-version': '2023-06-01',
        },
      })

      if (!response.ok) {
        this.logger.warn(
          { event: 'proactive_poll_error', status: response.status, provider: 'anthropic' },
          `Proactive poll failed with status ${response.status}`,
        )
        return
      }

      const data = await response.json() as Record<string, unknown>

      // Extract usage data -- exact shape may vary
      // Log the response shape for debugging during development
      this.logger.info(
        { event: 'proactive_poll_success', provider: 'anthropic', dataKeys: Object.keys(data) },
        'Proactive poll completed',
      )

      // If usage data is available, recalibrate (D-11)
      const usage = (data as any)?.usage?.total_tokens ?? (data as any)?.total_tokens
      if (typeof usage === 'number') {
        this.config.onRecalibrate('anthropic', usage)
      }
    } catch (err) {
      this.logger.warn(
        { event: 'proactive_poll_error', error: String(err), provider: 'anthropic' },
        'Proactive polling error (best-effort, continuing)',
      )
    }
  }
}
