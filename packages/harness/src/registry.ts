import { loadHarnessConfig } from './config'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'
import type { LLMProvider, ClassificationInput, TaskClassification } from './types'
import { ModelRouter, loadRouterConfig } from './router'
import { classifyTask } from './router/task-classifier'
import { getHarnessDb } from './db/client'
import pino from 'pino'

export type { LLMProvider, CompletionParams, CompletionResult, ContentBlock, ConversationMessage, ToolResultBlock, ToolDefinition, TaskClassification, ClassificationInput } from './types'

// -- Resolve Model Types ------------------------------------------------------

export interface ResolveModelOptions {
  taskType?: string
  classificationInput?: ClassificationInput
}

export interface ResolveModelResult {
  provider: LLMProvider
  providerName: string
  model: string
  classification?: TaskClassification
}

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

export function resolveModel(stage: string, options?: ResolveModelOptions): ResolveModelResult {
  // Priority 1: Environment variable override (highest priority)
  const envKey = `STAGE_${stage.toUpperCase()}_MODEL`
  const envValue = process.env[envKey]
  if (envValue) {
    const [providerName, model] = envValue.split(':')
    const rawProvider = getProvider(providerName)
    const router = getRouter()
    return { provider: router ?? rawProvider, providerName, model }
  }

  // Priority 2: Classification-based routing (D-09, D-10, D-11)
  // Only runs when classificationInput is provided and no explicit taskType
  if (options?.classificationInput && !options?.taskType) {
    const classification = classifyTask(options.classificationInput)

    // Use recommendedModel from capability matrix if available
    if (classification.recommendedModel) {
      const [provName, mdl] = classification.recommendedModel.split(':')
      try {
        const rawProvider = getProvider(provName)
        const router = getRouter()
        return { provider: router ?? rawProvider, providerName: provName, model: mdl, classification }
      } catch {
        // Recommended model provider not configured, fall through to profile lookup
      }
    }

    // Fall through to profile lookup with classifier's taskType
    const cfg = loadHarnessConfig()
    const profile = PROFILES[cfg.pipelineProfile] ?? PROFILES.balanced
    const profileValue = profile[classification.taskType] ?? profile[stage] ?? profile.default
    const [provName, mdl] = profileValue.split(':')
    const rawProvider = getProvider(provName)
    const router = getRouter()
    return { provider: router ?? rawProvider, providerName: provName, model: mdl, classification }
  }

  // Priority 3: Explicit taskType string (existing behavior)
  if (options?.taskType) {
    const cfg = loadHarnessConfig()
    const profile = PROFILES[cfg.pipelineProfile] ?? PROFILES.balanced
    const profileValue = profile[options.taskType] ?? profile[stage] ?? profile.default
    const [providerName, model] = profileValue.split(':')
    const rawProvider = getProvider(providerName)
    const router = getRouter()
    return { provider: router ?? rawProvider, providerName, model }
  }

  // Priority 4: Stage-based profile lookup (default)
  const cfg = loadHarnessConfig()
  const profile = PROFILES[cfg.pipelineProfile] ?? PROFILES.balanced
  const profileValue = profile[stage] ?? profile.default
  const [providerName, model] = profileValue.split(':')
  const rawProvider = getProvider(providerName)
  const router = getRouter()
  return { provider: router ?? rawProvider, providerName, model }
}
