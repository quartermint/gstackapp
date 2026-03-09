import { eq, and, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { captures } from "../schema.js";
import { notFound } from "../../lib/errors.js";
import type { CreateCapture, UpdateCapture, ListCapturesQuery } from "@mission-control/shared";

export function createCapture(db: DrizzleDb, data: CreateCapture) {
  const now = new Date();
  const id = nanoid();

  db.insert(captures)
    .values({
      id,
      rawContent: data.rawContent,
      type: data.type ?? "text",
      status: "raw",
      projectId: data.projectId ?? null,
      userId: data.userId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getCapture(db, id);
}

export function getCapture(db: DrizzleDb, id: string) {
  const result = db
    .select()
    .from(captures)
    .where(eq(captures.id, id))
    .get();

  if (!result) {
    throw notFound(`Capture ${id} not found`);
  }

  return result;
}

export function listCaptures(db: DrizzleDb, query: ListCapturesQuery) {
  const conditions = [];

  if (query.projectId) {
    conditions.push(eq(captures.projectId, query.projectId));
  }
  if (query.status) {
    conditions.push(eq(captures.status, query.status));
  }
  if (query.userId) {
    conditions.push(eq(captures.userId, query.userId));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const results = db
    .select()
    .from(captures)
    .where(whereClause)
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0)
    .orderBy(sql`${captures.createdAt} DESC`)
    .all();

  // Get total count for the same filter
  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(captures)
    .where(whereClause)
    .get();

  return {
    captures: results,
    total: countResult?.count ?? 0,
  };
}

export function updateCapture(
  db: DrizzleDb,
  id: string,
  data: UpdateCapture
) {
  // Verify it exists first
  getCapture(db, id);

  const now = new Date();

  db.update(captures)
    .set({
      ...data,
      updatedAt: now,
    })
    .where(eq(captures.id, id))
    .run();

  return getCapture(db, id);
}

export function deleteCapture(db: DrizzleDb, id: string) {
  // Verify it exists first
  getCapture(db, id);

  db.delete(captures).where(eq(captures.id, id)).run();
}
