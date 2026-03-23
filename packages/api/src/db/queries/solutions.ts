import { eq, and, sql, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DrizzleDb } from "../index.js";
import { solutions, solutionReferences } from "../schema.js";
import { notFound } from "../../lib/errors.js";
import type {
  CreateSolution,
  UpdateSolutionMetadata,
} from "@mission-control/shared";

function formatDate(d: Date): string {
  return d.toISOString();
}

function rowToSolution(row: typeof solutions.$inferSelect) {
  return {
    ...row,
    createdAt: row.createdAt instanceof Date ? formatDate(row.createdAt) : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? formatDate(row.updatedAt) : String(row.updatedAt),
    reviewedAt: row.reviewedAt instanceof Date ? formatDate(row.reviewedAt) : row.reviewedAt ? String(row.reviewedAt) : null,
  };
}

export function createSolution(db: DrizzleDb, data: CreateSolution) {
  const now = new Date();
  const id = randomUUID();

  db.insert(solutions)
    .values({
      id,
      sessionId: data.sessionId ?? null,
      projectSlug: data.projectSlug ?? null,
      title: data.title,
      content: data.content,
      contentHash: data.contentHash,
      module: data.module ?? null,
      problemType: data.problemType ?? null,
      symptoms: data.symptoms ?? null,
      rootCause: data.rootCause ?? null,
      tagsJson: data.tagsJson ?? null,
      severity: data.severity ?? "medium",
      status: data.status ?? "candidate",
      referenceCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return getSolution(db, id);
}

export function getSolution(db: DrizzleDb, id: string) {
  const result = db
    .select()
    .from(solutions)
    .where(eq(solutions.id, id))
    .get();

  if (!result) {
    throw notFound(`Solution ${id} not found`);
  }

  return rowToSolution(result);
}

export function listSolutions(db: DrizzleDb, query: {
  projectSlug?: string;
  status?: "candidate" | "accepted" | "dismissed";
  problemType?: "bug_fix" | "architecture" | "performance" | "integration" | "configuration" | "testing" | "deployment";
  limit?: number;
  offset?: number;
}) {
  const conditions = [];

  if (query.projectSlug) {
    conditions.push(eq(solutions.projectSlug, query.projectSlug));
  }
  if (query.status) {
    conditions.push(eq(solutions.status, query.status));
  }
  if (query.problemType) {
    conditions.push(eq(solutions.problemType, query.problemType));
  }

  const whereClause =
    conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db
    .select()
    .from(solutions)
    .where(whereClause)
    .limit(query.limit ?? 50)
    .offset(query.offset ?? 0)
    .orderBy(desc(solutions.createdAt))
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(solutions)
    .where(whereClause)
    .get();

  return {
    solutions: rows.map(rowToSolution),
    total: countResult?.count ?? 0,
  };
}

export function updateSolutionStatus(
  db: DrizzleDb,
  id: string,
  status: "candidate" | "accepted" | "dismissed"
) {
  const now = new Date();

  // Verify solution exists
  getSolution(db, id);

  db.update(solutions)
    .set({
      status,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(solutions.id, id))
    .run();

  return getSolution(db, id);
}

export function updateSolutionMetadata(
  db: DrizzleDb,
  id: string,
  metadata: UpdateSolutionMetadata
) {
  const now = new Date();

  // Verify solution exists
  getSolution(db, id);

  const updateFields: Record<string, unknown> = { updatedAt: now };

  if (metadata.title !== undefined) updateFields["title"] = metadata.title;
  if (metadata.module !== undefined) updateFields["module"] = metadata.module;
  if (metadata.problemType !== undefined) updateFields["problemType"] = metadata.problemType;
  if (metadata.symptoms !== undefined) updateFields["symptoms"] = metadata.symptoms;
  if (metadata.rootCause !== undefined) updateFields["rootCause"] = metadata.rootCause;
  if (metadata.tagsJson !== undefined) updateFields["tagsJson"] = metadata.tagsJson;
  if (metadata.severity !== undefined) updateFields["severity"] = metadata.severity;

  db.update(solutions)
    .set(updateFields)
    .where(eq(solutions.id, id))
    .run();

  return getSolution(db, id);
}

export function solutionExistsForHash(db: DrizzleDb, contentHash: string): boolean {
  const result = db
    .select({ id: solutions.id })
    .from(solutions)
    .where(eq(solutions.contentHash, contentHash))
    .get();

  return !!result;
}

export function getRelevantSolutions(db: DrizzleDb, projectSlug: string, limit: number = 3) {
  const rows = db
    .select()
    .from(solutions)
    .where(
      and(
        eq(solutions.projectSlug, projectSlug),
        eq(solutions.status, "accepted")
      )
    )
    .orderBy(desc(solutions.referenceCount), desc(solutions.createdAt))
    .limit(limit)
    .all();

  return rows.map(rowToSolution);
}

export function recordSolutionReference(
  db: DrizzleDb,
  solutionId: string,
  sessionId: string,
  referenceType: "startup_banner" | "search_result" | "mcp_query"
) {
  const now = new Date();
  const id = randomUUID();

  db.insert(solutionReferences)
    .values({
      id,
      solutionId,
      sessionId,
      referenceType,
      createdAt: now,
    })
    .run();

  // Increment referenceCount on the solutions table
  db.update(solutions)
    .set({
      referenceCount: sql`${solutions.referenceCount} + 1`,
      updatedAt: now,
    })
    .where(eq(solutions.id, solutionId))
    .run();
}

export function getCompoundScore(db: DrizzleDb) {
  // Total accepted solutions
  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(solutions)
    .where(eq(solutions.status, "accepted"))
    .get();
  const totalSolutions = totalResult?.count ?? 0;

  // Accepted solutions
  const acceptedSolutions = totalSolutions;

  // Referenced solutions (accepted with referenceCount > 0)
  const referencedResult = db
    .select({ count: sql<number>`count(*)` })
    .from(solutions)
    .where(
      and(
        eq(solutions.status, "accepted"),
        sql`${solutions.referenceCount} > 0`
      )
    )
    .get();
  const referencedSolutions = referencedResult?.count ?? 0;

  // Total references (sum of all reference_count across accepted solutions)
  const totalRefResult = db
    .select({ total: sql<number>`COALESCE(SUM(${solutions.referenceCount}), 0)` })
    .from(solutions)
    .where(eq(solutions.status, "accepted"))
    .get();
  const totalReferences = totalRefResult?.total ?? 0;

  // Reuse rate
  const reuseRate =
    totalSolutions > 0 ? referencedSolutions / totalSolutions : 0;

  // Weekly trend: references in last 8 weeks grouped by ISO week
  // solutionReferences.createdAt is stored as integer epoch ms by Drizzle timestamp mode
  const eightWeeksAgoMs = Date.now() - 8 * 7 * 24 * 60 * 60 * 1000;
  const weeklyTrend = db
    .select({
      week: sql<string>`strftime('%Y-W%W', datetime(${solutionReferences.createdAt} / 1000, 'unixepoch'))`,
      references: sql<number>`count(*)`,
    })
    .from(solutionReferences)
    .where(
      sql`${solutionReferences.createdAt} > ${eightWeeksAgoMs}`
    )
    .groupBy(
      sql`strftime('%Y-W%W', datetime(${solutionReferences.createdAt} / 1000, 'unixepoch'))`
    )
    .orderBy(
      sql`strftime('%Y-W%W', datetime(${solutionReferences.createdAt} / 1000, 'unixepoch'))`
    )
    .all();

  return {
    totalSolutions,
    acceptedSolutions,
    referencedSolutions,
    totalReferences,
    reuseRate,
    weeklyTrend,
  };
}
