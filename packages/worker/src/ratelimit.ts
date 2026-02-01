/**
 * Rate Limiter using Cloudflare KV
 *
 * Implements a sliding window rate limiter that tracks
 * requests per IP address using Cloudflare KV storage.
 */

import { LIMITS } from '@mission-control/shared';

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Remaining requests in the window */
  remaining: number;
  /** Timestamp when the rate limit resets */
  resetAt: number;
}

/**
 * Rate limit state stored in KV
 */
interface RateLimitState {
  /** Number of requests in current window */
  count: number;
  /** Window start timestamp */
  windowStart: number;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Default configuration: 100 requests per minute
 */
const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequests: LIMITS.RATE_LIMIT_RPM,
  windowMs: 60_000, // 1 minute
};

/**
 * Rate limiter using Cloudflare KV for state storage
 */
export class RateLimiter {
  private kv: KVNamespace;
  private config: RateLimiterConfig;

  constructor(kv: KVNamespace, config: Partial<RateLimiterConfig> = {}) {
    this.kv = kv;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate KV key for an IP address
   */
  private getKey(ip: string): string {
    return `ratelimit:${ip}`;
  }

  /**
   * Check if a request from the given IP is allowed
   *
   * @param ip - Client IP address
   * @returns Rate limit result with remaining quota and reset time
   */
  async checkRateLimit(ip: string): Promise<RateLimitResult> {
    const key = this.getKey(ip);
    const now = Date.now();

    // Get current state from KV
    const stateJson = await this.kv.get(key);
    let state: RateLimitState;

    if (stateJson) {
      state = JSON.parse(stateJson) as RateLimitState;

      // Check if we're in a new window
      if (now - state.windowStart >= this.config.windowMs) {
        // Reset to new window
        state = {
          count: 0,
          windowStart: now,
        };
      }
    } else {
      // Initialize new state
      state = {
        count: 0,
        windowStart: now,
      };
    }

    // Calculate reset time
    const resetAt = state.windowStart + this.config.windowMs;

    // Check if allowed
    if (state.count >= this.config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Increment counter
    state.count++;
    const remaining = Math.max(0, this.config.maxRequests - state.count);

    // Store updated state with TTL slightly longer than window
    const ttlSeconds = Math.ceil(this.config.windowMs / 1000) + 10;
    await this.kv.put(key, JSON.stringify(state), {
      expirationTtl: ttlSeconds,
    });

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  }

  /**
   * Reset rate limit for an IP (for testing/admin purposes)
   *
   * @param ip - Client IP address to reset
   */
  async resetRateLimit(ip: string): Promise<void> {
    const key = this.getKey(ip);
    await this.kv.delete(key);
  }

  /**
   * Get current rate limit state for an IP without incrementing
   *
   * @param ip - Client IP address
   * @returns Current rate limit state or null if not found
   */
  async getRateLimitState(ip: string): Promise<RateLimitResult | null> {
    const key = this.getKey(ip);
    const stateJson = await this.kv.get(key);

    if (!stateJson) {
      return null;
    }

    const state = JSON.parse(stateJson) as RateLimitState;
    const now = Date.now();

    // Check if window has expired
    if (now - state.windowStart >= this.config.windowMs) {
      return null;
    }

    const resetAt = state.windowStart + this.config.windowMs;
    const remaining = Math.max(0, this.config.maxRequests - state.count);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt,
    };
  }
}
