/**
 * Optional SQLite connection for harness token usage tracking.
 *
 * Returns null when no DB path is configured (graceful degradation).
 * Uses WAL mode for concurrent read access during pipeline execution.
 */

import Database from 'better-sqlite3'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Open a SQLite connection with WAL mode and create the token_usage table.
 * Returns null if dbPath is undefined (no DB configured).
 */
export function getHarnessDb(dbPath: string | undefined): Database.Database | null {
  if (!dbPath) return null

  // Ensure parent directory exists (skip for :memory:)
  if (dbPath !== ':memory:') {
    const dir = dirname(dbPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = normal')

  // Create table if not exists (runtime migration, no drizzle-kit dependency)
  db.exec(`CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_estimate REAL,
    stage TEXT
  )`)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_token_usage_provider_ts ON token_usage(provider, timestamp)`)

  return db
}
