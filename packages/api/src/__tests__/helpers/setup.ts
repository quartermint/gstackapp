import { createDatabase, type DatabaseInstance } from "../../db/index.js";
import { createApp } from "../../app.js";
import type { Hono } from "hono";

/**
 * Create an in-memory test database with all migrations applied.
 * Each test file gets its own isolated database.
 */
export function createTestDb(): DatabaseInstance {
  return createDatabase(":memory:");
}

/**
 * Create a Hono app wired to a test database.
 * Uses the same routes as production but with an injected db.
 */
export function createTestApp(instance: DatabaseInstance): Hono {
  return createApp(instance);
}
