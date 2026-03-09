import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type DrizzleDb = ReturnType<typeof createDatabase>["db"];

export interface DatabaseInstance {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sqlite: Database.Database;
}

/**
 * Create a database instance with the given path.
 * Sets WAL mode and performance pragmas.
 * Runs all migrations from the drizzle/ folder.
 */
export function createDatabase(
  dbPath: string = process.env["DB_PATH"] ??
    path.join(process.cwd(), "data", "mission-control.db")
): DatabaseInstance {
  // Ensure data directory exists (skip for :memory:)
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);

  // Performance pragmas
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("cache_size = -64000");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema });

  // Run migrations on startup
  const migrationsFolder = path.join(__dirname, "../../drizzle");
  migrate(db, { migrationsFolder });

  return { db, sqlite };
}

// Singleton for production use
let _instance: DatabaseInstance | null = null;

export function getDatabase(): DatabaseInstance {
  if (!_instance) {
    _instance = createDatabase();
  }
  return _instance;
}

export function closeDatabase(): void {
  if (_instance) {
    _instance.sqlite.close();
    _instance = null;
  }
}
