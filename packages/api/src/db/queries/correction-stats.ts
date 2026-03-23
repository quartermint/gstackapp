import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { correctionStats } from "../schema.js";

/**
 * Record a correction: user changed AI's predicted project to actual project.
 * Uses ON CONFLICT DO UPDATE to increment count if pair already exists.
 */
export function recordCorrection(
  db: DrizzleDb,
  predictedSlug: string,
  actualSlug: string
) {
  const now = new Date();
  const id = nanoid();

  // Try to find existing pair
  const existing = db
    .select()
    .from(correctionStats)
    .where(
      and(
        eq(correctionStats.predictedSlug, predictedSlug),
        eq(correctionStats.actualSlug, actualSlug)
      )
    )
    .get();

  if (existing) {
    db.update(correctionStats)
      .set({
        correctionCount: existing.correctionCount + 1,
        lastCorrectedAt: now,
      })
      .where(eq(correctionStats.id, existing.id))
      .run();
    return { ...existing, correctionCount: existing.correctionCount + 1, lastCorrectedAt: now };
  }

  db.insert(correctionStats)
    .values({
      id,
      predictedSlug,
      actualSlug,
      correctionCount: 1,
      lastCorrectedAt: now,
      createdAt: now,
    })
    .run();

  return db
    .select()
    .from(correctionStats)
    .where(eq(correctionStats.id, id))
    .get()!;
}

/**
 * Get all correction stats, ordered by correction count descending.
 */
export function getAllCorrectionStats(db: DrizzleDb) {
  return db
    .select()
    .from(correctionStats)
    .orderBy(sql`${correctionStats.correctionCount} DESC`)
    .all();
}

/**
 * Get correction rate for a specific predicted slug.
 * Returns how often this slug gets corrected and to what.
 */
export function getCorrectionStatsForSlug(db: DrizzleDb, predictedSlug: string) {
  return db
    .select()
    .from(correctionStats)
    .where(eq(correctionStats.predictedSlug, predictedSlug))
    .orderBy(sql`${correctionStats.correctionCount} DESC`)
    .all();
}
