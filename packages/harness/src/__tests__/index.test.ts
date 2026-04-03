import { describe, it, expect, vi, beforeEach } from 'vitest'

// -- Mocks --------------------------------------------------------------------

vi.mock('../anthropic', () => ({
  AnthropicProvider: class { readonly name = 'anthropic' },
}))
vi.mock('../gemini', () => ({
  GeminiProvider: class { readonly name = 'gemini'; constructor() {} },
}))
vi.mock('../openai', () => ({
  OpenAIProvider: class { readonly name = 'openai'; constructor() {} },
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

import { getProvider, resolveModel, resetProviders, PROFILES } from '../registry'

// -- Setup --------------------------------------------------------------------

beforeEach(() => {
  resetProviders()
  delete process.env.STAGE_CEO_MODEL
  delete process.env.STAGE_ENG_MODEL
  // Force passthrough (no router) for registry unit tests
  process.env.ROUTER_FALLBACK_POLICY = 'none'
  process.env.ROUTER_PROVIDER_CHAIN = 'anthropic'
})

// -- Tests --------------------------------------------------------------------

describe('PROFILES', () => {
  it('quality profile uses Opus for all stages', () => {
    expect(PROFILES.quality.default).toBe('anthropic:claude-opus-4-6')
  })

  it('budget profile uses Gemini for all stages', () => {
    expect(PROFILES.budget.default).toBe('gemini:gemini-3-flash-preview')
  })
})

describe('resolveModel', () => {
  it('balanced profile default -- eng stage returns sonnet', () => {
    const result = resolveModel('eng')
    expect(result.providerName).toBe('anthropic')
    expect(result.model).toBe('claude-sonnet-4-6')
  })

  it('balanced profile stage override -- ceo stage returns opus', () => {
    const result = resolveModel('ceo')
    expect(result.providerName).toBe('anthropic')
    expect(result.model).toBe('claude-opus-4-6')
  })

  it('per-stage env var override -- STAGE_CEO_MODEL overrides profile', () => {
    process.env.STAGE_CEO_MODEL = 'gemini:gemini-3-flash-preview'
    const result = resolveModel('ceo')
    expect(result.providerName).toBe('gemini')
    expect(result.model).toBe('gemini-3-flash-preview')
  })

  it('per-stage env var override -- returns matching provider instance', () => {
    process.env.STAGE_CEO_MODEL = 'gemini:gemini-3-flash-preview'
    const result = resolveModel('ceo')
    expect(result.provider.name).toBe('gemini')
  })
})

describe('getProvider', () => {
  it('returns anthropic provider', () => {
    const provider = getProvider('anthropic')
    expect(provider.name).toBe('anthropic')
  })

  it('returns gemini provider', () => {
    const provider = getProvider('gemini')
    expect(provider.name).toBe('gemini')
  })

  it('returns openai provider', () => {
    const provider = getProvider('openai')
    expect(provider.name).toBe('openai')
  })

  it('local maps to openai provider', () => {
    const provider = getProvider('local')
    expect(provider.name).toBe('openai')
  })

  it('unknown provider throws descriptive error', () => {
    expect(() => getProvider('unknown')).toThrow(
      'Provider "unknown" not configured'
    )
  })
})

describe('resetProviders', () => {
  it('clears provider cache without error', () => {
    getProvider('anthropic')
    expect(() => resetProviders()).not.toThrow()
    const provider = getProvider('anthropic')
    expect(provider.name).toBe('anthropic')
  })
})
