import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { fewShotExamples } from "../schema.js";

export interface CreateFewShotExample {
  captureContent: string;
  projectSlug: string;
  extractionType?: string;
  isCorrection?: boolean;
  sourceCaptureId?: string | null;
}

export function createFewShotExample(db: DrizzleDb, data: CreateFewShotExample) {
  const now = new Date();
  const id = nanoid();

  db.insert(fewShotExamples)
    .values({
      id,
      captureContent: data.captureContent,
      projectSlug: data.projectSlug,
      extractionType: (data.extractionType as "project_ref") ?? "project_ref",
      isCorrection: data.isCorrection ?? false,
      sourceCaptureId: data.sourceCaptureId ?? null,
      createdAt: now,
    })
    .run();

  return getFewShotExample(db, id);
}

export function getFewShotExample(db: DrizzleDb, id: string) {
  return db
    .select()
    .from(fewShotExamples)
    .where(eq(fewShotExamples.id, id))
    .get();
}

/**
 * Get few-shot examples for categorization prompt.
 * Returns most recent examples, prioritizing corrections (user-validated).
 * Limited to avoid bloating the prompt.
 */
export function getFewShotExamplesForCategorization(
  db: DrizzleDb,
  limit: number = 10
) {
  return db
    .select()
    .from(fewShotExamples)
    .where(eq(fewShotExamples.extractionType, "project_ref"))
    .orderBy(
      sql`${fewShotExamples.isCorrection} DESC, ${fewShotExamples.createdAt} DESC`
    )
    .limit(limit)
    .all();
}

/**
 * Get few-shot examples filtered by project slug.
 */
export function getFewShotExamplesByProject(
  db: DrizzleDb,
  projectSlug: string,
  limit: number = 5
) {
  return db
    .select()
    .from(fewShotExamples)
    .where(eq(fewShotExamples.projectSlug, projectSlug))
    .orderBy(sql`${fewShotExamples.createdAt} DESC`)
    .limit(limit)
    .all();
}

export function listFewShotExamples(db: DrizzleDb) {
  return db
    .select()
    .from(fewShotExamples)
    .orderBy(sql`${fewShotExamples.createdAt} DESC`)
    .all();
}

export function deleteFewShotExample(db: DrizzleDb, id: string) {
  db.delete(fewShotExamples).where(eq(fewShotExamples.id, id)).run();
}
