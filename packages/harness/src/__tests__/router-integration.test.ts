import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LLMProvider, CompletionParams, CompletionResult } from '../types'

// -- Mocks for registry dependencies ----------------------------------------

vi.mock('../anthropic', () => ({
  AnthropicProvider: class { readonly name = 'anthropic'; async createCompletion() { return { stopReason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: 10, outputTokens: 5 } } } },
}))
vi.mock('../gemini', () => ({
  GeminiProvider: class { readonly name = 'gemini'; constructor() {}; async createCompletion() { return { stopReason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: 10, outputTokens: 5 } } } },
}))
vi.mock('../openai', () => ({
  OpenAIProvider: class { readonly name = 'openai'; constructor() {}; async createCompletion() { return { stopReason: 'end_turn', content: [{ type: 'text', text: 'ok' }], usage: { inputTokens: 10, outputTokens: 5 } } } },
}))
vi.mock('../config', () => ({
  loadHarnessConfig: () => ({
    anthropicApiKey: 'test-anthropic-key',
    geminiApiKey: 'test-gemini-key',
    openaiApiKey: 'test-openai-key',
    localApiUrl: 'http://localhost:1234/v1',
    pipelineProfile: 'balanced',
  }),
}))

// Mock pino
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }),
}))

// -- Helpers ------------------------------------------------------------------

function mockResult(overrides?: Partial<CompletionResult>): CompletionResult {
  return {
    stopReason: 'end_turn',
    content: [{ type: 'text', text: 'Hello' }],
    usage: { inputTokens: 100, outputTokens: 50 },
    ...overrides,
  }
}

function mockParams(): CompletionParams & { stage?: string } {
  return {
    model: 'claude-sonnet-4-6',
    system: 'You are helpful.',
    messages: [{ role: 'user', content: 'Hi' }],
    tools: [],
    maxTokens: 1024,
  }
}

class MockProvider implements LLMProvider {
  readonly name: string
  callCount = 0
  private handler: (params: CompletionParams) => Promise<CompletionResult>

  constructor(name: string, handler?: (params: CompletionParams) => Promise<CompletionResult>) {
    this.name = name
    this.handler = handler ?? (async () => mockResult())
  }

  async createCompletion(params: CompletionParams): Promise<CompletionResult> {
    this.callCount++
    return this.handler(params)
  }
}

function makeRateLimitError() {
  const err = new Error('Rate limited') as any
  err.status = 429
  err.name = 'RateLimitError'
  return err
}

// Mock reactive module for integration tests too
vi.mock('../router/reactive', () => ({
  isProviderCapError: (err: unknown) => {
    if (!err || typeof err !== 'object') return false
    return (err as any).status === 429 || (err as any).name === 'RateLimitError'
  },
  extractRetryAfterMs: (err: unknown) => {
    if (!err || typeof err !== 'object') return null
    const headers = (err as any).headers
    if (!headers) return null
    const retryAfter = headers['retry-after']
    if (!retryAfter) return null
    return Math.round(parseFloat(retryAfter) * 1000)
  },
}))

// =============================================================================
// ProactivePoller
// =============================================================================

import { ProactivePoller } from '../router/proactive'

describe('ProactivePoller', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('with no API key logs info and does not start polling', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() }
    const onRecalibrate = vi.fn()

    const poller = new ProactivePoller(
      { pollingMinutes: 15, onRecalibrate },
      logger,
    )
    poller.start()

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'proactive_polling_disabled' }),
      expect.any(String),
    )
    expect(onRecalibrate).not.toHaveBeenCalled()

    poller.stop()
  })

  it('stop() cleans up interval without error', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() }
    const poller = new ProactivePoller(
      { pollingMinutes: 15, onRecalibrate: vi.fn() },
      logger,
    )
    expect(() => poller.stop()).not.toThrow()
  })
})

// =============================================================================
// ModelRouter integration
// =============================================================================

import { ModelRouter } from '../router/model-router'
import type { RouterConfig } from '../router/config'

describe('ModelRouter integration', () => {
  function defaultConfig(overrides?: Partial<RouterConfig>): RouterConfig {
    return {
      fallbackPolicy: 'aggressive',
      providerChain: ['primary', 'secondary'],
      predictiveThresholdMinutes: 30,
      cooldownMinutes: 30,
      proactivePollingMinutes: 15,
      maxQueueSize: 50,
      billingCaps: {},
      dbPath: undefined,
      anthropicAdminApiKey: undefined,
      ...overrides,
    }
  }

  it('failover from primary (429) to secondary, logs structured route_decision', async () => {
    let primaryCalls = 0
    const primary = new MockProvider('primary', async () => {
      primaryCalls++
      if (primaryCalls === 1) throw makeRateLimitError()
      return mockResult()
    })
    const secondary = new MockProvider('secondary')

    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn().mockReturnThis() }

    const router = new ModelRouter({
      providers: new Map([['primary', primary], ['secondary', secondary]]),
      config: defaultConfig(),
      logger,
      db: null,
    })

    const result = await router.createCompletion(mockParams())
    expect(result.stopReason).toBe('end_turn')

    // Secondary was used
    expect(secondary.callCount).toBe(1)

    // Structured log was emitted
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'route_decision',
        provider: 'secondary',
        reason: 'failover',
        fallbackPolicy: 'aggressive',
      }),
      expect.any(String),
    )

    router.shutdown()
  })
})

// =============================================================================
// Registry integration (resolveModel with router)
// =============================================================================

import { resolveModel, resetProviders } from '../registry'

describe('resolveModel with router', () => {
  beforeEach(() => {
    resetProviders()
    // Clear router env vars
    delete process.env.ROUTER_FALLBACK_POLICY
    delete process.env.ROUTER_PROVIDER_CHAIN
    delete process.env.STAGE_CEO_MODEL
    delete process.env.STAGE_ENG_MODEL
  })

  afterEach(() => {
    resetProviders()
    delete process.env.ROUTER_FALLBACK_POLICY
    delete process.env.ROUTER_PROVIDER_CHAIN
  })

  it('none policy with single provider returns raw provider (no router wrapper)', () => {
    // Force single-provider chain with 'none' policy
    process.env.ROUTER_FALLBACK_POLICY = 'none'
    process.env.ROUTER_PROVIDER_CHAIN = 'anthropic'
    resetProviders()

    const result = resolveModel('eng')
    // Should NOT be wrapped in router
    expect(result.provider.name).not.toMatch(/^router\(/)
  })

  it('resolveModel with quality-aware policy and multiple providers returns ModelRouter', () => {
    process.env.ROUTER_FALLBACK_POLICY = 'quality-aware'
    process.env.ROUTER_PROVIDER_CHAIN = 'anthropic,gemini,openai'
    resetProviders()

    const result = resolveModel('eng')
    expect(result.provider.name).toMatch(/^router\(/)
  })

  it('resetProviders shuts down router cleanly', () => {
    process.env.ROUTER_FALLBACK_POLICY = 'quality-aware'
    process.env.ROUTER_PROVIDER_CHAIN = 'anthropic,gemini'
    resetProviders()

    resolveModel('eng') // triggers router creation

    expect(() => resetProviders()).not.toThrow()
  })
})

// =============================================================================
// Barrel exports
// =============================================================================

describe('harness barrel exports', () => {
  it('exports ModelRouter from main barrel', async () => {
    const harness = await import('../index')
    expect(harness.ModelRouter).toBeDefined()
  })

  it('exports ProviderDegradedError from main barrel', async () => {
    const harness = await import('../index')
    expect(harness.ProviderDegradedError).toBeDefined()
  })

  it('exports AllProvidersDegradedError from main barrel', async () => {
    const harness = await import('../index')
    expect(harness.AllProvidersDegradedError).toBeDefined()
  })

  it('exports loadRouterConfig from main barrel', async () => {
    const harness = await import('../index')
    expect(harness.loadRouterConfig).toBeDefined()
  })
})
