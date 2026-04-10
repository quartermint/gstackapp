import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

const connectionString = process.env.NEON_CONNECTION_STRING
if (!connectionString) {
  throw new Error('NEON_CONNECTION_STRING is required. Run `stripe projects env --pull` to populate it.')
}

const sql = neon(connectionString)

// Export the Drizzle ORM instance with full schema for relational queries
export const db = drizzle(sql, { schema })

// Export raw neon sql tagged template for cases needing direct queries
export const rawSql = sql
