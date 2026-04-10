/**
 * ModelRouter: 3-layer routing with predictive, proactive, and reactive failover.
 *
 * Implements LLMProvider so callers get router-wrapped providers transparently.
 * Layer 1 (Predictive): Checks burn rate before request, skips providers projected to exhaust cap.
 * Layer 2 (Proactive): External polling recalibrates burn rate (handled by ProactivePoller).
 * Layer 3 (Reactive): Catches 429/billing errors and fails over to next provider in chain.
 *
 * Router NEVER switches providers mid-tool-loop (RTR-06). Failover is per createCompletion() call.
 */

import type { LLMProvider, CompletionParams, CompletionResult } from '../types'
import type { RouterConfig } from './config'
import { ProviderDegradedError, AllProvidersDegradedError } from './errors'
import { isProviderCapError, extractRetryAfterMs } from './reactive'
import { BurnRateCalculator } from './predictive'
import { RequestQueue } from './queue'
import { UsageBuffer } from '../db/usage-buffer'
import type Database from 'better-sqlite3' // harness stays on SQLite for local perf

/** Infer provider from model name prefix. Returns undefined if unknown. */
function inferProviderFromModel(model: string): string | undefined {
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gemini-')) return 'gemini'
  if (model.startsWith('gpt-') || model.startsWith('o1-') || model.startsWith('o3-')) return 'openai'
  if (model.startsWith('qwen')) return 'local'
  return undefined
}

/** Only Anthropic has Opus-equivalent models. Used by quality-aware routing. */
const OPUS_CAPABLE_PROVIDERS = ['anthropic']

/** Stages that require Opus-tier quality. Maps to PROFILES where these use Opus models. */
const OPUS_TIER_STAGES = ['ceo', 'security']

interface DegradedInfo {
  until: number
  reason: string
}

interface RouterLogger {
  info: (obj: Record<string, unknown>, msg: string) => void
  warn: (obj: Record<string, unknown>, msg: string) => void
  error: (obj: Record<string, unknown>, msg: string) => void
}

export interface ModelRouterOptions {
  providers: Map<string, LLMProvider>
  config: RouterConfig
  logger: RouterLogger
  db: Database.Database | null
}

export class ModelRouter implements LLMProvider {
  readonly name: string

  private providers: Map<string, LLMProvider>
  private config: RouterConfig
  private degradedProviders: Map<string, DegradedInfo> = new Map()
  private burnRateCalc: BurnRateCalculator
  private requestQueue: RequestQueue
  private usageBuffer: UsageBuffer
  private logger: RouterLogger

  constructor(options: ModelRouterOptions) {
    this.providers = options.providers
    this.config = options.config
    this.logger = options.logger
    this.burnRateCalc = new BurnRateCalculator(options.db)
    this.requestQueue = new RequestQueue(options.config.maxQueueSize)
    this.usageBuffer = new UsageBuffer(options.db)
    this.usageBuffer.start()

    // Name uses first non-degraded provider from chain
    const primary = this.config.providerChain.find(p => this.providers.has(p))
    this.name = `router(${primary ?? 'unknown'})`
  }

  async createCompletion(params: CompletionParams & { stage?: string }): Promise<CompletionResult> {
    const stage = params.stage

    // Step 1 (Predictive, D-02): Select provider, preferring the one that owns the model
    const preferredProvider = inferProviderFromModel(params.model)
    const selectedProvider = this.selectProvider(stage, preferredProvider)

    if (!selectedProvider) {
      // All providers are degraded or predicted to exhaust
      if (this.config.fallbackPolicy === 'none') {
        throw new AllProvidersDegradedError(this.config.providerChain)
      }

      // Queue the request
      return this.requestQueue.enqueue(params, stage)
    }

    const [providerName, provider] = selectedProvider

    try {
      // Step 2 (Request)
      const result = await provider.createCompletion(params)

      // Step 3 (Record usage)
      this.usageBuffer.record(providerName, result.usage, stage)

      // Step 4 (Log route_decision, D-18)
      const burnRate = this.burnRateCalc.getCurrentBurnRate(providerName)
      this.logger.info({
        event: 'route_decision',
        provider: providerName,
        reason: 'primary_available',
        burnRate: burnRate ? burnRate.hourlyTokens : null,
        predictionAccuracy: null, // No cap hit on success
        fallbackPolicy: this.config.fallbackPolicy,
        queueDepth: this.requestQueue.size,
      }, `Routed to ${providerName}`)

      return result
    } catch (err) {
      // Step 5 (Reactive, D-04)
      if (isProviderCapError(err)) {
        return this.handleCapError(err, providerName, params, stage)
      }

      // Non-cap error: re-throw (RTR-06 -- no mid-conversation switch)
      throw err
    }
  }

  private handleCapError(
    err: unknown,
    providerName: string,
    params: CompletionParams & { stage?: string },
    stage: string | undefined,
  ): Promise<CompletionResult> {
    // Compute prediction accuracy (D-19)
    const predictionAccuracy = this.burnRateCalc.checkPredictionAccuracy(providerName)

    // Calculate cooldown
    const retryAfterMs = extractRetryAfterMs(err)
    const configCooldownMs = this.config.cooldownMinutes * 60 * 1000
    const cooldownMs = Math.max(retryAfterMs ?? 0, configCooldownMs)

    // Mark provider as degraded
    const reason = `Cap/rate limit error: ${(err as Error)?.message ?? 'unknown'}`
    this.degradedProviders.set(providerName, {
      until: Date.now() + cooldownMs,
      reason,
    })

    // Log degradation event (D-18, D-19)
    this.logger.warn({
      event: 'provider_degraded',
      provider: providerName,
      reason,
      cooldownMs,
      predictionAccuracy,
    }, `Provider ${providerName} degraded`)

    // Fallback policy handling
    if (this.config.fallbackPolicy === 'none') {
      throw new ProviderDegradedError(providerName, reason, cooldownMs)
    }

    // Find next available provider
    const nextProvider = this.findNextProvider(providerName, stage)

    if (nextProvider) {
      const [nextName, nextProv] = nextProvider

      // Quality-aware: check if next provider meets stage tier requirement
      if (this.config.fallbackPolicy === 'quality-aware') {
        const isOpusTier = OPUS_TIER_STAGES.includes(stage ?? '')
        const isOpusCapable = OPUS_CAPABLE_PROVIDERS.includes(nextName)

        if (isOpusTier && !isOpusCapable) {
          // Queue rather than degrade quality
          this.logger.info({
            event: 'route_decision',
            provider: nextName,
            reason: 'quality_gate_queued',
            burnRate: null,
            predictionAccuracy: null,
            fallbackPolicy: this.config.fallbackPolicy,
            queueDepth: this.requestQueue.size + 1,
          }, `Stage ${stage} requires Opus-tier, queuing rather than degrading to ${nextName}`)

          return this.requestQueue.enqueue(params, stage)
        }
      }

      // Retry on next provider (recursive for chain)
      this.logger.info({
        event: 'route_decision',
        provider: nextName,
        reason: 'failover',
        burnRate: null,
        predictionAccuracy,
        fallbackPolicy: this.config.fallbackPolicy,
        queueDepth: this.requestQueue.size,
      }, `Failing over from ${providerName} to ${nextName}`)

      return this.retryOnProvider(nextProv, nextName, params, stage)
    }

    // All providers degraded -- queue
    return this.requestQueue.enqueue(params, stage)
  }

  private async retryOnProvider(
    provider: LLMProvider,
    providerName: string,
    params: CompletionParams & { stage?: string },
    stage: string | undefined,
  ): Promise<CompletionResult> {
    // Remap model to the fallback provider's equivalent
    const remappedParams = { ...params, model: this.remapModel(params.model, providerName) }

    try {
      const result = await provider.createCompletion(remappedParams)
      this.usageBuffer.record(providerName, result.usage, stage)
      return result
    } catch (retryErr) {
      if (isProviderCapError(retryErr)) {
        return this.handleCapError(retryErr, providerName, remappedParams, stage)
      }
      throw retryErr
    }
  }

  /**
   * Map a model name to the equivalent model for a different provider.
   * When failing over from Claude to Gemini, we can't send 'claude-sonnet-4-6'
   * to Google's API — it needs a Gemini model name.
   */
  private remapModel(model: string, targetProvider: string): string {
    const lower = model.toLowerCase()

    if (targetProvider === 'gemini') {
      if (lower.includes('opus')) return 'gemini-3.1-pro-preview'
      return 'gemini-3-flash-preview'
    }

    if (targetProvider === 'openai' || targetProvider === 'local') {
      if (lower.includes('opus')) return 'o4-mini'
      return 'gpt-4.1-mini'
    }

    // Same provider or unknown — pass through
    return model
  }

  /**
   * Select provider, preferring the one that owns the model.
   * Falls back to chain order if preferred provider is degraded/unavailable.
   */
  private selectProvider(stage: string | undefined, preferredProvider?: string): [string, LLMProvider] | null {
    // Try preferred provider first (model affinity)
    if (preferredProvider && this.providers.has(preferredProvider)) {
      if (!this.isProviderDegraded(preferredProvider)) {
        const billingCap = this.config.billingCaps[preferredProvider]
        if (!this.burnRateCalc.shouldSwitch(preferredProvider, billingCap, this.config.predictiveThresholdMinutes)) {
          return [preferredProvider, this.providers.get(preferredProvider)!]
        }
      }
    }

    for (const name of this.config.providerChain) {
      const provider = this.providers.get(name)
      if (!provider) continue

      // Check if degraded (auto-clears expired cooldowns)
      if (this.isProviderDegraded(name)) continue

      // Predictive check (D-02): skip if burn rate projects cap exhaustion within threshold
      const billingCap = this.config.billingCaps[name]
      if (this.burnRateCalc.shouldSwitch(name, billingCap, this.config.predictiveThresholdMinutes)) {
        this.logger.info({
          event: 'route_decision',
          provider: name,
          reason: 'predictive_skip',
          burnRate: this.burnRateCalc.getCurrentBurnRate(name)?.hourlyTokens ?? null,
          predictionAccuracy: null,
          fallbackPolicy: this.config.fallbackPolicy,
          queueDepth: this.requestQueue.size,
        }, `Predictive layer skipping ${name} (projected to exhaust cap)`)
        continue
      }

      return [name, provider]
    }

    return null
  }

  /**
   * Find the next available provider in the chain after the given provider.
   */
  private findNextProvider(afterProvider: string, _stage: string | undefined): [string, LLMProvider] | null {
    const idx = this.config.providerChain.indexOf(afterProvider)
    if (idx === -1) return null

    for (let i = idx + 1; i < this.config.providerChain.length; i++) {
      const name = this.config.providerChain[i]
      const provider = this.providers.get(name)
      if (!provider) continue
      if (this.isProviderDegraded(name)) continue
      return [name, provider]
    }

    // Wrap around: check providers before the current one
    for (let i = 0; i < idx; i++) {
      const name = this.config.providerChain[i]
      const provider = this.providers.get(name)
      if (!provider) continue
      if (this.isProviderDegraded(name)) continue
      return [name, provider]
    }

    return null
  }

  /**
   * Check if a provider is degraded. Auto-clears expired cooldowns
   * and drains queued requests through recovered provider.
   */
  private isProviderDegraded(name: string): boolean {
    const info = this.degradedProviders.get(name)
    if (!info) return false

    if (Date.now() >= info.until) {
      this.degradedProviders.delete(name)

      // Drain queued requests through recovered provider
      const provider = this.providers.get(name)
      if (provider && this.requestQueue.size > 0) {
        this.requestQueue.drain(provider).catch((err) => {
          this.logger.error(
            { event: 'queue_drain_error', provider: name, error: String(err) },
            `Failed to drain queue through recovered provider ${name}`,
          )
        })
      }

      return false
    }

    return true
  }

  /** Clean up resources. */
  shutdown(): void {
    this.usageBuffer.shutdown()
    this.requestQueue.clear()
  }
}
