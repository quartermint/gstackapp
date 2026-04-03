/**
 * Cross-SDK error detection for rate limits and billing caps.
 *
 * Detects capacity errors from Anthropic, OpenAI, and Gemini SDKs
 * so the router can trigger failover to the next provider in the chain.
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAIFetchError } from '@google/generative-ai'

/**
 * Returns true if the error indicates a provider has hit a rate limit
 * or billing cap. These errors are recoverable via failover.
 */
export function isProviderCapError(err: unknown): boolean {
  if (!err) return false

  // Anthropic: 429 rate limit
  if (err instanceof Anthropic.RateLimitError) return true

  // Anthropic: billing cap (400 with billing_error type)
  if (err instanceof Anthropic.BadRequestError) {
    const body = (err as any)?.error
    if (body?.error?.type === 'billing_error') return true
    return false
  }

  // OpenAI: 429 rate limit
  if (err instanceof OpenAI.RateLimitError) return true

  // Gemini: 429 rate limit or 403 RESOURCE_EXHAUSTED
  if (err instanceof GoogleGenerativeAIFetchError) {
    if (err.status === 429) return true
    if (err.status === 403 && err.statusText?.includes('RESOURCE_EXHAUSTED')) return true
    return false
  }

  return false
}

/**
 * Extracts retry-after duration from error headers (Anthropic/OpenAI pattern).
 * Returns milliseconds or null if not available.
 */
export function extractRetryAfterMs(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null

  const headers = (err as any).headers
  if (!headers) return null

  const retryAfter = headers['retry-after']
  if (!retryAfter) return null

  const seconds = parseFloat(retryAfter)
  if (isNaN(seconds)) return null

  return Math.round(seconds * 1000)
}
