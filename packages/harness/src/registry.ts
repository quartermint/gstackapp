import { loadHarnessConfig } from './config'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'
import type { LLMProvider } from './types'
import { ModelRouter, loadRouterConfig } from './router'
import { getHarnessDb } from './db/client'
import pino from 'pino'

export type { LLMProvider, CompletionParams, CompletionResult, ContentBlock, ConversationMessage, ToolResultBlock, ToolDefinition } from './types'

const logger = pino({ name: 'harness-router' })

// -- Model Profiles ----------------------------------------------------------

export const PROFILES: Record<string, Record<string, string>> = {
  quality: {
    default: 'anthropic:claude-opus-4-6',
  },
  balanced: {
    default: 'anthropic:claude-sonnet-4-6',
    ceo: 'anthropic:claude-opus-4-6',
    security: 'anthropic:claude-opus-4-6',
  },
  budget: {
    default: 'gemini:gemini-3-flash-preview',
    ceo: 'gemini:gemini-3.1-pro-preview',
    security: 'gemini:gemini-3.1-pro-preview',
  },
  local: {
    default: 'local:qwen3-coder-30b',
  },
}

// -- Provider Singletons -----------------------------------------------------

let _providers: Map<string, LLMProvider> | null = null
let _router: ModelRouter | null = null

function initProviders(): Map<string, LLMProvider> {
  if (_providers) return _providers
  _providers = new Map()

  const cfg = loadHarnessConfig()

  _providers.set('anthropic', new AnthropicProvider())

  if (cfg.geminiApiKey) {
    _providers.set('gemini', new GeminiProvider(cfg.geminiApiKey))
  }

  if (cfg.openaiApiKey) {
    _providers.set('openai', new OpenAIProvider({ apiKey: cfg.openaiApiKey }))
  }

  if (cfg.localApiUrl) {
    _providers.set('local', new OpenAIProvider({
      apiKey: 'not-needed',
      baseURL: cfg.localApiUrl,
    }))
  }

  return _providers
}

// -- Router ------------------------------------------------------------------

/**
 * Lazy-initialize the router. Returns null for passthrough mode
 * (single provider + 'none' policy = no router overhead).
 */
function getRouter(): ModelRouter | null {
  if (_router) return _router

  const config = loadRouterConfig()

  // Passthrough: no router overhead when only one provider and 'none' policy
  const providers = initProviders()
  const configuredProviders = config.providerChain.filter(p => providers.has(p))
  if (config.fallbackPolicy === 'none' && configuredProviders.length <= 1) {
    return null
  }

  const db = getHarnessDb(config.dbPath)

  _router = new ModelRouter({
    providers,
    config,
    logger,
    db,
  })

  return _router
}

// -- Public API --------------------------------------------------------------

export function getProvider(name: string): LLMProvider {
  const providers = initProviders()
  const provider = providers.get(name)
  if (!provider) {
    throw new Error(
      `Provider "${name}" not configured. Check your .env for the required API key.`
    )
  }
  return provider
}

/** Reset cached providers and router. Used by tests to avoid cross-test pollution. */
export function resetProviders(): void {
  _router?.shutdown()
  _router = null
  _providers = null
}

export function resolveModel(stage: string): { provider: LLMProvider; providerName: string; model: string } {
  const envKey = `STAGE_${stage.toUpperCase()}_MODEL`
  const envValue = process.env[envKey]
  if (envValue) {
    const [providerName, model] = envValue.split(':')
    const rawProvider = getProvider(providerName)
    const router = getRouter()
    return { provider: router ?? rawProvider, providerName, model }
  }

  const cfg = loadHarnessConfig()
  const profile = PROFILES[cfg.pipelineProfile] ?? PROFILES.balanced
  const profileValue = profile[stage] ?? profile.default
  const [providerName, model] = profileValue.split(':')
  const rawProvider = getProvider(providerName)
  const router = getRouter()
  return { provider: router ?? rawProvider, providerName, model }
}
