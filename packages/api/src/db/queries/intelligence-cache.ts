import { eq, and, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { intelligenceCache } from "../schema.js";

type GenerationType = "narrative" | "digest" | "routing_suggestion" | "weekly_pattern";

export interface UpsertCacheInput {
  projectSlug: string | null;
  generationType: GenerationType;
  inputHash: string;
  content: string;
  modelId: string | null;
  generatedAt: Date;
  expiresAt: Date;
}

/**
 * Insert or update a cache entry.
 * ON CONFLICT(project_slug, generation_type) DO UPDATE -- same pattern as knowledge upsert (Phase 24).
 */
export function upsertCacheEntry(db: DrizzleDb, input: UpsertCacheInput) {
  const id = nanoid();
  const now = new Date();

  db.insert(intelligenceCache)
    .values({
      id,
      projectSlug: input.projectSlug,
      generationType: input.generationType,
      inputHash: input.inputHash,
      content: input.content,
      modelId: input.modelId,
      generatedAt: input.generatedAt,
      expiresAt: input.expiresAt,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [intelligenceCache.projectSlug, intelligenceCache.generationType],
      set: {
        inputHash: input.inputHash,
        content: input.content,
        modelId: input.modelId,
        generatedAt: input.generatedAt,
        expiresAt: input.expiresAt,
      },
    })
    .run();

  // Return the upserted row
  const row = db
    .select()
    .from(intelligenceCache)
    .where(
      and(
        input.projectSlug
          ? eq(intelligenceCache.projectSlug, input.projectSlug)
          : sql`${intelligenceCache.projectSlug} IS NULL`,
        eq(intelligenceCache.generationType, input.generationType)
      )
    )
    .get();

  return row!;
}

/**
 * Get a cache entry by project slug + generation type.
 * Returns null if not found OR if expired (expiresAt < now).
 */
export function getCacheEntry(
  db: DrizzleDb,
  slug: string | null,
  type: GenerationType
) {
  const row = db
    .select()
    .from(intelligenceCache)
    .where(
      and(
        slug
          ? eq(intelligenceCache.projectSlug, slug)
          : sql`${intelligenceCache.projectSlug} IS NULL`,
        eq(intelligenceCache.generationType, type)
      )
    )
    .get();

  if (!row) return null;

  // Check TTL expiration
  if (row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return row;
}

/**
 * Delete all expired cache entries.
 * Returns the number of rows deleted.
 */
export function purgeExpiredEntries(db: DrizzleDb): number {
  const now = new Date();
  const result = db
    .delete(intelligenceCache)
    .where(lt(intelligenceCache.expiresAt, now))
    .run();

  return result.changes;
}
