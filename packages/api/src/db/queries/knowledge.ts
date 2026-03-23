import { eq } from "drizzle-orm";
import type Database from "better-sqlite3";
import type { DrizzleDb } from "../index.js";
import { projectKnowledge } from "../schema.js";
import { indexKnowledge } from "./search.js";

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
 * Search knowledge records by content substring (case-insensitive).
 * Returns matching records with a ~200-char snippet around the first match.
 */
export function searchKnowledge(
  sqlite: Database.Database,
  query: string
): Array<{
  projectSlug: string;
  snippet: string;
  fileSize: number;
  lastModified: string;
  commitsSinceUpdate: number;
}> {
  const rows = sqlite
    .prepare(
      `SELECT project_slug, content, file_size, last_modified, commits_since_update
       FROM project_knowledge
       WHERE content LIKE '%' || ? || '%' COLLATE NOCASE`
    )
    .all(query) as Array<{
    project_slug: string;
    content: string;
    file_size: number;
    last_modified: string;
    commits_since_update: number;
  }>;

  return rows.map((row) => {
    const lowerContent = row.content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchPos = lowerContent.indexOf(lowerQuery);

    let start = Math.max(0, matchPos - 100);
    let end = Math.min(row.content.length, matchPos + lowerQuery.length + 100);

    // Trim to word boundaries
    if (start > 0) {
      const nextSpace = row.content.indexOf(" ", start);
      if (nextSpace !== -1 && nextSpace < matchPos) {
        start = nextSpace + 1;
      }
    }
    if (end < row.content.length) {
      const lastSpace = row.content.lastIndexOf(" ", end);
      if (lastSpace > matchPos + lowerQuery.length) {
        end = lastSpace;
      }
    }

    const snippet = row.content.slice(start, end);

    return {
      projectSlug: row.project_slug,
      snippet,
      fileSize: row.file_size,
      lastModified: row.last_modified,
      commitsSinceUpdate: row.commits_since_update,
    };
  });
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

  // Also index in unified FTS5 search_index for hybrid search (SRCH-06)
  indexKnowledge(sqlite, {
    projectSlug: data.projectSlug,
    content: data.content,
  });

}
