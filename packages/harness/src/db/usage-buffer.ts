/**
 * In-memory buffer for token usage records with periodic flush to SQLite.
 *
 * Records accumulate in memory and flush to the database every flushMs
 * (default 5 minutes). Degrades gracefully when the database is unavailable:
 * - null db: record() buffers silently, flush() is a no-op
 * - DB write error: logs warning, records stay in buffer for next attempt
 */

import type Database from 'better-sqlite3'

export interface UsageRecord {
  provider: string
  timestamp: number
  inputTokens: number
  outputTokens: number
  costEstimate?: number
  stage?: string
}

interface Logger {
  warn: (obj: Record<string, unknown>, msg: string) => void
}

export class UsageBuffer {
  private buffer: UsageRecord[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    private db: Database.Database | null,
    private flushMs: number = 5 * 60 * 1000,
    private logger?: Logger,
  ) {}

  /**
   * Add a usage record to the in-memory buffer.
   * Does not touch the database.
   */
  record(
    provider: string,
    usage: { inputTokens: number; outputTokens: number },
    stage?: string,
    costEstimate?: number,
  ): void {
    this.buffer.push({
      provider,
      timestamp: Date.now(),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costEstimate,
      stage,
    })
  }

  /**
   * Write all buffered records to the database in a transaction.
   * On error: logs warning, records stay in buffer for next attempt.
   * With null db: silently returns (records stay buffered).
   */
  flush(): void {
    if (this.buffer.length === 0) return
    if (!this.db) return  // No DB configured -- keep records buffered

    // Splice out records for processing
    const records = this.buffer.splice(0, this.buffer.length)

    try {
      const insert = this.db.prepare(
        `INSERT INTO token_usage (provider, timestamp, input_tokens, output_tokens, cost_estimate, stage)
         VALUES (?, ?, ?, ?, ?, ?)`
      )

      const insertMany = this.db.transaction((recs: UsageRecord[]) => {
        for (const r of recs) {
          insert.run(r.provider, r.timestamp, r.inputTokens, r.outputTokens, r.costEstimate ?? null, r.stage ?? null)
        }
      })

      insertMany(records)
    } catch (err) {
      // Put records back for next flush attempt
      this.buffer.unshift(...records)
      this.logger?.warn(
        { error: String(err), recordCount: records.length },
        'UsageBuffer flush failed, records retained for next attempt',
      )
    }
  }

  /**
   * Start periodic flush interval.
   */
  start(): void {
    if (this.flushInterval) return
    this.flushInterval = setInterval(() => this.flush(), this.flushMs)
  }

  /**
   * Stop periodic flush and perform a final flush.
   */
  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    this.flush()
  }

  /**
   * Returns the current number of buffered records (for testing/observability).
   */
  getBufferSize(): number {
    return this.buffer.length
  }
}
