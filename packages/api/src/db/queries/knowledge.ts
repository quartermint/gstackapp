import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { DrizzleDb } from "../index.js";
import { projectKnowledge } from "../schema.js";

/**
 * Get a single knowledge record by project slug.
 * Returns the full record including content, or null if not found.
 */
export function getKnowledge(
  db: DrizzleDb,
  slug: string
): {
  projectSlug: string;
  content: string;
  contentHash: string;
  fileSize: number;
  lastModified: string;
  commitsSinceUpdate: number;
  lastScannedAt: string;
  createdAt: string;
  updatedAt: string;
} | null {
  const row = db
    .select()
    .from(projectKnowledge)
    .where(eq(projectKnowledge.projectSlug, slug))
    .get();

  return row ?? null;
}

/**
 * Get all knowledge records WITH content (for convention scanning).
 * Returns full records including CLAUDE.md content.
 */
export function getAllKnowledgeWithContent(
  db: DrizzleDb
): Array<{
  projectSlug: string;
  content: string;
  contentHash: string;
  fileSize: number;
  lastModified: string;
  commitsSinceUpdate: number;
  lastScannedAt: string;
  createdAt: string;
  updatedAt: string;
}> {
  return db.select().from(projectKnowledge).all();
}

/**
 * Get all knowledge records without the content field (for list endpoint).
 * Returns an array of metadata-only records.
 */
export function getAllKnowledge(
  db: DrizzleDb
): Array<{
  projectSlug: string;
  contentHash: string;
  fileSize: number;
  lastModified: string;
  commitsSinceUpdate: number;
  lastScannedAt: string;
  createdAt: string;
  updatedAt: string;
}> {
  const rows = db
    .select({
      projectSlug: projectKnowledge.projectSlug,
      contentHash: projectKnowledge.contentHash,
      fileSize: projectKnowledge.fileSize,
      lastModified: projectKnowledge.lastModified,
      commitsSinceUpdate: projectKnowledge.commitsSinceUpdate,
      lastScannedAt: projectKnowledge.lastScannedAt,
      createdAt: projectKnowledge.createdAt,
      updatedAt: projectKnowledge.updatedAt,
    })
    .from(projectKnowledge)
    .all();

  return rows;
}

/**
 * Upsert a knowledge record using raw sqlite for atomic INSERT OR REPLACE.
 * Uses COALESCE to preserve original createdAt on update.
 */
export function upsertKnowledge(
  sqlite: Database.Database,
  data: {
    projectSlug: string;
    content: string;
    contentHash: string;
    fileSize: number;
    lastModified: string;
    commitsSinceUpdate: number;
  }
): void {
  const now = new Date().toISOString();

  sqlite
    .prepare(
      `INSERT INTO project_knowledge (
        project_slug, content, content_hash, file_size, last_modified,
        commits_since_update, last_scanned_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_slug) DO UPDATE SET
        content = excluded.content,
        content_hash = excluded.content_hash,
        file_size = excluded.file_size,
        last_modified = excluded.last_modified,
        commits_since_update = excluded.commits_since_update,
        last_scanned_at = excluded.last_scanned_at,
        updated_at = excluded.updated_at`
    )
    .run(
      data.projectSlug,
      data.content,
      data.contentHash,
      data.fileSize,
      data.lastModified,
      data.commitsSinceUpdate,
      now,
      now,
      now
    );
}
