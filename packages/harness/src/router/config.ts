/**
 * Router configuration loaded from environment variables.
 *
 * All values have sensible defaults so the router works out-of-box.
 * Extends the HarnessConfig pattern from ../config.ts.
 */

export type FallbackPolicy = 'none' | 'quality-aware' | 'aggressive'

export interface RouterConfig {
  fallbackPolicy: FallbackPolicy
  providerChain: string[]
  predictiveThresholdMinutes: number
  cooldownMinutes: number
  proactivePollingMinutes: number
  maxQueueSize: number
  billingCaps: Record<string, number>
  dbPath: string | undefined
  anthropicAdminApiKey: string | undefined
}

export function loadRouterConfig(): RouterConfig {
  const billingCaps: Record<string, number> = {}

  const anthropicCap = process.env.ROUTER_BILLING_CAP_ANTHROPIC
  if (anthropicCap) billingCaps.anthropic = parseInt(anthropicCap, 10)

  const geminiCap = process.env.ROUTER_BILLING_CAP_GEMINI
  if (geminiCap) billingCaps.gemini = parseInt(geminiCap, 10)

  const openaiCap = process.env.ROUTER_BILLING_CAP_OPENAI
  if (openaiCap) billingCaps.openai = parseInt(openaiCap, 10)

  return {
    fallbackPolicy: (process.env.ROUTER_FALLBACK_POLICY as FallbackPolicy) ?? 'none',
    providerChain: process.env.ROUTER_PROVIDER_CHAIN
      ? process.env.ROUTER_PROVIDER_CHAIN.split(',').map(s => s.trim())
      : ['anthropic', 'gemini', 'openai'],
    predictiveThresholdMinutes: parseInt(process.env.ROUTER_PREDICTIVE_THRESHOLD_MINUTES ?? '30', 10),
    cooldownMinutes: parseInt(process.env.ROUTER_COOLDOWN_MINUTES ?? '30', 10),
    proactivePollingMinutes: parseInt(process.env.ROUTER_PROACTIVE_POLLING_MINUTES ?? '15', 10),
    maxQueueSize: parseInt(process.env.ROUTER_MAX_QUEUE_SIZE ?? '50', 10),
    billingCaps,
    dbPath: process.env.HARNESS_DB_PATH ?? undefined,
    anthropicAdminApiKey: process.env.ANTHROPIC_ADMIN_API_KEY ?? undefined,
  }
}
