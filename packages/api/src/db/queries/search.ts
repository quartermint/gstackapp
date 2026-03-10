import type Database from "better-sqlite3";

/**
 * Unified search result from the search_index FTS5 table.
 * Returns mixed results from captures, commits, and projects.
 */
export interface UnifiedSearchResult {
  content: string;
  snippet: string;
  sourceType: "capture" | "commit" | "project";
  sourceId: string;
  projectSlug: string | null;
  rank: number;
  createdAt: string;
}

export interface SearchOptions {
  limit?: number;
  sourceType?: "capture" | "commit" | "project";
  projectSlug?: string;
  dateAfter?: string;
  dateBefore?: string;
}

/**
 * Sanitize FTS5 query input to prevent injection.
 * Strips special FTS5 operators and wraps individual terms
 * in double quotes for safe matching.
 */
export function sanitizeFtsQuery(query: string): string {
  // Remove FTS5 special operators and syntax
  const cleaned = query
    .replace(/['"]/g, "") // Remove quotes
    .replace(/\b(AND|OR|NOT|NEAR)\b/gi, "") // Remove boolean operators
    .replace(/[{}()*^~]/g, "") // Remove special FTS5 chars
    .trim();

  if (!cleaned) {
    return '""';
  }

  // Split into terms and wrap each in double quotes for safe matching
  const terms = cleaned
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t}"`);

  return terms.join(" ");
}

/**
 * Unified full-text search across captures, commits, and projects.
 * Uses the search_index FTS5 table with BM25 ranking.
 * Returns mixed results from all source types in a single query.
 */
export function searchUnified(
  sqlite: Database.Database,
  query: string,
  options: SearchOptions = {}
): UnifiedSearchResult[] {
  const { limit = 20, sourceType, projectSlug, dateAfter, dateBefore } = options;
  const sanitized = sanitizeFtsQuery(query);

  // Build dynamic WHERE clause
  const conditions: string[] = ["search_index MATCH ?"];
  const params: (string | number)[] = [sanitized];

  if (sourceType) {
    conditions.push("source_type = ?");
    params.push(sourceType);
  }

  if (projectSlug) {
    conditions.push("project_slug = ?");
    params.push(projectSlug);
  }

  if (dateAfter) {
    conditions.push("created_at >= ?");
    params.push(dateAfter);
  }

  if (dateBefore) {
    conditions.push("created_at <= ?");
    params.push(dateBefore);
  }

  params.push(limit);

  const whereClause = conditions.join(" AND ");

  const stmt = sqlite.prepare(`
    SELECT
      content,
      source_type AS sourceType,
      source_id AS sourceId,
      project_slug AS projectSlug,
      created_at AS createdAt,
      snippet(search_index, 0, '<mark>', '</mark>', '...', 10) AS snippet,
      bm25(search_index) AS rank
    FROM search_index
    WHERE ${whereClause}
    ORDER BY rank
    LIMIT ?
  `);

  const rows = stmt.all(...params) as Array<{
    content: string;
    sourceType: string;
    sourceId: string;
    projectSlug: string | null;
    createdAt: string;
    snippet: string | null;
    rank: number;
  }>;

  return rows.map((row) => ({
    content: row.content,
    snippet: truncateSnippet(row.snippet ?? row.content, 120),
    sourceType: row.sourceType as "capture" | "commit" | "project",
    sourceId: row.sourceId,
    projectSlug: row.projectSlug,
    rank: row.rank,
    createdAt: String(row.createdAt ?? ""),
  }));
}

/**
 * Index a capture in the unified search_index.
 */
export function indexCapture(
  sqlite: Database.Database,
  capture: { id: string; rawContent: string; projectId: string | null; createdAt: string }
): void {
  sqlite
    .prepare(
      `INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
       VALUES (?, 'capture', ?, ?, ?)`
    )
    .run(capture.rawContent, capture.id, capture.projectId, capture.createdAt);
}

/**
 * Remove a capture from the unified search_index.
 */
export function deindexCapture(
  sqlite: Database.Database,
  captureId: string
): void {
  sqlite
    .prepare(
      `DELETE FROM search_index WHERE source_type = 'capture' AND source_id = ?`
    )
    .run(captureId);
}

/**
 * Index a project in the unified search_index.
 * Replaces any existing entry for this project slug.
 */
export function indexProject(
  sqlite: Database.Database,
  project: { slug: string; name: string; tagline: string | null; createdAt: string }
): void {
  const content = project.name + " " + (project.tagline ?? "");
  sqlite
    .prepare(
      `DELETE FROM search_index WHERE source_type = 'project' AND source_id = ?`
    )
    .run(project.slug);
  sqlite
    .prepare(
      `INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
       VALUES (?, 'project', ?, ?, ?)`
    )
    .run(content, project.slug, project.slug, project.createdAt);
}

/**
 * Index a commit in the unified search_index.
 * Replaces any existing entry for this commit ID.
 */
export function indexCommit(
  sqlite: Database.Database,
  commit: { id: string; message: string; projectSlug: string; authorDate: string }
): void {
  sqlite
    .prepare(
      `DELETE FROM search_index WHERE source_type = 'commit' AND source_id = ?`
    )
    .run(commit.id);
  sqlite
    .prepare(
      `INSERT INTO search_index(content, source_type, source_id, project_slug, created_at)
       VALUES (?, 'commit', ?, ?, ?)`
    )
    .run(commit.message, commit.id, commit.projectSlug, commit.authorDate);
}

/**
 * Truncate a snippet to a maximum character length, preserving HTML tags.
 */
function truncateSnippet(snippet: string, maxLen: number): string {
  if (!snippet) return "";
  if (snippet.length <= maxLen) return snippet;
  return snippet.slice(0, maxLen) + "...";
}

// ---- Deprecated ----

export interface SearchResult {
  id: string;
  rawContent: string;
  type: string;
  projectId: string | null;
  rank: number;
  createdAt: number;
}

/**
 * @deprecated Use searchUnified instead. Will be removed after route migration in Plan 02.
 * Full-text search across captures using FTS5 with BM25 ranking.
 */
export function searchCaptures(
  sqlite: Database.Database,
  query: string,
  limit = 20
): SearchResult[] {
  // Bridge to unified search, mapping back to old shape
  const results = searchUnified(sqlite, query, {
    limit,
    sourceType: "capture",
  });

  return results.map((r) => ({
    id: r.sourceId,
    rawContent: r.content,
    type: "text",
    projectId: r.projectSlug,
    rank: r.rank,
    createdAt: typeof r.createdAt === "string" ? parseInt(r.createdAt, 10) || 0 : 0,
  }));
}
