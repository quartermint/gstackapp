import { eq, and, isNull, or, lt, sql, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { insights } from "../schema.js";
import { eventBus } from "../../services/event-bus.js";

export type InsightType =
  | "stale_capture"
  | "activity_gap"
  | "session_pattern"
  | "cross_project";

export interface CreateInsightInput {
  type: InsightType;
  title: string;
  body: string;
  metadata?: string | null;
  projectSlug?: string | null;
  contentHash: string;
}

/**
 * Create a new insight. Uses ON CONFLICT DO NOTHING on content_hash
 * for deduplication. Returns the insight object or null if duplicate.
 */
export function createInsight(
  db: DrizzleDb,
  input: CreateInsightInput
) {
  const id = nanoid();
  const now = new Date();

  const result = db
    .insert(insights)
    .values({
      id,
      type: input.type,
      title: input.title,
      body: input.body,
      metadata: input.metadata ?? null,
      projectSlug: input.projectSlug ?? null,
      contentHash: input.contentHash,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: insights.contentHash,
    })
    .run();

  // If no rows were inserted, it was a duplicate
  if (result.changes === 0) {
    return null;
  }

  // Emit event for SSE subscribers
  eventBus.emit("mc:event", {
    type: "intelligence:insight_created",
    id,
    data: { insightType: input.type, projectSlug: input.projectSlug },
  });

  return db.select().from(insights).where(eq(insights.id, id)).get()!;
}

/**
 * Get active insights: not dismissed and not currently snoozed.
 * Optional type filter. Ordered by createdAt DESC. Limit 50.
 */
export function getActiveInsights(
  db: DrizzleDb,
  options?: { type?: string }
) {
  const nowEpoch = Math.floor(Date.now() / 1000);

  const conditions = [
    isNull(insights.dismissedAt),
    or(
      isNull(insights.snoozedUntil),
      lt(insights.snoozedUntil, sql`${nowEpoch}`)
    ),
  ];

  if (options?.type) {
    conditions.push(eq(insights.type, options.type as InsightType));
  }

  return db
    .select()
    .from(insights)
    .where(and(...conditions))
    .orderBy(desc(insights.createdAt))
    .limit(50)
    .all();
}

/**
 * Dismiss an insight by setting dismissedAt to current timestamp.
 */
export function dismissInsight(db: DrizzleDb, id: string) {
  const now = new Date();

  db.update(insights)
    .set({ dismissedAt: now })
    .where(eq(insights.id, id))
    .run();

  eventBus.emit("mc:event", {
    type: "intelligence:insight_dismissed",
    id,
  });
}

/**
 * Snooze an insight for the given number of hours.
 */
export function snoozeInsight(db: DrizzleDb, id: string, hours: number) {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);

  db.update(insights)
    .set({ snoozedUntil: until })
    .where(eq(insights.id, id))
    .run();
}

/**
 * Get a single insight by id. Returns undefined if not found.
 */
export function getInsightById(db: DrizzleDb, id: string) {
  return db.select().from(insights).where(eq(insights.id, id)).get();
}
