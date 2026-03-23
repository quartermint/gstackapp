import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DrizzleDb } from "../index.js";
import { captureExtractions } from "../schema.js";

export interface CreateExtraction {
  captureId: string;
  extractionType: "project_ref" | "action_item" | "idea" | "link" | "question";
  content: string;
  confidence: number;
  groundingJson?: string | null;
}

export function createExtraction(db: DrizzleDb, data: CreateExtraction) {
  const now = new Date();
  const id = nanoid();

  db.insert(captureExtractions)
    .values({
      id,
      captureId: data.captureId,
      extractionType: data.extractionType,
      content: data.content,
      confidence: data.confidence,
      groundingJson: data.groundingJson ?? null,
      createdAt: now,
    })
    .run();

  return db
    .select()
    .from(captureExtractions)
    .where(eq(captureExtractions.id, id))
    .get()!;
}

export function createExtractionsBatch(db: DrizzleDb, items: CreateExtraction[]) {
  const now = new Date();
  const results = [];

  for (const data of items) {
    const id = nanoid();
    db.insert(captureExtractions)
      .values({
        id,
        captureId: data.captureId,
        extractionType: data.extractionType,
        content: data.content,
        confidence: data.confidence,
        groundingJson: data.groundingJson ?? null,
        createdAt: now,
      })
      .run();
    results.push(id);
  }

  return results;
}

export function getExtractionsByCapture(db: DrizzleDb, captureId: string) {
  return db
    .select()
    .from(captureExtractions)
    .where(eq(captureExtractions.captureId, captureId))
    .orderBy(sql`${captureExtractions.createdAt} ASC`)
    .all();
}

export function deleteExtractionsByCapture(db: DrizzleDb, captureId: string) {
  db.delete(captureExtractions)
    .where(eq(captureExtractions.captureId, captureId))
    .run();
}
