import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type Database from "better-sqlite3";
import type { DrizzleDb } from "../index.js";
import { commits } from "../schema.js";

export interface CommitInput {
  hash: string;
  message: string;
  projectSlug: string;
  authorDate: string;
}

/**
 * Upsert commits for a project. Uses INSERT OR REPLACE on the
 * unique (project_slug, hash) constraint for deduplication.
 * Also indexes each commit in the unified search_index FTS5 table.
 */
export function upsertCommits(
  _db: DrizzleDb,
  sqlite: Database.Database,
  commitInputs: CommitInput[]
): void {
  if (commitInputs.length === 0) return;

  const now = new Date();

  // Use raw SQL for INSERT OR REPLACE since Drizzle's onConflictDoUpdate
  // doesn't support composite unique indexes well for this pattern
  const upsertStmt = sqlite.prepare(`
    INSERT INTO commits (id, hash, message, project_slug, author_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(project_slug, hash) DO UPDATE SET
      message = excluded.message,
      author_date = excluded.author_date
  `);

  // For search indexing: delete old entry then insert new
  const deleteSearchStmt = sqlite.prepare(`
    DELETE FROM search_index WHERE source_type = 'commit' AND source_id = (
      SELECT id FROM commits WHERE project_slug = ? AND hash = ?
    )
  `);

  const insertSearchStmt = sqlite.prepare(`
    INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
    VALUES (?, 'commit', ?, ?, ?)
  `);

  const transaction = sqlite.transaction(() => {
    for (const commit of commitInputs) {
      // Check if commit exists to get its ID for search index update
      const existing = sqlite
        .prepare(
          "SELECT id FROM commits WHERE project_slug = ? AND hash = ?"
        )
        .get(commit.projectSlug, commit.hash) as
        | { id: string }
        | undefined;

      const id = existing?.id ?? nanoid();

      // Delete existing search index entry if updating
      if (existing) {
        deleteSearchStmt.run(commit.projectSlug, commit.hash);
      }

      // Upsert the commit record
      upsertStmt.run(
        id,
        commit.hash,
        commit.message,
        commit.projectSlug,
        commit.authorDate,
        Math.floor(now.getTime() / 1000)
      );

      // Insert into search index
      insertSearchStmt.run(
        commit.message,
        id,
        commit.projectSlug,
        commit.authorDate
      );
    }
  });

  transaction();
}

/**
 * Get commits for a project, ordered by author_date descending.
 */
export function getCommitsByProject(
  db: DrizzleDb,
  projectSlug: string,
  limit = 50
) {
  return db
    .select()
    .from(commits)
    .where(eq(commits.projectSlug, projectSlug))
    .orderBy(sql`${commits.authorDate} DESC`)
    .limit(limit)
    .all();
}
