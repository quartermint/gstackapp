import { eq, and, sql } from "drizzle-orm";
import type { DrizzleDb } from "../index.js";
import { sessions } from "../schema.js";
import { notFound } from "../../lib/errors.js";
import { deriveModelTier } from "../../lib/model-tier.js";
import type { CreateSession, ListSessionsQuery } from "@mission-control/shared";

export function createSession(db: DrizzleDb, data: CreateSession) {
  const now = new Date();
  const tier = deriveModelTier(data.model);

  db.insert(sessions)
    .values({
      id: data.sessionId,
      source: data.source,
      model: data.model ?? null,
      tier,
      cwd: data.cwd,
      taskDescription: data.taskDescription ?? null,
      status: "active",
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getSession(db, data.sessionId);
}

export function getSession(db: DrizzleDb, id: string) {
  const result = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();

  if (!result) {
    throw notFound(`Session ${id} not found`);
  }

  return result;
}

export function listSessions(db: DrizzleDb, query: ListSessionsQuery) {
  const conditions = [];

  if (query.status) {
    conditions.push(eq(sessions.status, query.status));
  }
  if (query.projectSlug) {
    conditions.push(eq(sessions.projectSlug, query.projectSlug));
  }
  if (query.source) {
    conditions.push(eq(sessions.source, query.source));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const results = db
    .select()
    .from(sessions)
    .where(whereClause)
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0)
    .orderBy(sql`${sessions.startedAt} DESC`)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(whereClause)
    .get();

  return {
    sessions: results,
    total: countResult?.count ?? 0,
  };
}

export function updateSessionHeartbeat(
  db: DrizzleDb,
  id: string,
  filesTouched?: string[]
) {
  // Verify session exists
  const existing = getSession(db, id);
  const now = new Date();

  // Merge new files into existing filesJson
  let mergedFiles: string[] = [];
  if (existing.filesJson) {
    try {
      mergedFiles = JSON.parse(existing.filesJson) as string[];
    } catch {
      mergedFiles = [];
    }
  }
  if (filesTouched) {
    const fileSet = new Set([...mergedFiles, ...filesTouched]);
    mergedFiles = [...fileSet];
  }

  db.update(sessions)
    .set({
      filesJson: mergedFiles.length > 0 ? JSON.stringify(mergedFiles) : null,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(sessions.id, id))
    .run();

  return getSession(db, id);
}

export function updateSessionStatus(
  db: DrizzleDb,
  id: string,
  status: "completed" | "abandoned",
  stopReason?: string | null
) {
  // Verify session exists
  getSession(db, id);
  const now = new Date();

  db.update(sessions)
    .set({
      status,
      endedAt: now,
      stopReason: stopReason ?? null,
      updatedAt: now,
    })
    .where(eq(sessions.id, id))
    .run();

  return getSession(db, id);
}
