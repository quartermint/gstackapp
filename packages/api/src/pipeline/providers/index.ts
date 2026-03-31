import { config } from '../../lib/config'
import { AnthropicProvider } from './anthropic'
import { GeminiProvider } from './gemini'
import { OpenAIProvider } from './openai'
import type { LLMProvider } from './types'
import type { Stage } from '@gstackapp/shared'

export type { LLMProvider, CompletionParams, CompletionResult, ContentBlock, ConversationMessage, ToolResultBlock, ToolDefinition } from './types'

// ── Model Profiles ──────────────────────────────────────────────────────────

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

// ── Provider Singletons ─────────────────────────────────────────────────────

let _providers: Map<string, LLMProvider> | null = null

function initProviders(): Map<string, LLMProvider> {
  if (_providers) return _providers
  _providers = new Map()

  _providers.set('anthropic', new AnthropicProvider())

  if (config.geminiApiKey) {
    _providers.set('gemini', new GeminiProvider(config.geminiApiKey))
  }

  if (config.openaiApiKey) {
    _providers.set('openai', new OpenAIProvider({ apiKey: config.openaiApiKey }))
  }

  if (config.localApiUrl) {
    _providers.set('local', new OpenAIProvider({
      apiKey: 'not-needed',
      baseURL: config.localApiUrl,
    }))
  }

  return _providers
}

// ── Public API ──────────────────────────────────────────────────────────────

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

/** Reset cached providers. Used by tests to avoid cross-test pollution. */
export function resetProviders(): void {
  _providers = null
}

export function resolveModel(stage: Stage): { provider: LLMProvider; providerName: string; model: string } {
  const envKey = `STAGE_${stage.toUpperCase()}_MODEL`
  const envValue = process.env[envKey]
  if (envValue) {
    const [providerName, model] = envValue.split(':')
    return { provider: getProvider(providerName), providerName, model }
  }

  const profile = PROFILES[config.pipelineProfile] ?? PROFILES.balanced
  const profileValue = profile[stage] ?? profile.default
  const [providerName, model] = profileValue.split(':')
  return { provider: getProvider(providerName), providerName, model }
}
