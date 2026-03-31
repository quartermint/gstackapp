import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import * as schema from './schema'
import { config } from '../lib/config'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Ensure the database directory exists
mkdirSync(dirname(config.databasePath), { recursive: true })

// Open the SQLite database
const sqlite = new Database(config.databasePath)

// CRITICAL: Set pragmas before any operations (per D-04, D-05)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = normal')
sqlite.pragma('cache_size = 10000')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('temp_store = memory')

// Load sqlite-vec extension for vector operations (XREP-01)
sqliteVec.load(sqlite)

// Initialize vec0 virtual table for finding embeddings
import { initVecTable } from '../embeddings/store'
initVecTable(sqlite)

// Export the Drizzle ORM instance with full schema for relational queries
export const db = drizzle(sqlite, { schema })

// Export raw SQLite connection for cases needing direct access
export const rawDb: DatabaseType = sqlite
