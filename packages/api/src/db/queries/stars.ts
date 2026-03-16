import { eq, and, sql, isNull } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import { stars } from "../schema.js";
import { notFound } from "../../lib/errors.js";
import type { ListStarsQuery } from "@mission-control/shared";

/**
 * Data shape accepted by upsertStar.
 * topics is a string array that gets serialized to JSON for SQLite.
 */
export interface UpsertStarData {
  githubId: number;
  fullName: string;
  description: string | null;
  language: string | null;
  topics: string[];
  htmlUrl: string;
  starredAt: Date;
}

/**
 * Parse a raw DB row into the API response shape.
 * - topics: JSON string -> string array
 * - timestamps: Date -> ISO string
 */
function parseStarRow(row: typeof stars.$inferSelect) {
  return {
    githubId: row.githubId,
    fullName: row.fullName,
    description: row.description,
    language: row.language,
    topics: JSON.parse(row.topics ?? "[]") as string[],
    htmlUrl: row.htmlUrl,
    intent: row.intent,
    aiConfidence: row.aiConfidence,
    userOverride: row.userOverride ?? false,
    starredAt: row.starredAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Insert or update a star record.
 * On conflict (githubId), updates metadata fields but preserves
 * intent, aiConfidence, and userOverride to avoid overwriting AI/user categorization.
 */
export function upsertStar(db: DrizzleDb, data: UpsertStarData) {
  const now = new Date();
  const topicsJson = JSON.stringify(data.topics);

  db.insert(stars)
    .values({
      githubId: data.githubId,
      fullName: data.fullName,
      description: data.description,
      language: data.language,
      topics: topicsJson,
      htmlUrl: data.htmlUrl,
      starredAt: data.starredAt,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: stars.githubId,
      set: {
        fullName: data.fullName,
        description: data.description,
        language: data.language,
        topics: topicsJson,
        htmlUrl: data.htmlUrl,
        lastSyncedAt: now,
        updatedAt: now,
      },
    })
    .run();

  return getStar(db, data.githubId);
}

/**
 * Get a single star by GitHub repo ID.
 * Throws NOT_FOUND if the star doesn't exist.
 */
export function getStar(db: DrizzleDb, githubId: number) {
  const result = db
    .select()
    .from(stars)
    .where(eq(stars.githubId, githubId))
    .get();

  if (!result) {
    throw notFound(`Star ${githubId} not found`);
  }

  return parseStarRow(result);
}

/**
 * List stars with optional filters and pagination.
 * Supports filtering by intent, language, and search (LIKE on fullName + description).
 */
export function listStars(db: DrizzleDb, query: ListStarsQuery) {
  const conditions = [];

  if (query.intent) {
    conditions.push(eq(stars.intent, query.intent));
  }
  if (query.language) {
    conditions.push(eq(stars.language, query.language));
  }
  if (query.search) {
    const pattern = `%${query.search}%`;
    conditions.push(
      sql`(${stars.fullName} LIKE ${pattern} OR ${stars.description} LIKE ${pattern})`
    );
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const results = db
    .select()
    .from(stars)
    .where(whereClause)
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0)
    .orderBy(sql`${stars.starredAt} DESC`)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(stars)
    .where(whereClause)
    .get();

  return {
    stars: results.map(parseStarRow),
    total: countResult?.count ?? 0,
  };
}

/**
 * Update a star's intent (human override).
 * Clears aiConfidence and sets userOverride to true.
 */
export function updateStarIntent(
  db: DrizzleDb,
  githubId: number,
  intent: "reference" | "tool" | "try" | "inspiration"
) {
  // Verify it exists first
  getStar(db, githubId);

  const now = new Date();

  db.update(stars)
    .set({
      intent,
      aiConfidence: null,
      userOverride: true,
      updatedAt: now,
    })
    .where(eq(stars.githubId, githubId))
    .run();

  return getStar(db, githubId);
}

/**
 * Get stars that have not been categorized (no intent, no user override).
 * Used by the AI enrichment pipeline.
 */
export function getUncategorizedStars(db: DrizzleDb, limit: number = 50) {
  const results = db
    .select()
    .from(stars)
    .where(
      and(
        isNull(stars.intent),
        eq(stars.userOverride, false)
      )
    )
    .limit(limit)
    .orderBy(sql`${stars.starredAt} DESC`)
    .all();

  return results.map(parseStarRow);
}

/**
 * Get the most recent starred_at timestamp in the database.
 * Used for incremental sync (only fetch stars newer than this).
 * Returns null if no stars exist.
 *
 * Note: sql`max()` bypasses Drizzle's mode:"timestamp" conversion,
 * so we get a raw epoch (seconds) and must convert manually.
 */
export function getLatestStarredAt(db: DrizzleDb): Date | null {
  const result = db
    .select({ maxStarredAt: sql<number | null>`max(${stars.starredAt})` })
    .from(stars)
    .get();

  const epoch = result?.maxStarredAt;
  if (epoch == null) return null;
  return new Date(epoch * 1000);
}

/**
 * Get the total number of stars in the database.
 */
export function getStarCount(db: DrizzleDb): number {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(stars)
    .get();

  return result?.count ?? 0;
}
