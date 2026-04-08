import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// -- Error Types ---------------------------------------------------------------

describe('ProviderDegradedError', () => {
  it('extends Error with correct properties', async () => {
    const { ProviderDegradedError } = await import('../router/errors')
    const err = new ProviderDegradedError('anthropic', 'rate_limit', 60000)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ProviderDegradedError')
    expect(err.provider).toBe('anthropic')
    expect(err.reason).toBe('rate_limit')
    expect(err.retryAfterMs).toBe(60000)
    expect(err.message).toContain('anthropic')
  })

  it('retryAfterMs defaults to undefined', async () => {
    const { ProviderDegradedError } = await import('../router/errors')
    const err = new ProviderDegradedError('gemini', 'billing_cap')
    expect(err.retryAfterMs).toBeUndefined()
  })
})

describe('AllProvidersDegradedError', () => {
  it('extends Error with provider list', async () => {
    const { AllProvidersDegradedError } = await import('../router/errors')
    const err = new AllProvidersDegradedError(['anthropic', 'gemini', 'openai'])
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('AllProvidersDegradedError')
    expect(err.providers).toEqual(['anthropic', 'gemini', 'openai'])
    expect(err.message).toContain('All providers degraded')
  })
})

// -- Router Config -------------------------------------------------------------

describe('loadRouterConfig', () => {
  const savedEnv: Record<string, string | undefined> = {}
  const envKeys = [
    'ROUTER_FALLBACK_POLICY',
    'ROUTER_PROVIDER_CHAIN',
    'ROUTER_PREDICTIVE_THRESHOLD_MINUTES',
    'ROUTER_COOLDOWN_MINUTES',
    'ROUTER_PROACTIVE_POLLING_MINUTES',
    'ROUTER_MAX_QUEUE_SIZE',
    'HARNESS_DB_PATH',
    'ANTHROPIC_ADMIN_API_KEY',
    'ROUTER_BILLING_CAP_ANTHROPIC',
    'ROUTER_BILLING_CAP_GEMINI',
    'ROUTER_BILLING_CAP_OPENAI',
  ]

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key]
      } else {
        delete process.env[key]
      }
    }
  })

  it('returns correct defaults when no env vars set', async () => {
    const { loadRouterConfig } = await import('../router/config')
    const config = loadRouterConfig()
    expect(config.fallbackPolicy).toBe('none')
    expect(config.providerChain).toEqual(['anthropic', 'gemini', 'openai'])
    expect(config.predictiveThresholdMinutes).toBe(30)
    expect(config.cooldownMinutes).toBe(30)
    expect(config.proactivePollingMinutes).toBe(15)
    expect(config.maxQueueSize).toBe(50)
    expect(config.billingCaps).toEqual({})
    expect(config.dbPath).toBeUndefined()
    expect(config.anthropicAdminApiKey).toBeUndefined()
  })

  it('parses ROUTER_PROVIDER_CHAIN into array', async () => {
    process.env.ROUTER_PROVIDER_CHAIN = 'anthropic,gemini'
    const { loadRouterConfig } = await import('../router/config')
    const config = loadRouterConfig()
    expect(config.providerChain).toEqual(['anthropic', 'gemini'])
  })

  it('parses billing caps from env vars', async () => {
    process.env.ROUTER_BILLING_CAP_ANTHROPIC = '10000000'
    process.env.ROUTER_BILLING_CAP_GEMINI = '5000000'
    const { loadRouterConfig } = await import('../router/config')
    const config = loadRouterConfig()
    expect(config.billingCaps.anthropic).toBe(10000000)
    expect(config.billingCaps.gemini).toBe(5000000)
    expect(config.billingCaps.openai).toBeUndefined()
  })

  it('reads all env vars correctly', async () => {
    process.env.ROUTER_FALLBACK_POLICY = 'aggressive'
    process.env.ROUTER_PROVIDER_CHAIN = 'gemini,openai'
    process.env.ROUTER_PREDICTIVE_THRESHOLD_MINUTES = '60'
    process.env.ROUTER_COOLDOWN_MINUTES = '15'
    process.env.ROUTER_PROACTIVE_POLLING_MINUTES = '5'
    process.env.ROUTER_MAX_QUEUE_SIZE = '100'
    process.env.HARNESS_DB_PATH = '/tmp/harness.db'
    process.env.ANTHROPIC_ADMIN_API_KEY = 'admin-key-123'
    process.env.ROUTER_BILLING_CAP_OPENAI = '20000000'
    const { loadRouterConfig } = await import('../router/config')
    const config = loadRouterConfig()
    expect(config.fallbackPolicy).toBe('aggressive')
    expect(config.providerChain).toEqual(['gemini', 'openai'])
    expect(config.predictiveThresholdMinutes).toBe(60)
    expect(config.cooldownMinutes).toBe(15)
    expect(config.proactivePollingMinutes).toBe(5)
    expect(config.maxQueueSize).toBe(100)
    expect(config.dbPath).toBe('/tmp/harness.db')
    expect(config.anthropicAdminApiKey).toBe('admin-key-123')
    expect(config.billingCaps.openai).toBe(20000000)
  })
})

// -- isProviderCapError --------------------------------------------------------

describe('isProviderCapError', () => {
  // Both Anthropic and OpenAI SDK constructors require a Headers-like object with .get()
  const makeHeaders = (h: Record<string, string> = {}) => new Headers(h)

  it('returns true for Anthropic RateLimitError (429)', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const err = new Anthropic.RateLimitError(429, { message: 'rate limited' }, 'rate limited', makeHeaders())
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(err)).toBe(true)
  })

  it('returns true for Anthropic BadRequestError with billing_error type', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const err = new Anthropic.BadRequestError(400, {
      type: 'error',
      error: { type: 'billing_error', message: 'billing cap exceeded' },
    }, 'billing error', makeHeaders())
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(err)).toBe(true)
  })

  it('returns false for Anthropic BadRequestError that is not billing_error', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const err = new Anthropic.BadRequestError(400, {
      type: 'error',
      error: { type: 'invalid_request_error', message: 'bad input' },
    }, 'bad request', makeHeaders())
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(err)).toBe(false)
  })

  it('returns true for OpenAI RateLimitError (429)', async () => {
    const OpenAI = (await import('openai')).default
    const err = new OpenAI.RateLimitError(429, { message: 'rate limited' }, 'rate limited', makeHeaders())
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(err)).toBe(true)
  })

  it('returns true for GoogleGenerativeAIFetchError with status 429', async () => {
    const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai')
    const err = new GoogleGenerativeAIFetchError('rate limited', 429, 'Too Many Requests')
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(err)).toBe(true)
  })

  it('returns true for GoogleGenerativeAIFetchError with 403 RESOURCE_EXHAUSTED', async () => {
    const { GoogleGenerativeAIFetchError } = await import('@google/generative-ai')
    const err = new GoogleGenerativeAIFetchError('exhausted', 403, 'RESOURCE_EXHAUSTED')
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(err)).toBe(true)
  })

  it('returns false for generic Error', async () => {
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(new Error('generic'))).toBe(false)
  })

  it('returns false for null/undefined', async () => {
    const { isProviderCapError } = await import('../router/reactive')
    expect(isProviderCapError(null)).toBe(false)
    expect(isProviderCapError(undefined)).toBe(false)
  })
})

// -- extractRetryAfterMs -------------------------------------------------------

describe('extractRetryAfterMs', () => {
  it('parses retry-after header as seconds and converts to ms', async () => {
    const { extractRetryAfterMs } = await import('../router/reactive')
    // Create an error-like object with headers
    const err = {
      headers: {
        'retry-after': '30',
      },
    }
    expect(extractRetryAfterMs(err)).toBe(30000)
  })

  it('returns null when no retry-after header', async () => {
    const { extractRetryAfterMs } = await import('../router/reactive')
    const err = { headers: {} }
    expect(extractRetryAfterMs(err)).toBeNull()
  })

  it('returns null for error without headers', async () => {
    const { extractRetryAfterMs } = await import('../router/reactive')
    expect(extractRetryAfterMs(new Error('no headers'))).toBeNull()
  })
})
