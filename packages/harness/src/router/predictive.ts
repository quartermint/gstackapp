/**
 * Predictive burn rate calculator for model failover.
 *
 * Queries token_usage table to project cap exhaustion time.
 * Records predictions for later accuracy tracking (D-19).
 */

import type Database from 'better-sqlite3'

export class BurnRateCalculator {
  /** Stores predicted exhaustion timestamps per provider (D-19) */
  private predictions: Map<string, number> = new Map()

  constructor(private db: Database.Database | null) {}

  /**
   * Returns true when projected to exhaust billing cap within thresholdMinutes.
   * Returns false when: no DB, no billing cap, no usage data, or projection is safe.
   */
  shouldSwitch(provider: string, billingCap: number | undefined, thresholdMinutes: number): boolean {
    if (!this.db || billingCap === undefined) return false

    const oneHourAgo = Date.now() - 60 * 60 * 1000
    const row = this.db.prepare(
      `SELECT SUM(input_tokens + output_tokens) as total_tokens FROM token_usage
       WHERE provider = ? AND timestamp > ?`
    ).get(provider, oneHourAgo) as { total_tokens: number | null } | undefined

    const hourlyTokens = row?.total_tokens ?? 0
    if (hourlyTokens === 0) return false

    // Get total used today (last 24h) to calculate remaining cap
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    const dayRow = this.db.prepare(
      `SELECT SUM(input_tokens + output_tokens) as total_tokens FROM token_usage
       WHERE provider = ? AND timestamp > ?`
    ).get(provider, oneDayAgo) as { total_tokens: number | null } | undefined

    const totalUsedToday = dayRow?.total_tokens ?? 0
    const remaining = billingCap - totalUsedToday
    if (remaining <= 0) {
      // Already exceeded cap
      this.recordPrediction(provider, Date.now())
      return true
    }

    // Project minutes to cap based on hourly rate
    const minutesToCap = (remaining / hourlyTokens) * 60
    if (minutesToCap <= thresholdMinutes) {
      const predictedExhaustionTime = Date.now() + minutesToCap * 60 * 1000
      this.recordPrediction(provider, predictedExhaustionTime)
      return true
    }

    return false
  }

  /**
   * Returns current burn rate for a provider, or null if no DB/no data.
   */
  getCurrentBurnRate(provider: string): { hourlyTokens: number; projectedDailyTokens: number } | null {
    if (!this.db) return null

    const oneHourAgo = Date.now() - 60 * 60 * 1000
    const row = this.db.prepare(
      `SELECT SUM(input_tokens + output_tokens) as total_tokens FROM token_usage
       WHERE provider = ? AND timestamp > ?`
    ).get(provider, oneHourAgo) as { total_tokens: number | null } | undefined

    const hourlyTokens = row?.total_tokens ?? 0
    if (hourlyTokens === 0) return null

    return {
      hourlyTokens,
      projectedDailyTokens: hourlyTokens * 24,
    }
  }

  /**
   * Store predicted exhaustion time for later accuracy check (D-19).
   */
  recordPrediction(provider: string, predictedExhaustionTime: number): void {
    this.predictions.set(provider, predictedExhaustionTime)
  }

  /**
   * Returns delta in minutes between actual cap hit (now) and predicted exhaustion time.
   * Negative = hit sooner than predicted. Positive = hit later than predicted.
   * Returns null if no prediction was recorded. One-shot: deletes after check.
   */
  checkPredictionAccuracy(provider: string): number | null {
    const predicted = this.predictions.get(provider)
    if (predicted === undefined) return null

    const deltaMinutes = (Date.now() - predicted) / 60000
    this.predictions.delete(provider)
    return deltaMinutes
  }
}
