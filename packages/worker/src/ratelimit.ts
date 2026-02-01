/**
 * Rate Limiter using Cloudflare KV
 *
 * Implements a sliding window rate limiter that tracks
 * requests per IP address and per authenticated user
 * using Cloudflare KV storage.
 *
 * Rate limits:
 * - Per IP: 100 requests/minute (applied to all requests)
 * - Per User: 500 requests/minute (applied to authenticated requests)
 *
 * Both limits must pass for a request to be allowed.
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
  /** Which limit was hit (if any) */
  limitType?: 'ip' | 'user';
}

/**
 * Combined rate limit result for IP and user limits
 */
export interface CombinedRateLimitResult {
  /** Whether the request is allowed (both limits must pass) */
  allowed: boolean;
  /** IP rate limit result */
  ipLimit: RateLimitResult;
  /** User rate limit result (if authenticated) */
  userLimit?: RateLimitResult;
  /** Which limit caused the denial (if any) */
  deniedBy?: 'ip' | 'user';
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
  /** Maximum requests per window for IP-based limiting */
  maxRequestsPerIp: number;
  /** Maximum requests per window for user-based limiting */
  maxRequestsPerUser: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequestsPerIp: LIMITS.RATE_LIMIT_RPM,
  maxRequestsPerUser: LIMITS.RATE_LIMIT_USER_RPM,
  windowMs: 60_000, // 1 minute
};

/**
 * Rate limiter using Cloudflare KV for state storage
 * Supports both IP-based and user-based rate limiting
 */
export class RateLimiter {
  private kv: KVNamespace;
  private config: RateLimiterConfig;

  constructor(kv: KVNamespace, config: Partial<RateLimiterConfig> = {}) {
    this.kv = kv;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate KV key for IP-based rate limiting
   */
  private getIpKey(ip: string): string {
    return `ratelimit:ip:${ip}`;
  }

  /**
   * Generate KV key for user-based rate limiting
   */
  private getUserKey(userId: string): string {
    return `ratelimit:user:${userId}`;
  }

  /**
   * Check rate limit for a specific key
   *
   * @param key - The KV key to check
   * @param maxRequests - Maximum requests allowed in the window
   * @returns Rate limit result
   */
  private async checkLimit(key: string, maxRequests: number): Promise<RateLimitResult> {
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
    if (state.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Increment counter
    state.count++;
    const remaining = Math.max(0, maxRequests - state.count);

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
   * Check if a request from the given IP is allowed (legacy API)
   * Maintained for backward compatibility
   *
   * @param ip - Client IP address
   * @returns Rate limit result with remaining quota and reset time
   */
  async checkRateLimit(ip: string): Promise<RateLimitResult> {
    const key = this.getIpKey(ip);
    return this.checkLimit(key, this.config.maxRequestsPerIp);
  }

  /**
   * Check combined rate limits for both IP and user
   *
   * This method checks both IP-based and user-based rate limits.
   * A request is only allowed if both limits pass.
   *
   * @param ip - Client IP address
   * @param userId - Optional user ID from JWT (if authenticated)
   * @returns Combined rate limit result
   */
  async checkCombinedRateLimit(
    ip: string,
    userId?: string | null
  ): Promise<CombinedRateLimitResult> {
    // Always check IP limit
    const ipKey = this.getIpKey(ip);
    const ipLimit = await this.checkLimit(ipKey, this.config.maxRequestsPerIp);

    // If IP limit is exceeded, deny immediately
    if (!ipLimit.allowed) {
      return {
        allowed: false,
        ipLimit: { ...ipLimit, limitType: 'ip' },
        deniedBy: 'ip',
      };
    }

    // If no user ID, only IP limit applies
    if (!userId) {
      return {
        allowed: true,
        ipLimit: { ...ipLimit, limitType: 'ip' },
      };
    }

    // Check user limit for authenticated requests
    const userKey = this.getUserKey(userId);
    const userLimit = await this.checkLimit(userKey, this.config.maxRequestsPerUser);

    if (!userLimit.allowed) {
      return {
        allowed: false,
        ipLimit: { ...ipLimit, limitType: 'ip' },
        userLimit: { ...userLimit, limitType: 'user' },
        deniedBy: 'user',
      };
    }

    return {
      allowed: true,
      ipLimit: { ...ipLimit, limitType: 'ip' },
      userLimit: { ...userLimit, limitType: 'user' },
    };
  }

  /**
   * Reset rate limit for an IP (for testing/admin purposes)
   *
   * @param ip - Client IP address to reset
   */
  async resetRateLimit(ip: string): Promise<void> {
    const key = this.getIpKey(ip);
    await this.kv.delete(key);
  }

  /**
   * Reset rate limit for a user (for testing/admin purposes)
   *
   * @param userId - User ID to reset
   */
  async resetUserRateLimit(userId: string): Promise<void> {
    const key = this.getUserKey(userId);
    await this.kv.delete(key);
  }

  /**
   * Get current rate limit state for an IP without incrementing
   *
   * @param ip - Client IP address
   * @returns Current rate limit state or null if not found
   */
  async getRateLimitState(ip: string): Promise<RateLimitResult | null> {
    const key = this.getIpKey(ip);
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
    const remaining = Math.max(0, this.config.maxRequestsPerIp - state.count);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt,
      limitType: 'ip',
    };
  }

  /**
   * Get current rate limit state for a user without incrementing
   *
   * @param userId - User ID
   * @returns Current rate limit state or null if not found
   */
  async getUserRateLimitState(userId: string): Promise<RateLimitResult | null> {
    const key = this.getUserKey(userId);
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
    const remaining = Math.max(0, this.config.maxRequestsPerUser - state.count);

    return {
      allowed: remaining > 0,
      remaining,
      resetAt,
      limitType: 'user',
    };
  }
}
