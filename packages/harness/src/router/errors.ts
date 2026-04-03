/**
 * Router error types for model failover.
 *
 * ProviderDegradedError: Thrown when a single provider hits rate limits or billing caps.
 * AllProvidersDegradedError: Thrown when every provider in the chain is degraded.
 */

export class ProviderDegradedError extends Error {
  readonly name = 'ProviderDegradedError'

  constructor(
    public readonly provider: string,
    public readonly reason: string,
    public readonly retryAfterMs?: number,
  ) {
    super(`Provider ${provider} degraded: ${reason}`)
  }
}

export class AllProvidersDegradedError extends Error {
  readonly name = 'AllProvidersDegradedError'

  constructor(public readonly providers: string[]) {
    super(`All providers degraded: ${providers.join(', ')}`)
  }
}
