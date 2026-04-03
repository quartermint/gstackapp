/**
 * Drizzle ORM schema for harness token usage tracking.
 *
 * Tracks per-request token consumption by provider for burn rate
 * prediction and billing cap monitoring.
 */

import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const tokenUsage = sqliteTable('token_usage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  provider: text('provider').notNull(),
  timestamp: integer('timestamp').notNull(),  // epoch ms
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costEstimate: real('cost_estimate'),  // nullable
  stage: text('stage'),  // nullable
}, (table) => [
  index('idx_token_usage_provider_ts').on(table.provider, table.timestamp),
])
